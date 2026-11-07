/**
 * Prompt injection 방어 필터.
 * 업로드 문서/웹 검색 결과 등 신뢰할 수 없는 텍스트는 LLM 컨텍스트에 넣기 전에
 * 이 필터를 통과시킨다 (CLAUDE.md 규칙 5, ARCHITECTURE.md 9장).
 */

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?)/gi,
  /disregard\s+(all\s+)?(previous|prior|above)/gi,
  /you\s+are\s+now\s+(?:a|an|in)\s/gi,
  /system\s*prompt/gi,
  /<\s*\/?\s*(system|assistant|tool|instruction)[^>]*>/gi,
  /이전\s*(지시|명령|프롬프트)\s*(를|은|는)?\s*(무시|잊)/g,
  /시스템\s*프롬프트/g,
  /너는\s*이제부터/g,
];

const MAX_UNTRUSTED_LENGTH = 4000;

/** 신뢰할 수 없는 텍스트에서 지시문 패턴을 제거하고 길이를 제한한다 */
export function sanitizeUntrustedText(text: string): string {
  let result = text
    // 제어 문자 제거 (개행/탭 제외)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    // zero-width 문자 제거 (지시문 은닉 방지)
    .replace(/[\u200B-\u200F\u2060\uFEFF]/g, '');
  for (const pattern of INJECTION_PATTERNS) {
    result = result.replace(pattern, '[차단된 지시문]');
  }
  if (result.length > MAX_UNTRUSTED_LENGTH) {
    result = `${result.slice(0, MAX_UNTRUSTED_LENGTH)}…`;
  }
  return result;
}

/** export/렌더링에 안전한 URL인지 확인 (http/https/상대경로만 허용) */
export function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed === '') return false;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** 안전하지 않은 URL은 빈 문자열로 치환 */
export function safeUrlOrEmpty(url: string | undefined | null): string {
  if (!url) return '';
  return isSafeUrl(url) ? url.trim() : '';
}
