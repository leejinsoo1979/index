import { emptyWikiDraft, type WikiPage, type WikiDraft } from './types';
import { plainText, resolvePage, wikiLinks } from './markdown';

export const WIKI_ENTRY_TYPES = { article: '백과사전 항목', source: '원본 자료 요약', note: '업무·현장 기록' } as const;
export type WikiEntryType = keyof typeof WIKI_ENTRY_TYPES;
export const INDEX_LETTERS = ['전체', 'ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ', 'A–Z', '0–9', '기타'];
const INITIALS = ['ㄱ', 'ㄱ', 'ㄴ', 'ㄷ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅂ', 'ㅅ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
export function entryType(page: Pick<WikiPage, 'id' | 'entryType'>): WikiEntryType {
  return page.entryType ?? (page.id.startsWith('source-') ? 'source' : 'article');
}
export function indexLetter(title: string) {
  const first = title.trim().normalize('NFC')[0] ?? '';
  const code = first.charCodeAt(0) - 0xac00;
  if (code >= 0 && code <= 11171) return INITIALS[Math.floor(code / 588)]!;
  if (/[a-z]/i.test(first)) return 'A–Z';
  if (/[0-9]/.test(first)) return '0–9';
  return INITIALS.includes(first) ? first : '기타';
}
export function articleLead(content: string) {
  content = content.replace(/<!--[\s\S]*?-->/g, '');
  const paragraph = content.split(/\n\s*\n/).find(part => part.trim() && !/^\s*(#|>|\||[-*] |```|~~~)/.test(part));
  return plainText(paragraph || content).slice(0, 200);
}
export function encyclopediaArticles(pages: WikiPage[], includeUnreviewed = false) {
  return pages.filter(page => entryType(page) === 'article' && page.status !== 'archived' && (includeUnreviewed || page.status === 'published'))
    .sort((a, b) => a.title.localeCompare(b.title, 'ko', { numeric: true }));
}
export function wantedArticles(pages: WikiPage[]) {
  const active = pages.filter(page => page.status !== 'archived');
  const targets = new Map<string, { title: string; count: number }>();
  for (const page of active) for (const title of wikiLinks(page.content)) {
    if (resolvePage(title, active)) continue;
    const key = title.normalize('NFC').toLocaleLowerCase();
    const current = targets.get(key);
    targets.set(key, { title: current?.title ?? title, count: (current?.count ?? 0) + 1 });
  }
  return [...targets.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, 'ko'));
}
export function encyclopediaDraft(title = ''): WikiDraft {
  return { ...emptyWikiDraft(title), entryType: 'article', content: '## 개요\n\n<!-- 이 항목의 정의와 주거 실내건축에서의 의미를 설명하세요. -->\n\n## 주요 내용\n\n<!-- 개념, 특징, 적용 범위를 근거와 함께 작성하세요. -->\n\n## 실무에서의 활용\n\n<!-- 설계·자재 선택·시공·협업 등 실무와 연결하세요. -->\n\n## 함께 보기\n\n<!-- [[관련 항목]]으로 연결하세요. -->\n\n## 참고 문헌\n\n<!-- 문헌명, 발행 기관, 발행일, URL 또는 원본 자료를 명시하세요. -->\n' };
}
