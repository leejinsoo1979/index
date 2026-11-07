/** 텍스트 추출 결과를 검색 가능한 chunk로 분할한다 */

export type TextChunk = {
  text: string;
  chunkIndex: number;
  section?: string;
};

export type ChunkOptions = {
  /** chunk 최대 길이(문자) */
  maxChars?: number;
  /** 인접 chunk 간 겹침(문자) */
  overlap?: number;
};

const DEFAULT_MAX = 800;
const DEFAULT_OVERLAP = 100;

/**
 * 문단 경계 우선 분할, 길면 문자 단위로 자른다.
 * 한국어 문서는 공백 토큰화가 불안정하므로 문자 길이 기준을 쓴다.
 */
export function chunkText(raw: string, options?: ChunkOptions): TextChunk[] {
  const maxChars = options?.maxChars ?? DEFAULT_MAX;
  const overlap = Math.min(options?.overlap ?? DEFAULT_OVERLAP, Math.floor(maxChars / 2));

  const normalized = raw.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n\n+/);
  const chunks: TextChunk[] = [];
  let buffer = '';
  let currentSection: string | undefined;

  const flush = () => {
    const text = buffer.trim();
    if (text) {
      chunks.push({ text, chunkIndex: chunks.length, section: currentSection });
    }
    buffer = '';
  };

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // 마크다운 헤더는 섹션 라벨로 사용
    const headerMatch = trimmed.match(/^#{1,6}\s+(.+)$/m);
    if (headerMatch) currentSection = headerMatch[1]?.slice(0, 100);

    if (trimmed.length > maxChars) {
      flush();
      // 긴 문단은 overlap을 두고 분할
      let start = 0;
      while (start < trimmed.length) {
        const piece = trimmed.slice(start, start + maxChars);
        chunks.push({ text: piece, chunkIndex: chunks.length, section: currentSection });
        if (start + maxChars >= trimmed.length) break;
        start += maxChars - overlap;
      }
      continue;
    }

    if (buffer.length + trimmed.length + 2 > maxChars) flush();
    buffer = buffer ? `${buffer}\n\n${trimmed}` : trimmed;
  }
  flush();

  return chunks;
}
