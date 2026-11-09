import type { WikiPage } from './types';

/** Fence/inline code is excluded from wiki links and heading navigation. */
function proseOnly(markdown: string) {
  return markdown.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, '').replace(/`[^`\n]*`/g, '');
}

export function wikiLinks(markdown: string): string[] {
  return [...new Set([...proseOnly(markdown).matchAll(/\[\[([^\]\n]+)\]\]/g)]
    .map(match => match[1]!.split('|')[0]!.trim()).filter(Boolean))];
}

export function rewriteWikiLinks(markdown: string) {
  // Preserve code tokens verbatim while converting only prose into safe Markdown links.
  return markdown.split(/(^\s*`{3,}[^\n]*\n[\s\S]*?^\s*`{3,}\s*$|^\s*~{3,}[^\n]*\n[\s\S]*?^\s*~{3,}\s*$|`[^`\n]*`)/gm)
    .map((part, i) => i % 2 ? part : part.replace(/\[\[([^\]\n]+)\]\]/g, (_all, raw: string) => {
      const [target = '', alias] = raw.split('|');
      const label = (alias || target).replace(/[\[\]\\]/g, '\\$&');
      return '[' + label + '](#wiki:' + encodeURIComponent(target.trim()).replace(/[!'()*]/g, character => '%' + character.charCodeAt(0).toString(16)) + ')';
    })).join('');
}

export function plainText(markdown: string) {
  return markdown.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target: string, alias?: string) => alias || target)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#*_`~>|]/g, '').replace(/\s+/g, ' ').trim();
}

export function headings(markdown: string) {
  let fence = '';
  return markdown.split('\n').flatMap((line, index) => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) { if (!fence) fence = marker[1]![0]!; else if (marker[1]![0] === fence) fence = ''; return []; }
    if (fence) return [];
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    return match ? [{ level: match[1]!.length, text: plainText(match[2]!.replace(/\s+#+$/, '')), id: 'wiki-heading-' + index }] : [];
  });
}

export function resolvePage(target: string, pages: WikiPage[]) {
  const key = target.trim().normalize('NFC').toLocaleLowerCase();
  const active = pages.filter(page => page.status !== 'archived');
  return active.find(page => page.id === target || page.title.normalize('NFC').toLocaleLowerCase() === key)
    ?? active.find(page => (page.aliases ?? []).some(title => title.normalize('NFC').toLocaleLowerCase() === key));
}

/** A link to something that only existed in the imported folder ("12_제목_<videoId>.md"), not a real URL. */
export function isRelativeFileLink(href: string) {
  return !/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(href);
}

/** The wiki page behind an imported file link: by the video id in its name, then by its title. */
export function resolveFileLink(href: string, pages: WikiPage[]) {
  let file = href;
  try { file = decodeURIComponent(href); } catch { /* keep the raw name */ }
  file = (file.split(/[?#]/)[0] ?? '').split('/').pop() ?? '';
  if (!/\.md$/i.test(file)) return undefined;
  const video = file.match(/_([\w-]{11})\.md$/i)?.[1];
  if (video) {
    const parts = pages.filter(page => page.status !== 'archived' && page.sources?.some(source => source.id === 'youtube-' + video));
    const first = parts.sort((a, b) => a.title.localeCompare(b.title, 'ko'))[0];
    if (first) return first;
  }
  const title = file.replace(/\.md$/i, '').replace(/^\d+_/, '').replace(/_[\w-]{11}$/, '');
  return resolvePage(title, pages);
}

export function searchPages(pages: WikiPage[], query: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return pages;
  return pages.map(page => {
    const title = [page.title, ...(page.aliases ?? [])].join(' ').toLocaleLowerCase(), body = page.content.toLocaleLowerCase();
    const tags = page.tags.join(' ').toLocaleLowerCase();
    const score = terms.reduce((sum, term) => sum + (title.includes(term) ? 8 : 0) + (tags.includes(term) ? 4 : 0) + (body.includes(term) ? 1 : 0), 0);
    return { page, score, matches: terms.every(term => title.includes(term) || body.includes(term) || tags.includes(term)) };
  }).filter(row => row.matches).sort((a, b) => b.score - a.score).map(row => row.page);
}

export function pageGraph(pages: WikiPage[]) {
  const visible = pages.filter(p => p.status !== 'archived');
  return {
    nodes: visible.map(page => ({ id: page.id, label: page.title, type: page.category, status: page.status === 'published' ? 'APPROVED' : 'CANDIDATE' })),
    edges: visible.flatMap(page => wikiLinks(page.content).flatMap(target => {
      const other = resolvePage(target, visible);
      return other && other.id !== page.id ? [{ id: page.id + ':' + other.id, sourceNodeId: page.id, targetNodeId: other.id, relationType: '문서 링크', status: 'APPROVED' }] : [];
    })),
  };
}
