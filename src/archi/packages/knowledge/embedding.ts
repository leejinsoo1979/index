/**
 * Embedding Provider 인터페이스.
 * 실제 구현(OpenAI/Voyage 등)으로 교체 가능하며, mock은 해시 기반 bag-of-words 벡터를 만든다.
 * 저장은 초기에 Json 컬럼을 사용하고, 규모가 커지면 pgvector로 이전한다.
 */

export interface EmbeddingProvider {
  readonly name: string;
  readonly dimension: number;
  embed(texts: string[]): Promise<number[][]>;
}

const DIM = 256;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function hashToken(token: string): number {
  let h = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % DIM;
}

export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'mock';
  readonly dimension = DIM;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const vector = new Array<number>(DIM).fill(0);
      const bump = (index: number, amount: number) => {
        vector[index] = (vector[index] ?? 0) + amount;
      };
      for (const token of tokenize(text)) {
        bump(hashToken(token), 1);
        // 2글자 이상 한국어 토큰은 부분 문자열(bi-gram)도 반영해 부분 일치를 지원
        if (token.length >= 2) {
          for (let i = 0; i < token.length - 1; i += 1) {
            bump(hashToken(token.slice(i, i + 2)), 0.5);
          }
        }
      }
      return normalize(vector);
    });
  }
}

function normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) return vector;
  return vector.map((v) => v / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i += 1) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return dot;
}
