import { studioFetch } from './router';

/** 클라이언트 fetch 헬퍼. 실패 시 서버의 한국어 message를 그대로 던진다. */
export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const response = await studioFetch(url, {
    ...init,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    let message = '요청 처리 중 오류가 발생했습니다.';
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // ignore body parse failure
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}
