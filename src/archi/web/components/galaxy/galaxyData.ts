import DOMPurify from 'dompurify';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import { plainText, resolvePage, wikiLinks } from '../../../wiki/markdown';
import type { WikiPage } from '../../../wiki/types';

/**
 * Builds the knowledge-galaxy graph (the Second Brain OS map format: root → collections →
 * sections → pages, plus terms and tools) from the INDEX wiki pages and the Apps catalogue.
 */

export type GalaxyGroup = 'design' | 'build' | 'law' | 'field' | 'term' | 'tool';
export type GalaxyNode = {
  id: string;
  type: 'root' | 'collection' | 'section' | 'page' | 'term' | 'app';
  group: GalaxyGroup | 'root';
  label: string;
  desc?: string;
  val: number;
  badge?: string;
  pages?: string[];
  sec?: string;
  pos?: number;
  of?: number;
  words?: number;
  terms?: string[];
  inpages?: [string, number][];
  total?: number;
  url?: string;
};
export type GalaxyEdge = { s: string; t: string; k: 'contains' | 'follows' | 'link' | 'mentions' | 'uses' | 'related'; h?: 1 };
export type GalaxyGraph = {
  stats: { pages: number; sections: number; words: number; terms: number; tools: number; edges: number; nodes: number };
  order: string[];
  nodes: GalaxyNode[];
  edges: GalaxyEdge[];
};
export type GalaxyPages = Record<string, { html: string; heads: { id: string; t: string }[]; text: string }>;
export type GalaxyTool = { id: string; name: string; summary: string; description: string; tags: string[] };

export const COLLECTIONS: { key: Exclude<GalaxyGroup, 'term' | 'tool'>; label: string; code: string; categories: string[]; desc: string }[] = [
  { key: 'design', label: '설계·공간', code: 'D', categories: ['공간', '설계·디자인', '주거 환경'], desc: '평면과 동선, 수납, 빛과 환기까지. 사는 사람의 생활에서 출발하는 공간 계획의 지식입니다.' },
  { key: 'build', label: '시공·자재', code: 'B', categories: ['자재', '공법', '기술'], desc: '자재의 성질과 공법의 순서, 현장에서 품질을 가르는 기술 지식입니다.' },
  { key: 'law', label: '법규·하자', code: 'L', categories: ['법규·기준', '하자'], desc: '공사 신고와 허가, 기준과 책임기간, 하자를 막고 다투는 데 필요한 근거입니다.' },
  { key: 'field', label: '현장·협업', code: 'F', categories: ['현장 기록', '사업·협업', '디지털·AI', '일반'], desc: '현장 기록과 협업, 사업과 도구. 전문가들이 실제로 겪은 일의 기록입니다.' },
];
const GENERIC_TAGS = new Set(['인테리어', '인테리어 지식백과', '인테리어SHOW', 'INDEX', '메타데이터', '말투 자료', '페르소나']);

const firstCategory = (c: string) => (c || '일반').split('|')[0]!.trim() || '일반';
const collectionOf = (category: string) => COLLECTIONS.find((c) => c.categories.includes(category))?.key ?? 'field';
const chars = (s: string) => s.replace(/\s+/g, '').length;

function descOf(md: string) {
  // the first real paragraph, skipping headings, lists and figures
  for (const block of md.split(/\n\s*\n/)) {
    const b = block.trim();
    if (!b || /^(#|!\[|\||```|---|>)/.test(b)) continue;
    const text = plainText(b.replace(/^[-*+]\s+/gm, '').replace(/^\d+\.\s+/gm, ''));
    if (text.length > 20) return text.length > 220 ? text.slice(0, 220).replace(/\s+\S*$/, '') + '…' : text;
  }
  return plainText(md).slice(0, 200);
}

/** Page markdown → reader HTML: headings shifted under the page title, wiki links wired to the graph. */
function pageHtml(md: string, pages: WikiPage[]) {
  const heads: { id: string; t: string }[] = [];
  // the page title is the reader's h1, so the body's top heading level becomes h2
  const top = Math.min(6, ...[...md.matchAll(/^(#{1,6})\s/gm)].map((m) => m[1]!.length));
  const shift = 2 - (top === 6 && !/^#{6}\s/m.test(md) ? 2 : top);
  let fence = '';
  const shifted = md.split('\n').map((line) => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) { fence = fence ? (marker[1]![0] === fence ? '' : fence) : marker[1]![0]!; return line; }
    if (fence) return line;
    const h = line.match(/^(#{1,6})(\s.*)$/);
    return h ? '#'.repeat(Math.min(6, Math.max(2, h[1]!.length + shift))) + h[2] : line;
  }).join('\n');
  const linked = shifted.replace(/\[\[([^\]\n]+)\]\]/g, (_all, raw: string) => {
    const [target = '', alias] = raw.split('|');
    const page = resolvePage(target.trim(), pages);
    const label = (alias || target).trim().replace(/[[\]\\]/g, '\\$&');
    return page ? `[${label}](#wk:${page.id})` : label;
  });
  let html = DOMPurify.sanitize(micromark(linked, { extensions: [gfm()], htmlExtensions: [gfmHtml()] }));
  html = html.replace(/<a href="#wk:([\w-]+)">/g, '<a class="wiki" data-go="$1" role="link" tabindex="0">');
  html = html.replace(/<a href="(https?:[^"]+)">/g, '<a class="ext" href="$1" target="_blank" rel="noopener">');
  let n = 0;
  html = html.replace(/<h2>([\s\S]*?)<\/h2>/g, (_m, inner: string) => {
    const id = `h-${++n}`;
    heads.push({ id, t: inner.replace(/<[^>]+>/g, '').trim() });
    return `<h2 id="${id}">${inner}</h2>`;
  });
  return { html, heads };
}

export function buildGalaxy(allPages: WikiPage[], tools: GalaxyTool[]): { graph: GalaxyGraph; pages: GalaxyPages } {
  const pages = allPages.filter((p) => p.status !== 'archived' && p.title?.trim());
  const nodes: GalaxyNode[] = [];
  const edges: GalaxyEdge[] = [];
  const PAGES: GalaxyPages = {};
  const order: string[] = [];

  nodes.push({ id: 'root', type: 'root', group: 'root', label: 'INDEX 지식 은하', desc: '주거 실내건축 전문가들이 검수하며 쌓아 가는 INDEX의 지식 전체입니다.', val: 34 });

  // sections = categories, grouped into the four collections
  const byCategory = new Map<string, WikiPage[]>();
  for (const p of pages) {
    const c = firstCategory(p.category);
    if (!byCategory.has(c)) byCategory.set(c, []);
    byCategory.get(c)!.push(p);
  }
  const sectionOfPage = new Map<string, string>();
  for (const col of COLLECTIONS) {
    nodes.push({ id: `col:${col.key}`, type: 'collection', group: col.key, label: col.label, desc: col.desc, val: 14 });
    edges.push({ s: 'root', t: `col:${col.key}`, k: 'contains' });
    const cats = [...byCategory.keys()].filter((c) => collectionOf(c) === col.key)
      .sort((a, b) => (col.categories.indexOf(a) + 1 || 99) - (col.categories.indexOf(b) + 1 || 99));
    cats.forEach((cat, i) => {
      const list = byCategory.get(cat)!.sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.title.localeCompare(b.title, 'ko'));
      const sid = `sec:${col.key}:${i}`;
      order.push(sid);
      nodes.push({ id: sid, type: 'section', group: col.key, label: cat, badge: `${col.code}${i + 1}`, desc: `${cat} 분야에서 협회가 정리한 문서 ${list.length}건입니다.`, pages: list.map((p) => p.id), val: 4 + Math.min(list.length, 60) * 0.06 });
      edges.push({ s: `col:${col.key}`, t: sid, k: 'contains' });
      list.forEach((p, k) => {
        sectionOfPage.set(p.id, sid);
        edges.push({ s: sid, t: p.id, k: 'contains' });
        if (k > 0) edges.push({ s: list[k - 1]!.id, t: p.id, k: 'follows' });
      });
    });
  }

  // terms: tags shared by three or more pages
  const tagPages = new Map<string, WikiPage[]>();
  for (const p of pages) for (const t of new Set(p.tags ?? [])) {
    const tag = t.trim();
    if (!tag || GENERIC_TAGS.has(tag)) continue;
    if (!tagPages.has(tag)) tagPages.set(tag, []);
    tagPages.get(tag)!.push(p);
  }
  const terms = [...tagPages.entries()].filter(([, l]) => l.length >= 3).sort((a, b) => b[1].length - a[1].length).slice(0, 90);
  const termOfPage = new Map<string, string[]>();
  nodes.push({ id: 'col:term', type: 'collection', group: 'term', label: '용어', desc: '여러 문서가 함께 다루는 주제어입니다. 많이 기댈수록 크게 보입니다.', val: 14 });
  edges.push({ s: 'root', t: 'col:term', k: 'contains' });
  for (const [tag, list] of terms) {
    const id = `term:${tag}`;
    const defined = resolvePage(tag, pages);
    const inpages: [string, number][] = list.map((p) => [p.id, Math.max(1, p.content.split(tag).length - 1)]);
    inpages.sort((a, b) => b[1] - a[1]);
    if (defined) { const at = inpages.findIndex((x) => x[0] === defined.id); if (at > 0) inpages.unshift(...inpages.splice(at, 1)); }
    nodes.push({ id, type: 'term', group: 'term', label: tag, desc: defined ? descOf(defined.content) : `${list.length}개 문서에서 다루는 주제입니다.`, inpages, total: inpages.reduce((a, x) => a + x[1], 0), val: 1.2 + Math.min(list.length, 30) * 0.08 });
    edges.push({ s: 'col:term', t: id, k: 'contains', h: 1 });
    for (const p of list) {
      edges.push({ s: id, t: p.id, k: 'mentions' });
      if (!termOfPage.has(p.id)) termOfPage.set(p.id, []);
      termOfPage.get(p.id)!.push(id);
    }
  }

  // pages
  let words = 0;
  for (const p of pages) {
    const sid = sectionOfPage.get(p.id)!;
    const sec = nodes.find((n) => n.id === sid)!;
    const w = chars(plainText(p.content));
    words += w;
    const { html, heads } = pageHtml(p.content, pages);
    PAGES[p.id] = { html, heads, text: plainText(p.content).slice(0, 20000) };
    nodes.push({ id: p.id, type: 'page', group: sec.group, label: p.title, sec: sid, pos: sec.pages!.indexOf(p.id) + 1, of: sec.pages!.length, desc: descOf(p.content), words: w, terms: termOfPage.get(p.id) ?? [], val: 1.6 + Math.min(Math.sqrt(w) / 40, 2) });
  }

  // wiki links between pages
  const seen = new Set<string>();
  for (const p of pages) for (const target of wikiLinks(p.content)) {
    const to = resolvePage(target, pages);
    if (!to || to.id === p.id) continue;
    const key = p.id + '>' + to.id;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ s: p.id, t: to.id, k: 'link' });
  }

  // INDEX AI tools (Apps)
  nodes.push({ id: 'col:tool', type: 'collection', group: 'tool', label: 'AI 도구', desc: 'INDEX Apps의 AI 도구입니다. 문서가 다루는 일을 실제로 확인하고 계산합니다.', val: 14 });
  edges.push({ s: 'root', t: 'col:tool', k: 'contains' });
  for (const t of tools) {
    const id = `app:${t.id}`;
    const keys = [...new Set(t.tags)].filter((k) => k.length >= 2);
    const users = pages
      .map((p) => ({ p, hit: keys.filter((k) => p.title.includes(k) || p.tags.includes(k)).length }))
      .filter((x) => x.hit > 0).sort((a, b) => b.hit - a.hit).slice(0, 12);
    nodes.push({ id, type: 'app', group: 'tool', label: t.name, desc: t.summary, url: t.id, inpages: users.map((x) => [x.p.id, x.hit]), val: 2.4 });
    edges.push({ s: 'col:tool', t: id, k: 'contains' });
    for (const x of users) edges.push({ s: x.p.id, t: id, k: 'uses' });
    for (const k of keys) if (tagPages.has(k) && terms.some(([tag]) => tag === k)) edges.push({ s: id, t: `term:${k}`, k: 'related' });
  }

  return {
    graph: {
      stats: { pages: pages.length, sections: order.length, words, terms: terms.length, tools: tools.length, edges: edges.filter((e) => !e.h).length, nodes: nodes.length },
      order, nodes, edges,
    },
    pages: PAGES,
  };
}
