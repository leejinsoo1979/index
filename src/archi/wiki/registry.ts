import type { WikiPage } from './types';
import { WIKI_STATUS } from './types';
import { articleLead, entryType, WIKI_ENTRY_TYPES } from './encyclopedia';
import { headings, resolvePage, wikiLinks } from './markdown';
import type { ProcessModel, ProcessNode } from '../web/components/wiki/korea100/types';

export type RegistryRecord = {
  slug: string; name: string; oneLiner: string; priority: number; category: string; type: string;
  status: WikiPage['status']; sourceCount: number; relationCount: number; processNodeCount: number;
  updatedAt: string; version: number; searchText: string; page: WikiPage;
};
const PROCESS_BLOCK = /^```index-process\s*\n([\s\S]*?)^```\s*$/m;

export function parseProcess(value: unknown): ProcessModel {
  if (!value || typeof value !== 'object') throw new Error('구조도는 JSON 객체여야 합니다.');
  const data = value as Record<string, unknown>;
  const strings = (v: unknown, name: string): string[] => {
    if (!Array.isArray(v) || v.length > 40 || v.some(x => typeof x !== 'string' || !x.trim() || x.length > 160)) throw new Error(name + '에는 160자 이내의 이름을 최대 40개 입력하세요.');
    if (new Set(v).size !== v.length) throw new Error(name + '에 중복된 이름이 있습니다.');
    return v as string[];
  };
  const lanes = strings(data.lanes, '행위자'), stages = strings(data.stages, '단계');
  if (!lanes.length || !stages.length) throw new Error('행위자와 단계를 각각 하나 이상 입력하세요.');
  if (!Array.isArray(data.nodes) || !data.nodes.length || data.nodes.length > 120) throw new Error('구조도에는 노드를 1~120개 입력하세요.');
  const text = (v: unknown, fallback = '') => typeof v === 'string' ? v.slice(0, 2000) : fallback;
  const nodes = data.nodes.map((raw): ProcessNode => {
    if (!raw || typeof raw !== 'object') throw new Error('노드 형식이 올바르지 않습니다.');
    const n = raw as Record<string, unknown>;
    if (typeof n.id !== 'string' || !/^[\w가-힣.-]{1,80}$/.test(n.id) || typeof n.name !== 'string' || !n.name.trim()) throw new Error('모든 노드에 고유 ID와 이름을 입력하세요.');
    if (!lanes.includes(String(n.lane)) || !stages.includes(String(n.stage))) throw new Error(n.id + ': 행위자 또는 단계가 정의되지 않았습니다.');
    if (!['done','current','waiting','risk','loop'].includes(String(n.status))) throw new Error(n.id + ': 상태가 올바르지 않습니다.');
    if (!['task','gateway','notice','system'].includes(String(n.type))) throw new Error(n.id + ': 노드 유형이 올바르지 않습니다.');
    return { id: n.id, name: n.name.slice(0, 160), lane: String(n.lane), stage: String(n.stage), status: n.status as ProcessNode['status'], type: n.type as ProcessNode['type'], actor: text(n.actor, String(n.lane)), action: text(n.action), deadline: text(n.deadline), blocker: text(n.blocker), input_documents: strings(n.input_documents ?? [], '입력 문서'), output_documents: strings(n.output_documents ?? [], '산출 문서'), source_ids: strings(n.source_ids ?? [], '출처 ID') };
  });
  const ids = new Set(nodes.map(n => n.id));
  if (ids.size !== nodes.length) throw new Error('노드 ID가 중복되었습니다.');
  if (!Array.isArray(data.edges) || data.edges.length > 400) throw new Error('연결선은 배열이며 최대 400개입니다.');
  const edgeIds = new Set<string>();
  const edges = data.edges.map((raw, i) => {
    if (!raw || typeof raw !== 'object') throw new Error('연결선 형식이 올바르지 않습니다.');
    const e = raw as Record<string, unknown>;
    if (!ids.has(String(e.source)) || !ids.has(String(e.target))) throw new Error('연결선이 존재하지 않는 노드를 참조합니다.');
    if (!['sequence','message','loop'].includes(String(e.type))) throw new Error('연결선 유형이 올바르지 않습니다.');
    const id = text(e.id, 'edge-' + i);
    if (edgeIds.has(id)) throw new Error('연결선 ID가 중복되었습니다.');
    edgeIds.add(id);
    return { id, source: String(e.source), target: String(e.target), type: e.type as ProcessModel['edges'][number]['type'], label: text(e.label) };
  });
  return { lanes, stages, nodes, edges };
}

export function readProcess(content: string): { process: ProcessModel | null; error: string | null } {
  const match = content.match(PROCESS_BLOCK);
  if (!match) return { process: null, error: null };
  try { return { process: parseProcess(JSON.parse(match[1]!)), error: null }; }
  catch (reason) { return { process: null, error: reason instanceof Error ? reason.message : '구조도를 읽지 못했습니다.' }; }
}
export function withoutProcess(content: string) { return content.replace(PROCESS_BLOCK, '').trim(); }
export function writeProcess(content: string, process: ProcessModel | null) {
  const body = withoutProcess(content);
  return body + (process ? '\n\n```index-process\n' + JSON.stringify(parseProcess(process), null, 2) + '\n```\n' : '');
}
export function relatedWikiPages(page: WikiPage, pages: WikiPage[]) {
  const outgoing = new Set(wikiLinks(withoutProcess(page.content)).flatMap(t => { const p = resolvePage(t, pages); return p && p.id !== page.id ? [p.id] : []; }));
  const incoming = new Set(pages.filter(p => p.id !== page.id && wikiLinks(withoutProcess(p.content)).some(t => resolvePage(t, pages)?.id === page.id)).map(p => p.id));
  return { outgoing: pages.filter(p => outgoing.has(p.id)), incoming: pages.filter(p => incoming.has(p.id)), all: pages.filter(p => outgoing.has(p.id) || incoming.has(p.id)) };
}
export function registryRecords(pages: WikiPage[]): RegistryRecord[] {
  const active = pages.filter(p => p.status !== 'archived');
  const canonical = (s:string) => s.trim().normalize('NFC').toLocaleLowerCase();
  const titleIds = new Map(active.map(p => [canonical(p.title), p.id]));
  const aliases = new Map(active.flatMap(p => (p.aliases ?? []).map(a => [canonical(a),p.id] as const)));
  const ids = new Set(active.map(p=>p.id));
  const neighbors = new Map(active.map(p=>[p.id,new Set<string>()]));
  for (const page of active) for (const target of wikiLinks(withoutProcess(page.content))) {
    const other = ids.has(target) ? target : titleIds.get(canonical(target)) ?? aliases.get(canonical(target));
    if (other && other !== page.id) {neighbors.get(page.id)!.add(other);neighbors.get(other)!.add(page.id);}
  }
  const priority = [...active].sort((a,b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  return priority.map((page, i) => ({
    slug: page.id, name: page.title, oneLiner: articleLead(withoutProcess(page.content)), priority: i + 1,
    category: page.category, type: WIKI_ENTRY_TYPES[entryType(page)], status: page.status,
    sourceCount: page.sources.length, relationCount: neighbors.get(page.id)!.size,
    processNodeCount: readProcess(page.content).process?.nodes.length ?? 0, updatedAt: page.updatedAt,
    version: page.version, searchText: [page.title, ...(page.aliases ?? []), withoutProcess(page.content), page.category, ...page.tags, ...page.sources.map(s => s.title)].join(' ').normalize('NFC').toLocaleLowerCase('ko'), page,
  }));
}

export function registryStatus(record: Pick<RegistryRecord, 'status'>) {
  return { label: WIKI_STATUS[record.status], tone: record.status === 'published' ? 'verified' : record.status === 'review' ? 'review' : 'draft' };
}
export function documentSections(page: WikiPage) {
  const content = withoutProcess(page.content), lines = content.split('\n');
  const sections = headings(content).filter(h => h.level <= 2).map((h, i, all) => ({
    ...h, content: lines.slice(Number(h.id.replace('wiki-heading-', '')) + 1, all[i + 1] ? Number(all[i + 1]!.id.replace('wiki-heading-', '')) : lines.length).join('\n').trim(),
  }));
  const preamble = lines.slice(0, sections.length ? Number(sections[0]!.id.replace('wiki-heading-', '')) : lines.length).join('\n').trim();
  return preamble ? [{id:'wiki-overview',text:'개요',level:2,content:preamble},...sections] : sections;
}

/** Actual document links rendered in the reused Korea100 board. */
export function knowledgeConnectionModel(page: WikiPage, pages: WikiPage[]): ProcessModel {
  const related = relatedWikiPages(page, pages);
  const before = related.incoming.filter(p => !related.outgoing.some(other => other.id === p.id));
  const after = related.outgoing;
  const visible = [...before, page, ...after];
  const lanes = [...new Set(visible.map(p => p.category))];
  const stages = ['IN 이 항목을 참조', 'DOC 현재 항목', 'OUT 연결한 항목'];
  return {
    lanes, stages,
    nodes: visible.map((p,index) => ({id:p.id, display_id:`D${index+1}`, name:p.title, lane:p.category, stage:stages[p.id === page.id ? 1 : before.some(b => b.id === p.id) ? 0 : 2]!, status:p.id === page.id ? 'current' : 'waiting', type:'task', actor:p.updatedBy, display_status:p.id === page.id ? '현재 항목' : '연결 문서'})),
    edges: [...before.map(p => ({id:p.id + ':' + page.id,source:p.id,target:page.id,type:'sequence' as const})), ...after.map(p => ({id:page.id + ':' + p.id,source:page.id,target:p.id,type:'sequence' as const}))],
  };
}
