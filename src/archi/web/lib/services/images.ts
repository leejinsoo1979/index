import { prisma } from '@archi/db';
import { MockImageProvider, type ImageProvider } from '@archi/image';
import { AppError, Capabilities, ErrorCodes } from '@archi/shared';
import { z } from 'zod';
import { requireProjectCapability, requireWorkspaceCapability } from '../authz';
import { writeAuditLog } from '../audit';
import { ProxyImageProvider } from '../proxy-providers';
import { getServerStatus } from '../server-proxy';
import { readStorageFile, saveStorageFile, storageFileUrl, storageRemoteUrl } from '../storage';

/** URL stored in documents: durable Firebase URL when available, else a session blob URL. */
async function imageUrl(fileKey: string): Promise<string> {
  return (await storageRemoteUrl(fileKey)) ?? (await storageFileUrl(fileKey));
}

export const generateImageSchema = z.object({
  projectId: z.string().min(1),
  prompt: z.string().min(1, '이미지 프롬프트를 입력해 주세요.').max(2000),
  style: z.string().max(100).optional(),
  size: z
    .string()
    .regex(/^\d{2,4}x\d{2,4}$/, '크기는 1024x1024 형식으로 입력해 주세요.')
    .optional(),
  count: z.number().int().min(1).max(4).optional(),
});

/**
 * 워크스페이스에 OpenAI 키가 등록돼 있으면 실제 이미지 생성(gpt-image-1)을 쓰고,
 * 없으면 mock(SVG 플레이스홀더)으로 폴백한다.
 */
async function getImageProvider(workspaceId: string): Promise<ImageProvider> {
  const config = await prisma.llmProviderConfig.findFirst({
    where: { workspaceId, provider: 'openai', isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  if (config?.encryptedApiKey) {
    return new ProxyImageProvider({
      provider: 'openai',
      baseUrl: config.baseUrl ?? undefined,
      encryptedApiKey: config.encryptedApiKey,
    });
  }
  // 등록 키가 없으면 서버 환경변수 OpenAI 키, 그것도 없으면 mock(SVG)
  const status = await getServerStatus();
  if (status.available && status.serverProviders.openai) return new ProxyImageProvider({ provider: 'openai' });
  return new MockImageProvider();
}

/** 이미지 생성: ImageAsset + ImageVersion 생성, prompt/model 메타데이터 저장 */
export async function generateImage(userId: string, input: z.infer<typeof generateImageSchema>) {
  const { workspaceId } = await requireProjectCapability(
    userId,
    input.projectId,
    Capabilities.GENERATE_IMAGES,
  );

  const provider = await getImageProvider(workspaceId);
  const result = await provider.generate({
    prompt: input.prompt,
    style: input.style,
    size: input.size,
    count: input.count,
  });

  const asset = await prisma.imageAsset.create({
    data: {
      workspaceId,
      projectId: input.projectId,
      title: input.prompt.slice(0, 100),
      source: 'GENERATED',
    },
  });

  const versions = [];
  for (const image of result.images) {
    const version = await prisma.imageVersion.create({
      data: {
        imageAssetId: asset.id,
        fileKey: '',
        mimeType: image.mimeType,
        prompt: input.prompt,
        provider: result.provider,
        model: result.model,
        width: image.width,
        height: image.height,
      },
    });
    const ext = image.mimeType === 'image/svg+xml' ? 'svg' : 'png';
    const fileKey = `images/${asset.id}/${version.id}.${ext}`;
    await saveStorageFile(fileKey, image.data);
    versions.push(
      await prisma.imageVersion.update({ where: { id: version.id }, data: { fileKey } }),
    );
  }

  await writeAuditLog({
    actorId: userId,
    action: 'image.generate',
    targetType: 'ImageAsset',
    targetId: asset.id,
    after: { prompt: input.prompt, provider: result.provider, model: result.model },
  });

  return {
    imageAssetId: asset.id,
    versions: await Promise.all(versions.map(async (v) => ({
      id: v.id,
      url: await imageUrl(v.fileKey),
      width: v.width,
      height: v.height,
      prompt: v.prompt,
      provider: v.provider,
      model: v.model,
    }))),
  };
}

/** 이미지 파일 서빙 (workspace 권한 검증 포함) */
export async function getImageVersionFile(userId: string, versionId: string) {
  const version = await prisma.imageVersion.findUnique({
    where: { id: versionId },
    include: { imageAsset: true },
  });
  if (!version || !version.fileKey) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: '이미지를 찾을 수 없습니다.' });
  }
  await requireWorkspaceCapability(
    userId,
    version.imageAsset.workspaceId,
    Capabilities.VIEW_DOCUMENTS,
  );
  const data = await readStorageFile(version.fileKey);
  return { data, mimeType: version.mimeType ?? 'application/octet-stream' };
}

export const inpaintImageSchema = z.object({
  imageAssetId: z.string().min(1),
  baseVersionId: z.string().min(1),
  prompt: z.string().min(1, '수정할 내용을 입력해 주세요.').max(2000),
  /** data URL (image/png) 형식의 마스크. 선택 */
  maskDataUrl: z
    .string()
    .regex(/^data:image\/(png|webp);base64,/, '마스크는 PNG data URL이어야 합니다.')
    .optional(),
  /** 지정 시 해당 문서 이미지 블록을 새 버전으로 교체 */
  replaceBlockId: z.string().optional(),
});

/**
 * 인페인트: 원본 ImageVersion은 절대 수정하지 않고 새 버전을 추가한다 (CLAUDE.md 규칙 7).
 */
export async function inpaintImage(userId: string, input: z.infer<typeof inpaintImageSchema>) {
  const baseVersion = await prisma.imageVersion.findFirst({
    where: { id: input.baseVersionId, imageAssetId: input.imageAssetId },
    include: { imageAsset: true },
  });
  if (!baseVersion || !baseVersion.fileKey) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: '원본 이미지를 찾을 수 없습니다.' });
  }
  await requireWorkspaceCapability(
    userId,
    baseVersion.imageAsset.workspaceId,
    Capabilities.GENERATE_IMAGES,
  );

  // Prefer the durable URL (the server fetches it) so older images don't need bucket CORS.
  const baseImageUrl = (await storageRemoteUrl(baseVersion.fileKey)) ?? undefined;
  const baseData = baseImageUrl ? new Uint8Array() : await readStorageFile(baseVersion.fileKey);

  let maskBytes: Uint8Array | undefined;
  if (input.maskDataUrl) {
    const base64 = input.maskDataUrl.split(',')[1] ?? '';
    maskBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  }

  const provider = await getImageProvider(baseVersion.imageAsset.workspaceId);
  const size =
    baseVersion.width && baseVersion.height
      ? `${baseVersion.width}x${baseVersion.height}`
      : undefined;
  const result = await provider.inpaint({
    baseImage: new Uint8Array(baseData),
    baseImageUrl,
    baseMimeType: baseVersion.mimeType ?? 'image/png',
    mask: maskBytes,
    prompt: input.prompt,
    size,
  });

  const version = await prisma.imageVersion.create({
    data: {
      imageAssetId: input.imageAssetId,
      fileKey: '',
      mimeType: result.image.mimeType,
      prompt: input.prompt,
      provider: result.provider,
      model: result.model,
      width: result.image.width,
      height: result.image.height,
    },
  });
  const ext = result.image.mimeType === 'image/svg+xml' ? 'svg' : 'png';
  const fileKey = `images/${input.imageAssetId}/${version.id}.${ext}`;
  await saveStorageFile(fileKey, result.image.data);

  let maskFileKey: string | undefined;
  if (maskBytes) {
    maskFileKey = `images/${input.imageAssetId}/${version.id}.mask.png`;
    await saveStorageFile(maskFileKey, maskBytes);
  }

  const saved = await prisma.imageVersion.update({
    where: { id: version.id },
    data: { fileKey, maskFileKey },
  });

  // 문서 블록 교체 (선택): content의 versionId/url만 교체하고 원본 정보는 유지
  let replacedBlockId: string | null = null;
  if (input.replaceBlockId) {
    const { updateBlock } = await import('./blocks');
    const block = await prisma.documentBlock.findUnique({ where: { id: input.replaceBlockId } });
    if (block && block.type === 'image') {
      const content = block.content as Record<string, unknown>;
      await updateBlock(userId, block.id, {
        content: {
          ...content,
          imageAssetId: input.imageAssetId,
          versionId: saved.id,
          url: await imageUrl(saved.fileKey),
        },
      });
      replacedBlockId = block.id;
    }
  }

  await writeAuditLog({
    actorId: userId,
    action: 'image.inpaint',
    targetType: 'ImageVersion',
    targetId: saved.id,
    after: {
      baseVersionId: input.baseVersionId,
      prompt: input.prompt,
      provider: result.provider,
      replacedBlockId,
    },
  });

  return {
    version: {
      id: saved.id,
      url: await imageUrl(saved.fileKey),
      width: saved.width,
      height: saved.height,
      prompt: saved.prompt,
    },
    replacedBlockId,
  };
}

export async function getImageAsset(userId: string, assetId: string) {
  const asset = await prisma.imageAsset.findUnique({
    where: { id: assetId },
    include: { versions: { orderBy: { createdAt: 'asc' } } },
  });
  if (!asset) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: '이미지를 찾을 수 없습니다.' });
  }
  await requireWorkspaceCapability(userId, asset.workspaceId, Capabilities.VIEW_DOCUMENTS);
  return asset;
}
