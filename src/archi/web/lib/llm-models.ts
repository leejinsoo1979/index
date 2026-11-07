/**
 * Provider model listing (pure, no app imports) — shared by the browser services and
 * the api/archi-llm serverless function, which calls provider APIs with the real key.
 */
export type ModelProvider = 'openai' | 'anthropic' | 'google' | 'grok';

/** 키 조회 실패 시 보여줄 최소 폴백 (선택지가 비지 않게). UI는 우선 라이브 목록을 쓴다. */
// 최신 우선 정렬된 폴백 (키 등록 전 임시 표시용). 키 등록 후엔 라이브 목록으로 대체된다.
export const FALLBACK_MODELS: Record<string, string[]> = {
  openai: ['gpt-4.1', 'gpt-4.1-mini', 'o4-mini', 'gpt-4o', 'gpt-4o-mini'],
  google: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
  grok: ['grok-4', 'grok-3', 'grok-3-mini'],
  anthropic: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
};

/** 채팅과 무관한 모델(임베딩/음성/이미지/검열/스냅샷 등)을 걸러낸다 */
function isChatModel(provider: ModelProvider, id: string): boolean {
  const lower = id.toLowerCase();
  // 공통 제외: 임베딩/음성/이미지/검열/리얼타임/튜닝 등
  if (
    /embedding|embed|whisper|tts|audio|speech|moderation|image|vision-only|dall-?e|realtime|transcribe|search|rerank|aqa|guard/.test(
      lower,
    )
  ) {
    return false;
  }
  if (provider === 'openai') {
    // gpt / o-시리즈 메인 라인만. 날짜 스냅샷(-2024-..)·preview·instruct 제외
    if (!/^(gpt-|o\d|chatgpt)/.test(lower)) return false;
    if (/\d{4}-\d{2}-\d{2}|-\d{4}$|preview|instruct|audio|search/.test(lower)) return false;
    return true;
  }
  if (provider === 'anthropic') {
    // claude-* 채팅 모델. Anthropic ids는 날짜가 붙어 있어 날짜 제외 규칙을 적용하지 않는다.
    return lower.startsWith('claude');
  }
  if (provider === 'google') {
    if (!lower.startsWith('gemini-')) return false;
    // 실험판/숫자 빌드 스냅샷·튜닝(-001/-exp/-tuning) 제외, 일반 별칭만
    if (/-\d{3}$|exp|tuning|thinking-exp|latest-\d/.test(lower)) return false;
    return true;
  }
  // grok: grok-* 메인. 날짜 스냅샷 제외
  if (!lower.startsWith('grok')) return false;
  if (/\d{4}-\d{2}-\d{2}|-\d{4}$/.test(lower)) return false;
  return true;
}

/** 모델명에서 버전 숫자를 뽑아 최신(높은 버전·세대)이 위로 오게 정렬 */
function modelRank(id: string): number {
  const nums = id.match(/\d+(?:\.\d+)?/g);
  const major = nums?.[0] ? parseFloat(nums[0]) : 0;
  const minor = nums?.[1] ? parseFloat(nums[1]) : 0;
  // 'pro' > 'flash' > 'mini' 같은 티어 가중치 (동일 버전 내 정렬용)
  const tier = /pro|opus|max|\bultra\b/.test(id) ? 3 : /flash|sonnet|standard/.test(id) ? 2 : 1;
  // OpenAI o-시리즈(o3/o4-mini 등)는 최신 추론 모델이라 버전 숫자가 낮아도 상위로 끌어올린다
  const reasoningBonus = /^o\d/.test(id) ? 800 : 0;
  return major * 1000 + minor * 100 + tier + reasoningBonus;
}

function sortModelsNewestFirst(ids: string[]): string[] {
  return [...new Set(ids)].sort((a, b) => {
    const diff = modelRank(b) - modelRank(a);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
}

export async function fetchProviderModels(
  provider: 'openai' | 'anthropic' | 'google' | 'grok',
  apiKey: string,
  baseUrl?: string,
): Promise<string[]> {
  if (provider === 'anthropic') {
    const base = baseUrl?.replace(/\/$/, '') || 'https://api.anthropic.com';
    const res = await fetch(`${base}/v1/models?limit=200`, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: { id?: string }[] };
    const ids = (data.data ?? [])
      .map((m) => m.id ?? '')
      .filter((id) => id && isChatModel('anthropic', id));
    return sortModelsNewestFirst(ids);
  }
  if (provider === 'google') {
    const base = baseUrl?.replace(/\/$/, '') || 'https://generativelanguage.googleapis.com';
    const res = await fetch(`${base}/v1beta/models?pageSize=200`, {
      headers: { 'x-goog-api-key': apiKey },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      models?: { name?: string; supportedGenerationMethods?: string[] }[];
    };
    const ids = (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => (m.name ?? '').replace(/^models\//, ''))
      .filter((id) => id && isChatModel('google', id));
    return sortModelsNewestFirst(ids);
  }
  // openai / grok 은 OpenAI 호환 /v1/models
  const base =
    baseUrl?.replace(/\/$/, '') ||
    (provider === 'grok' ? 'https://api.x.ai' : 'https://api.openai.com');
  const res = await fetch(`${base}/v1/models`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { data?: { id?: string }[] };
  const ids = (data.data ?? [])
    .map((m) => m.id ?? '')
    .filter((id) => id && isChatModel(provider, id));
  return sortModelsNewestFirst(ids);
}

