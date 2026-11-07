import { firebaseAuth } from '@/lib/firebase';

/**
 * Client for api/archi-llm — the one server-side piece of the ported studio.
 * It holds the secrets: encrypts registered provider keys, decrypts them per call,
 * and calls LLM / image providers. The browser only ever stores ciphertext.
 */
export type ServerStatus = {
  available: boolean;
  /** Providers usable with the server's own environment keys, with default model. */
  serverProviders: Partial<Record<'openai' | 'anthropic' | 'google' | 'grok' | 'deepseek', string>>;
  canEncrypt: boolean;
  /** Real law/KDS/building search is available (api/_regulations.ts keys + OPENAI_API_KEY). */
  regulationSearch?: boolean;
};

export class ServerProxyError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ServerProxyError';
  }
}

export async function callArchiServer<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const user = firebaseAuth?.currentUser;
  if (!user) throw new ServerProxyError('AI 서버 호출에는 로그인이 필요합니다.', 401);
  const token = await user.getIdToken();
  const response = await fetch('/api/archi-llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...payload }),
  });
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) {
    // e.g. the Vite dev server answering with index.html when serverless functions aren't running
    throw new ServerProxyError('AI 서버 함수(/api/archi-llm)에 연결할 수 없습니다.', response.status || 503);
  }
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new ServerProxyError(body.error ?? 'AI 서버 요청에 실패했습니다.', response.status);
  return body;
}

let statusPromise: Promise<ServerStatus> | null = null;

/** Cached per session; falls back to "unavailable" (→ mock providers) when the function is unreachable. */
export function getServerStatus(): Promise<ServerStatus> {
  statusPromise ??= callArchiServer<ServerStatus>('status').catch(() => {
    statusPromise = null;
    return { available: false, serverProviders: {}, canEncrypt: false };
  });
  return statusPromise;
}
