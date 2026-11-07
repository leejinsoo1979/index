import { basename, extname } from '../path';
import { prisma, type Prisma } from '@archi/db';
import { chunkText, cosineSimilarity, MockEmbeddingProvider } from '@archi/knowledge';
import { sanitizeUntrustedText } from '@archi/security';
import { AppError, Capabilities, ErrorCodes } from '@archi/shared';
import { z } from 'zod';
import { requireWorkspaceCapability } from '../authz';
import { writeAuditLog } from '../audit';
import { readStorageFile, saveStorageFile } from '../storage';

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB
const ALLOWED_EXTENSIONS = ['.pdf', '.txt', '.md'];

const embeddingProvider = new MockEmbeddingProvider();

export async function uploadKnowledgeSource(
  userId: string,
  input: { workspaceId: string; title?: string; filename: string; data: Uint8Array },
) {
  await requireWorkspaceCapability(userId, input.workspaceId, Capabilities.EDIT_DOCUMENTS);

  const ext = extname(input.filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: 'PDF, TXT, MD 파일만 업로드할 수 있습니다.',
    });
  }
  if (input.data.length === 0 || input.data.length > MAX_FILE_BYTES) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: '파일 크기는 1byte 이상 20MB 이하여야 합니다.',
    });
  }

  const source = await prisma.knowledgeSource.create({
    data: {
      workspaceId: input.workspaceId,
      title: input.title?.trim() || input.filename,
      sourceType: 'FILE',
      status: 'PENDING_PROCESSING',
    },
  });
  const safeName = basename(input.filename).replace(/[^\w.\-가-힣]/g, '_');
  const fileKey = `kb/${source.id}/${safeName}`;
  await saveStorageFile(fileKey, input.data);
  const updated = await prisma.knowledgeSource.update({
    where: { id: source.id },
    data: { fileKey },
  });

  await writeAuditLog({
    actorId: userId,
    action: 'knowledge_source.upload',
    targetType: 'KnowledgeSource',
    targetId: source.id,
    after: { title: updated.title, fileKey },
  });
  return updated;
}

export async function extractKnowledgeText(data: Uint8Array, fileKey: string): Promise<string> {
  const ext = extname(fileKey).toLowerCase();
  if (ext === '.txt' || ext === '.md') {
    return new TextDecoder('utf-8').decode(data);
  }
  if (ext === '.pdf') {
    const [{ PDFParse }, { default: workerUrl }] = await Promise.all([
      import('pdf-parse'),
      // pdf.js worker matching pdf-parse's bundled pdf.js (5.4.296); served by Vite as an asset.
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);
    PDFParse.setWorker(workerUrl);
    const parser = new PDFParse({ data: new Uint8Array(data) });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }
  throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: '지원하지 않는 파일 형식입니다.' });
}

/** 텍스트 추출 → chunking → embedding → PENDING_REVIEW */
export async function processKnowledgeSource(userId: string, sourceId: string) {
  const source = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!source) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: '지식 소스를 찾을 수 없습니다.' });
  }
  await requireWorkspaceCapability(userId, source.workspaceId, Capabilities.EDIT_DOCUMENTS);
  if (!source.fileKey) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: '업로드된 파일이 없습니다.' });
  }

  await prisma.knowledgeSource.update({
    where: { id: sourceId },
    data: { status: 'PROCESSING', error: null },
  });

  try {
    const data = await readStorageFile(source.fileKey);
    const text = await extractKnowledgeText(data, source.fileKey);
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      throw new Error('문서에서 텍스트를 추출하지 못했습니다.');
    }
    const vectors = await embeddingProvider.embed(chunks.map((c) => c.text));

    await prisma.$transaction([
      prisma.knowledgeChunk.deleteMany({ where: { sourceId } }),
      ...chunks.map((chunk, i) =>
        prisma.knowledgeChunk.create({
          data: {
            sourceId,
            text: chunk.text,
            chunkIndex: chunk.chunkIndex,
            section: chunk.section,
            tokenCount: Math.ceil(chunk.text.length / 2),
            embedding: vectors[i] as Prisma.InputJsonValue,
          },
        }),
      ),
      prisma.knowledgeSource.update({
        where: { id: sourceId },
        data: { status: 'PENDING_REVIEW' },
      }),
    ]);

    await writeAuditLog({
      actorId: userId,
      action: 'knowledge_source.process',
      targetType: 'KnowledgeSource',
      targetId: sourceId,
      after: { chunkCount: chunks.length, status: 'PENDING_REVIEW' },
    });

    // 온톨로지 후보 자동 추출 (ARCHITECTURE.md 5.3 파이프라인). 실패해도 처리 자체는 성공으로 둔다.
    try {
      const { extractFromKnowledgeSource } = await import('./ontology');
      await extractFromKnowledgeSource(userId, sourceId);
    } catch (error) {
      console.warn('[knowledge] 온톨로지 자동 추출 실패:', error);
    }

    return { sourceId, chunkCount: chunks.length, status: 'PENDING_REVIEW' as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: 'FAILED', error: message },
    });
    throw new AppError(ErrorCodes.INTERNAL_ERROR, {
      message: `지식 소스 처리에 실패했습니다: ${message}`,
    });
  }
}

/** 소스 승인. 자동 승인 금지 — APPROVE_KNOWLEDGE 권한자만 가능 (CLAUDE.md 규칙 8) */
export async function approveKnowledgeSource(userId: string, sourceId: string) {
  const source = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!source) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: '지식 소스를 찾을 수 없습니다.' });
  }
  await requireWorkspaceCapability(userId, source.workspaceId, Capabilities.APPROVE_KNOWLEDGE);
  if (source.status !== 'PENDING_REVIEW') {
    throw new AppError(ErrorCodes.CONFLICT, {
      message: '검토 대기 상태의 소스만 승인할 수 있습니다.',
      details: { status: source.status },
    });
  }
  const approved = await prisma.knowledgeSource.update({
    where: { id: sourceId },
    data: { status: 'APPROVED', trustLevel: 'INTERNAL_APPROVED' },
  });
  await writeAuditLog({
    actorId: userId,
    action: 'knowledge_source.approve',
    targetType: 'KnowledgeSource',
    targetId: sourceId,
    before: { status: source.status },
    after: { status: approved.status },
  });
  return approved;
}

export async function listKnowledgeSources(userId: string, workspaceId: string) {
  await requireWorkspaceCapability(userId, workspaceId, Capabilities.VIEW_DOCUMENTS);
  return prisma.knowledgeSource.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { chunks: true } } },
  });
}

export async function listKnowledgeChunks(userId: string, sourceId: string) {
  const source = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!source) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: '지식 소스를 찾을 수 없습니다.' });
  }
  await requireWorkspaceCapability(userId, source.workspaceId, Capabilities.VIEW_DOCUMENTS);
  return prisma.knowledgeChunk.findMany({
    where: { sourceId },
    orderBy: { chunkIndex: 'asc' },
    select: { id: true, chunkIndex: true, text: true, section: true, tokenCount: true },
  });
}

export const kbQuerySchema = z.object({
  workspaceId: z.string().min(1),
  query: z.string().min(1, '질문을 입력해 주세요.').max(1000),
  topK: z.number().int().min(1).max(10).default(3),
});

/**
 * KB 질의: approved 소스의 chunk만 기본 검색에 사용한다.
 * pending_review 소스는 결과에 포함되지 않는다.
 */
export async function queryKnowledgeBase(userId: string, input: z.infer<typeof kbQuerySchema>) {
  await requireWorkspaceCapability(userId, input.workspaceId, Capabilities.VIEW_DOCUMENTS);

  const [queryVector] = await embeddingProvider.embed([input.query]);
  const chunks = await prisma.knowledgeChunk.findMany({
    where: { source: { workspaceId: input.workspaceId, status: 'APPROVED' } },
    include: { source: { select: { id: true, title: true, trustLevel: true } } },
  });

  const scored = chunks
    .map((chunk) => ({
      chunk,
      score: Array.isArray(chunk.embedding)
        ? cosineSimilarity(queryVector!, chunk.embedding as number[])
        : 0,
    }))
    .filter((s) => s.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, input.topK);

  if (scored.length === 0) {
    return {
      answer:
        '지식베이스에서 관련 내용을 찾지 못했습니다. 소스가 승인되어 있는지 확인하거나, 질문을 바꿔서 시도해 주세요.',
      citations: [],
    };
  }

  // 업로드 문서 본문은 신뢰할 수 없는 입력 — 응답 조립 전 injection 필터 적용
  const top = scored[0]!;
  const topText = sanitizeUntrustedText(top.chunk.text);
  const answer = `지식베이스 기준으로 가장 관련성 높은 내용입니다:\n\n${topText.slice(0, 400)}${
    topText.length > 400 ? '…' : ''
  }`;

  return {
    answer,
    citations: scored.map((s) => ({
      sourceId: s.chunk.source.id,
      chunkId: s.chunk.id,
      title: sanitizeUntrustedText(s.chunk.source.title),
      section: s.chunk.section,
      quote: sanitizeUntrustedText(s.chunk.text).slice(0, 200),
      score: Number(s.score.toFixed(4)),
    })),
  };
}
