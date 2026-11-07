import { AppError, ErrorCodes } from '@archi/shared';

/**
 * 인메모리 sliding-window rate limiter (단일 인스턴스 MVP용).
 * 다중 인스턴스 배포 시 Redis 기반으로 교체한다 (SECURITY_REVIEW.md 백로그).
 */

type WindowEntry = { timestamps: number[] };

const store = new Map<string, WindowEntry>();
const MAX_KEYS = 10_000;

export function checkRateLimit(key: string, max: number, windowMs: number): void {
  const now = Date.now();
  let entry = store.get(key);
  if (!entry) {
    if (store.size >= MAX_KEYS) {
      // 가장 오래된 키 정리 (메모리 보호)
      const first = store.keys().next().value;
      if (first) store.delete(first);
    }
    entry = { timestamps: [] };
    store.set(key, entry);
  }
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
  if (entry.timestamps.length >= max) {
    throw new AppError(ErrorCodes.RATE_LIMITED);
  }
  entry.timestamps.push(now);
}

/** 테스트용 초기화 */
export function resetRateLimits(): void {
  store.clear();
}

export function clientIpFrom(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || 'local';
}
