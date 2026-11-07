import { prisma } from '@archi/db';
import { MockLlmProvider, type LlmProvider } from '@archi/ai';
import { AppError, Capabilities, ErrorCodes } from '@archi/shared';
import { z } from 'zod';
import { requireDocumentCapability, requireWorkspaceCapability } from '../authz';
import { writeAuditLog } from '../audit';
import { encryptSecret, maskSecret } from '../crypto';
import { FALLBACK_MODELS } from '../llm-models';
import { ProxyLlmProvider, type ProxyTarget } from '../proxy-providers';
import { callArchiServer, getServerStatus } from '../server-proxy';

// DeepSeek first: the same server key the home INDEX AI uses (CHAT_AI_PROVIDER=deepseek).
const PROXY_PROVIDERS = ['deepseek', 'openai', 'anthropic', 'google', 'grok'] as const;
const isProxyProvider = (p: string): p is ProxyTarget['provider'] =>
  (PROXY_PROVIDERS as readonly string[]).includes(p);

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  google: 'Gemini',
  grok: 'Grok',
  anthropic: 'Claude',
  deepseek: 'DeepSeek',
};

/**
 * 채팅 패널용: 현재 활성 모델과, 등록된 모든 provider/모델 후보를 반환한다 (커서 스타일 셀렉터).
 * 문서 조회 권한만 있으면 볼 수 있다(편집자도 모델 확인 가능).
 */
export async function getChatModelOptions(userId: string, documentId: string) {
  const { workspaceId } = await requireDocumentCapability(
    userId,
    documentId,
    Capabilities.VIEW_DOCUMENTS,
  );
  const configs = await prisma.llmProviderConfig.findMany({
    where: { workspaceId, provider: { in: ['openai', 'google', 'grok', 'anthropic'] } },
    orderBy: { createdAt: 'desc' },
  });
  const active = configs.find((c) => c.isActive) ?? configs[0] ?? null;
  const serverDefault = configs.length === 0 ? await serverDefaultTarget() : null;
  return {
    workspaceId,
    active: active
      ? { configId: active.id, provider: active.provider, model: active.model }
      : null,
    options: configs.map((c) => ({
      configId: c.id,
      provider: c.provider,
      providerLabel: PROVIDER_LABELS[c.provider] ?? c.provider,
      model: c.model,
      authType: c.authType,
    })),
    /** 등록된 LLM이 없을 때 쓰는 서버 기본 모델 (홈 INDEX AI와 같은 키) */
    serverDefault: serverDefault
      ? { provider: serverDefault.provider, providerLabel: PROVIDER_LABELS[serverDefault.provider] ?? serverDefault.provider, model: serverDefault.model ?? null }
      : null,
    /** 등록된 LLM도, 서버 기본 키도 없으면 mock 안내용 */
    isMock: configs.length === 0 && !serverDefault,
  };
}

export const setChatModelSchema = z.object({
  configId: z.string().min(1),
  model: z.string().min(1).max(100),
});

/** 채팅 셀렉터에서 모델 변경. 해당 config의 model을 갱신하고 활성화한다 (관리자 전용) */
export async function setChatModel(
  userId: string,
  documentId: string,
  input: z.infer<typeof setChatModelSchema>,
) {
  const { workspaceId } = await requireDocumentCapability(
    userId,
    documentId,
    Capabilities.MANAGE_LLM_PROVIDERS,
  );
  const config = await prisma.llmProviderConfig.findFirst({
    where: { id: input.configId, workspaceId },
  });
  if (!config) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: 'LLM 설정을 찾을 수 없습니다.' });
  }
  // 선택한 config만 활성화 (한 워크스페이스에 여러 provider가 있을 때 전환)
  await prisma.$transaction([
    prisma.llmProviderConfig.updateMany({
      where: { workspaceId, id: { not: config.id } },
      data: { isActive: false },
    }),
    prisma.llmProviderConfig.update({
      where: { id: config.id },
      data: { model: input.model, isActive: true },
    }),
  ]);
  return { provider: config.provider, model: input.model };
}

// 지원 provider: OpenAI, Anthropic(Claude), Google(Gemini), Grok(xAI).
export const registerLlmConfigSchema = z.object({
  workspaceId: z.string().min(1),
  provider: z.enum(['openai', 'anthropic', 'google', 'grok', 'custom']),
  apiKey: z.string().min(8, 'API 키를 입력해 주세요.').max(500),
  model: z.string().max(100).optional(),
  baseUrl: z.string().url('올바른 URL을 입력해 주세요.').optional(),
});

/** LLM API 등록. 관리자(OWNER/ADMIN)만 가능. 키는 AES-256-GCM으로 암호화 저장 */
export async function registerLlmConfig(
  userId: string,
  input: z.infer<typeof registerLlmConfigSchema>,
) {
  await requireWorkspaceCapability(userId, input.workspaceId, Capabilities.MANAGE_LLM_PROVIDERS);

  // 같은 provider 기존 설정은 교체 (워크스페이스당 provider별 1개)
  await prisma.llmProviderConfig.deleteMany({
    where: { workspaceId: input.workspaceId, provider: input.provider },
  });
  const config = await prisma.llmProviderConfig.create({
    data: {
      workspaceId: input.workspaceId,
      provider: input.provider,
      authType: 'api_key',
      model: input.model,
      baseUrl: input.baseUrl,
      encryptedApiKey: await encryptSecret(input.apiKey),
      apiKeyHint: maskSecret(input.apiKey),
      isActive: true,
    },
  });
  await writeAuditLog({
    actorId: userId,
    action: 'llm_config.register',
    targetType: 'LlmProviderConfig',
    targetId: config.id,
    after: { provider: config.provider, model: config.model },
  });
  return toSafeConfig(config);
}

export async function listLlmConfigs(userId: string, workspaceId: string) {
  await requireWorkspaceCapability(userId, workspaceId, Capabilities.MANAGE_LLM_PROVIDERS);
  const configs = await prisma.llmProviderConfig.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
  });
  return configs.map((c) => toSafeConfig(c));
}

export async function deleteLlmConfig(userId: string, configId: string) {
  const config = await prisma.llmProviderConfig.findUnique({ where: { id: configId } });
  if (!config) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: 'LLM 설정을 찾을 수 없습니다.' });
  }
  await requireWorkspaceCapability(userId, config.workspaceId, Capabilities.MANAGE_LLM_PROVIDERS);
  await prisma.llmProviderConfig.delete({ where: { id: configId } });
  await writeAuditLog({
    actorId: userId,
    action: 'llm_config.delete',
    targetType: 'LlmProviderConfig',
    targetId: configId,
    before: { provider: config.provider },
  });
  return { deleted: true };
}

/** API 키/토큰은 절대 원문으로 반환하지 않는다 */
function toSafeConfig(
  config: {
    id: string;
    provider: string;
    authType: string;
    model: string | null;
    baseUrl: string | null;
    isActive: boolean;
    createdAt: Date;
    apiKeyHint: string | null;
  },
) {
  return {
    id: config.id,
    provider: config.provider,
    authType: config.authType,
    model: config.model,
    baseUrl: config.baseUrl,
    isActive: config.isActive,
    maskedApiKey: config.apiKeyHint ?? '••••',
    createdAt: config.createdAt,
  };
}

// ─── 사용 가능한 모델 목록 (provider API에서 실시간 조회) ────────────────────

/**
 * 등록된 키로 provider의 모델 목록을 실시간 조회한다.
 * 키가 없거나 호출 실패 시 폴백 목록을 반환한다. (하드코딩 최소화)
 */
export async function listAvailableModels(
  userId: string,
  workspaceId: string,
  provider: 'openai' | 'anthropic' | 'google' | 'grok',
): Promise<{ models: string[]; live: boolean }> {
  await requireWorkspaceCapability(userId, workspaceId, Capabilities.MANAGE_LLM_PROVIDERS);
  const config = await prisma.llmProviderConfig.findFirst({
    where: { workspaceId, provider },
  });
  try {
    const { models } = await callArchiServer<{ models: string[] }>('models', {
      target: {
        provider,
        baseUrl: config?.baseUrl ?? undefined,
        encryptedApiKey: config?.encryptedApiKey ?? undefined,
      },
    });
    return models.length > 0
      ? { models, live: true }
      : { models: FALLBACK_MODELS[provider] ?? [], live: false };
  } catch {
    return { models: FALLBACK_MODELS[provider] ?? [], live: false };
  }
}

/**
 * 워크스페이스에 등록된 LLM provider 반환. 없으면 mock.
 * 에이전트는 이 함수를 통해서만 LLM에 접근한다 (provider lock-in 방지).
 */
export async function getLlmProviderForWorkspace(workspaceId: string): Promise<LlmProvider> {
  const config = await prisma.llmProviderConfig.findFirst({
    where: { workspaceId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!config) {
    // 등록된 키가 없으면 서버 기본 키(Vercel 환경변수)로, 그것도 없으면 mock.
    const fallback = await serverDefaultTarget();
    return fallback ? new ProxyLlmProvider(fallback) : new MockLlmProvider();
  }
  if (!config.encryptedApiKey || !isProxyProvider(config.provider)) {
    // custom 등 미지원 provider / 키 없는 설정은 mock으로 폴백 (원본과 동일).
    return new MockLlmProvider();
  }
  return new ProxyLlmProvider({
    provider: config.provider,
    model: config.model ?? undefined,
    baseUrl: config.baseUrl ?? undefined,
    encryptedApiKey: config.encryptedApiKey,
  });
}

/** 서버 환경변수 키로 쓸 수 있는 기본 provider (OpenAI 우선). 서버 함수에 닿지 않으면 null. */
export async function serverDefaultTarget(): Promise<ProxyTarget | null> {
  const status = await getServerStatus();
  if (!status.available) return null;
  for (const provider of PROXY_PROVIDERS) {
    const model = status.serverProviders[provider];
    if (model) return { provider, model };
  }
  return null;
}
