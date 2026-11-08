import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Dialog } from 'radix-ui';
import { Activity, ArrowDownToLine, ArrowLeft, ArrowUpRight, BookOpen, Check, ChevronRight, Clock3, Columns2, Files, FileText, Folder, History, Info, LayoutGrid, Library, Link2, List, Menu, Network, PanelLeftClose, PanelRight, Pencil, Plus, Search, Settings2, ShieldCheck, Sparkles, Star, Tag, Upload, X, Archive, AlertCircle, ExternalLink, LoaderCircle } from 'lucide-react';
import { CustomSelect } from '@/components/ui/custom-select';
import { apiFetch } from '@archi-web/lib/client/api';
import { createWikiRepository } from '../../wiki/repository';
import { emptyWikiDraft, WIKI_CATEGORIES, WIKI_STATUS, type WikiDraft, type WikiPage, type WikiRepository, type WikiRevision, type WikiSource, type WikiStatus } from '../../wiki/types';
import { headings, pageGraph, plainText, resolvePage, searchPages, wikiLinks } from '../../wiki/markdown';
import { draftFromExisting, draftFromFile, listWikiImports, originalFileUrl, type ImportItem } from '../../wiki/sources';
import { WikiMarkdown } from '../components/wiki/WikiMarkdown';
import { GraphView as WikiGraph } from '../components/ontology/GraphView';
import { safeUrlOrEmpty } from '@archi/security';
import { coverForPage, wikiCoverImage, WIKI_COVERS, type WikiCoverChoice } from '../../wiki/covers';
import './StudioWiki.css';
import { ingestWikiFile, knowledgeRequest } from '@/lib/knowledgeServer';
import { WikiEncyclopedia } from '../components/wiki/WikiEncyclopedia';
import { RegistryDetailView } from '../components/wiki/korea100/RegistryDetailView';
import { withoutProcess } from '../../wiki/registry';
import { encyclopediaDraft, entryType, WIKI_ENTRY_TYPES, type WikiEntryType } from '../../wiki/encyclopedia';
import { WikiPipeline, WikiAssistant } from '../components/wiki/WikiPipeline';
import { StudioRail } from '../components/studio/StudioRail';

const WikiWarroom = lazy(() => import('../components/wiki/korea100/WikiWarroom'));

type Filter = 'all' | 'recent' | 'pinned' | 'review' | 'archived';
type Modal = 'import' | 'backup' | 'assistant' | null;
type LibraryProps = { repository: WikiRepository; workspaceId: string; actor: string; loadImports?: () => Promise<ImportItem[]>; importItem?: (item: ImportItem) => Promise<WikiDraft>; importFile?: (file: File) => Promise<WikiDraft>; openPersonalSource?: (source: WikiSource) => Promise<void>; contextLink?: {to:string;label:string} };
type Me = { user: { id: string; name: string | null; email: string }; organizations: { workspaces: { id: string; name: string }[] }[] };
const NO_IMPORTS = async () => [];

function dateLabel(value: string) {
  const date = new Date(value);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  return days === 0 ? '오늘' : days === 1 ? '어제' : new Intl.DateTimeFormat('ko', { month: 'short', day: 'numeric' }).format(date);
}

function download(filename: string, content: string, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function WikiDialog({ title, description, children, onClose, wide = false, side = false }: { title: string; description?: string; children: ReactNode; onClose: () => void; wide?: boolean; side?: boolean }) {
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}><Dialog.Portal>
    <Dialog.Overlay className={'wk-overlay' + (side ? ' wk-overlay--galaxy' : '')} />
    <Dialog.Content className={'wk-modal' + (wide ? ' wk-modal--wide' : '') + (side ? ' wk-modal--galaxy-panel' : '')} aria-describedby={description ? 'wk-dialog-description' : undefined}>
      <div className="wk-modal-heading"><div><Dialog.Title>{title}</Dialog.Title>{description && <Dialog.Description id="wk-dialog-description">{description}</Dialog.Description>}</div><Dialog.Close className="wk-icon" aria-label="닫기"><X size={18} /></Dialog.Close></div>
      {children}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}

export default function StudioWiki() {
  const [context, setContext] = useState<{ me: Me; workspaceId: string; repository: WikiRepository } | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    apiFetch<Me>('/api/auth/me').then(me => {
      const workspaceId = me.organizations[0]?.workspaces[0]?.id;
      if (!workspaceId) throw new Error('사용할 작업공간을 찾지 못했습니다.');
      if (active) setContext({ me, workspaceId, repository: createWikiRepository(workspaceId, me.user.name || me.user.email) });
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '라이브러리를 열지 못했습니다.'); });
    return () => { active = false; };
  }, [attempt]);
  const loadImports = useCallback(() => context ? listWikiImports(context.me.user.id, context.workspaceId) : NO_IMPORTS(), [context]);
  const importItem = useCallback((item: ImportItem) => {
    if (!context) return Promise.reject(new Error('작업공간을 먼저 열어 주세요.'));
    return draftFromExisting(context.me.user.id, context.workspaceId, item);
  }, [context]);
  if (!context) return <div className="wk-gate">{error ? <><AlertCircle /><p>{error}</p><button onClick={() => setAttempt(n => n + 1)}>다시 시도</button><Link to="/admin">관리자로 돌아가기</Link></> : <><LoaderCircle className="wk-spin" /><p>지식 라이브러리를 불러오는 중입니다.</p></>}</div>;
  return <WikiLibrary repository={context.repository} workspaceId={context.workspaceId} actor={context.me.user.name || context.me.user.email} loadImports={loadImports} importItem={importItem} />;
}

/** Presentational shell is exported for isolated browser verification without bypassing app authentication. */
export function WikiLibrary({ repository, workspaceId, actor, loadImports = NO_IMPORTS, importItem, importFile, openPersonalSource, contextLink }: LibraryProps) {
  const [params, setParams] = useSearchParams();
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const refreshLibrary = useCallback(() => setLoadAttempt(value => value + 1), []);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [filter, setFilter] = useState<Filter>('all');
  const [category, setCategory] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(() => window.innerWidth > 1250);
  const [inspectorTab, setInspectorTab] = useState<'context' | 'history'>('context');
  const [draft, setDraft] = useState<WikiDraft | null>(null);
  const [editId, setEditId] = useState<string | undefined>();
  const [editVersion, setEditVersion] = useState(0);
  const [baseline, setBaseline] = useState('');
  const [restoreReason, setRestoreReason] = useState('');
  const [editorMode, setEditorMode] = useState<'write' | 'split'>('split');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [imports, setImports] = useState<ImportItem[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importQuery, setImportQuery] = useState('');
  const [revisions, setRevisions] = useState<WikiRevision[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [showGraphMarkdown, setShowGraphMarkdown] = useState(false);
  const [previewRevision, setPreviewRevision] = useState<WikiRevision | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = draft !== null && JSON.stringify(draft) !== baseline;
  const pageId = params.get('page');
  const encyclopediaMode = Boolean(pageId) || params.get('view') === 'encyclopedia';
  const warroomMode = params.get('view') === 'warroom' && !draft && !pageId;
  const graphMode = (!params.get('view') || params.get('view') === 'graph') && !draft && !pageId;
  const selected = pages.find(page => page.id === pageId) ?? null;
  const activePages = useMemo(() => pages.filter(page => page.status !== 'archived'), [pages]);
  const graphDocument = graphMode ? activePages.find(page => page.id === params.get('node')) ?? null : null;
  const sortedPages = useMemo(() => [...pages].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [pages]);
  const filteredPages = useMemo(() => searchPages(sortedPages.filter(page => {
    if (filter === 'archived' ? page.status !== 'archived' : page.status === 'archived') return false;
    if (filter === 'pinned' && !page.pinned) return false;
    if (filter === 'review' && page.status !== 'review') return false;
    if (filter === 'recent' && Date.now() - new Date(page.updatedAt).getTime() > 7 * 86_400_000) return false;
    return !category || page.category === category;
  }), deferredQuery), [sortedPages, filter, category, deferredQuery]);
  const graph = useMemo(() => pageGraph(activePages), [activePages]);
  const displayContent = draft?.content ?? selected?.content ?? '';
  const toc = useMemo(() => headings(displayContent), [displayContent]);
  const outgoing = useMemo(() => wikiLinks(displayContent), [displayContent]);
  const backlinks = useMemo(() => selected ? activePages.filter(page => page.id !== selected.id && wikiLinks(page.content).some(target => resolvePage(target, activePages)?.id === selected.id)) : [], [selected, activePages]);
  const brokenLinks = useMemo(() => activePages.reduce((sum, page) => sum + wikiLinks(page.content).filter(target => !resolvePage(target, activePages)).length, 0), [activePages]);
  const categories = useMemo(() => [...new Set([...WIKI_CATEGORIES, ...activePages.map(page => page.category)])], [activePages]);
  const sectionTitle = category || ({ all: '모든 문서', recent: '최근 편집', pinned: '즐겨찾기', review: '검토 대기', archived: '보관함' } as Record<Filter, string>)[filter];

  useEffect(() => {
    let active = true;
    setLoading(true); setLoadFailed(false);
    repository.list().then(result => { if (active) { setPages(result); setError(''); } }).catch(reason => { if (active) { setError(reason.message); setLoadFailed(true); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [repository, loadAttempt]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1250px)');
    const closeOverlay = () => { if (media.matches) { setInspectorOpen(false); setSidebarOpen(false); } };
    media.addEventListener('change', closeOverlay);
    return () => media.removeEventListener('change', closeOverlay);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    if (!selected || inspectorTab !== 'history') return;
    let active = true;
    setHistoryLoading(true); setHistoryError(''); setRevisions([]);
    repository.history(selected.id).then(rows => { if (active) setRevisions(rows); }).catch(reason => { if (active) setHistoryError(reason.message); }).finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [selected?.id, selected?.version, inspectorTab, repository]);

  useEffect(() => {
    if (modal !== 'import') return;
    let active = true;
    setImportLoading(true); setImportError('');
    loadImports().then(rows => { if (active) setImports(rows); }).catch(reason => { if (active) setImportError(reason.message); }).finally(() => { if (active) setImportLoading(false); });
    return () => { active = false; };
  }, [modal, loadImports]);

  const allowLeave = useCallback(() => !dirty || window.confirm('저장하지 않은 변경사항이 있습니다. 변경사항을 버리고 이동할까요?'), [dirty]);
  const goPage = useCallback((id: string) => {
    if (busy || !allowLeave()) return;
    setDraft(null); setParams({ page: id }); setSidebarOpen(false); setPreviewRevision(null); setError('');
  }, [allowLeave, busy, setParams]);
  const openGraphDocument = useCallback((id: string | null) => {
    if (busy || !allowLeave()) return;
    setShowGraphMarkdown(false);
    setParams(id ? { view: 'graph', node: id } : { view: 'graph' });
  }, [allowLeave, busy, setParams]);
  const home = useCallback((nextFilter: Filter = 'all', nextCategory = '') => {
    if (busy || !allowLeave()) return;
    setDraft(null); setParams({ view: 'library' }); setFilter(nextFilter); setCategory(nextCategory); setSidebarOpen(false); setError('');
  }, [allowLeave, busy, setParams]);
  const openWarroom = () => { if (!busy && allowLeave()) { setDraft(null); setParams({ view: 'warroom' }); setSidebarOpen(false); setError(''); } };
  const openEncyclopedia = () => { if (!busy && allowLeave()) { setDraft(null); setParams({ view: 'encyclopedia' }); setSidebarOpen(false); setError(''); } };
  const startDraft = useCallback((value: WikiDraft = emptyWikiDraft(), id?: string, version = 0) => {
    if (busy || !allowLeave()) return;
    setDraft(value); setEditId(id); setEditVersion(version); setBaseline(JSON.stringify(value)); setRestoreReason(''); setError(''); setModal(null); setSidebarOpen(false);
    if (!id) setParams({});
  }, [allowLeave, busy, setParams]);
  const createPage = useCallback((title = '') => startDraft(encyclopediaDraft(title)), [startDraft]);
  const updateDraft = (patch: Partial<WikiDraft>) => setDraft(current => current ? { ...current, ...patch } : current);
  const upsertPage = (page: WikiPage) => setPages(current => [...current.filter(p => p.id !== page.id), page]);

  const saveDraft = useCallback(async () => {
    if (!draft || busy) return;
    const duplicate = pages.find(page => page.id !== editId && page.status !== 'archived' && page.title.trim().toLocaleLowerCase() === draft.title.trim().toLocaleLowerCase());
    if (duplicate) { setError('같은 제목의 문서가 있습니다. 제목을 구분해 주세요.'); return; }
    setBusy(true); setError('');
    try {
      const page = await repository.save(draft, { id: editId, expectedVersion: editVersion, reason: restoreReason || undefined });
      upsertPage(page); setDraft(null); setParams({ page: page.id }); setNotice('문서와 v' + page.version + ' 수정 이력을 저장했습니다.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '저장하지 못했습니다. 작성한 내용은 편집기에 남아 있습니다.'); }
    finally { setBusy(false); }
  }, [draft, busy, pages, editId, editVersion, repository, restoreReason, setParams]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSidebarOpen(true); requestAnimationFrame(() => searchRef.current?.focus()); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && draft) { event.preventDefault(); void saveDraft(); }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [draft, saveDraft]);

  async function changePage(page: WikiPage, patch: Partial<WikiDraft>, reason: string) {
    if (busy) return;
    setBusy(true); setError('');
    try { const next = await repository.save({ ...page, ...patch }, { id: page.id, expectedVersion: page.version, reason }); upsertPage(next); return next; }
    catch (reason) { setError(reason instanceof Error ? reason.message : '변경을 저장하지 못했습니다.'); }
    finally { setBusy(false); }
  }

  async function handleFile(file: File) {
    if (busy || !allowLeave()) return;
    setBusy(true); setImportError('');
    try {
      if (repository.mode === 'server') {
        await ingestWikiFile(file); setModal(null); setNotice('원본을 서버에 보존하고 위키 자동 정리를 예약했습니다. 처리 내역에서 진행 상황을 확인하세요.'); refreshLibrary(); return;
      }
      const value = importFile ? await importFile(file) : await draftFromFile(file, workspaceId, repository.mode);
      setDraft(value); setEditId(undefined); setEditVersion(0); setBaseline(''); setParams({}); setModal(null); setRestoreReason('');
      setNotice('원본 파일을 보존했습니다. 내용을 검토한 뒤 문서를 저장해 주세요.');
    } catch (reason) { setImportError(reason instanceof Error ? reason.message : '파일을 가져오지 못했습니다.'); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function handleImport(item: ImportItem) {
    if (!importItem || busy || !allowLeave()) return;
    setBusy(true); setImportError('');
    try {
      const value = await importItem(item);
      if (repository.mode === 'server') {
        await knowledgeRequest('sources', { method: 'POST', body: JSON.stringify({ title: value.title, name: value.title + '.md', kind: 'document', content: value.content, originalRefs: value.sources }) });
        setModal(null); setNotice('기존 문서의 원문을 보존하고 위키 자동 정리를 예약했습니다.'); refreshLibrary(); return;
      }
      setDraft(value); setEditId(undefined); setEditVersion(0); setBaseline(''); setParams({}); setModal(null); setRestoreReason('');
    } catch (reason) { setImportError(reason instanceof Error ? reason.message : '자료를 가져오지 못했습니다.'); }
    finally { setBusy(false); }
  }

  async function openSource(source: WikiSource) {
    if (openPersonalSource) {try {await openPersonalSource(source);} catch(e){setError(e instanceof Error?e.message:'원본을 열지 못했습니다.');} return;}
    try {
      const url = source.fileKey ? await originalFileUrl(source) : safeUrlOrEmpty(source.href);
      if (!url) throw new Error('열 수 있는 원본 링크가 없습니다.');
      const anchor = document.createElement('a'); anchor.href = url;
      if (url.startsWith('blob:')) anchor.download = source.title;
      else { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
      anchor.click();
      if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '원본을 열지 못했습니다.'); }
  }

  async function exportLibrary() {
    setBusy(true); setError('');
    try {
      const current = await repository.list();
      const histories = await Promise.all(current.map(page => repository.history(page.id)));
      download('INDEX-Wiki-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify({ format: 'index-wiki', version: 1, exportedAt: new Date().toISOString(), pages: current, revisions: histories.flat() }, null, 2), 'application/json');
      setModal(null); setNotice('문서와 수정 이력을 내보냈습니다. 원본 파일은 각 문서의 출처에서 내려받을 수 있습니다.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '라이브러리를 내보내지 못했습니다.'); }
    finally { setBusy(false); }
  }

  async function restoreRevision(rev: WikiRevision) {
    if (!selected || busy || !allowLeave()) return;
    setBusy(true); setError('');
    try {
      const page = await repository.save(rev, { id: selected.id, expectedVersion: selected.version, reason: 'v' + rev.version + '에서 복원' });
      upsertPage(page); setDraft(null); setPreviewRevision(null); setNotice('이전 내용을 새로운 버전 v' + page.version + '로 복원했습니다.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '복원하지 못했습니다.'); }
    finally { setBusy(false); }
  }

  function insertText(before: string, after = '') {
    const input = editorRef.current;
    if (!input || !draft) return;
    const start = input.selectionStart, end = input.selectionEnd;
    updateDraft({ content: draft.content.slice(0, start) + before + draft.content.slice(start, end) + after + draft.content.slice(end) });
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start + before.length, end + before.length); });
  }

  const renderCards = () => <div className={'wk-documents wk-documents--' + layout}>
    {filteredPages.map(page => <article className="wk-card" key={page.id}>
      <button className="wk-card-open" onClick={() => goPage(page.id)}>
        <span className="wk-card-media"><img {...wikiCoverImage(coverForPage(page))} sizes="(max-width: 680px) 90vw, (max-width: 1100px) 45vw, 330px" loading="lazy" decoding="async" /><span className="wk-image-label">AI 대표 이미지</span><span className={'wk-status wk-status--' + page.status}>{WIKI_STATUS[page.status]}</span></span>
        <span className="wk-card-category">{page.category}</span><span className="wk-card-title">{page.title}</span>
        <span className="wk-card-excerpt">{plainText(page.content).slice(0, 130) || '아직 작성된 본문이 없습니다.'}</span>
        <span className="wk-card-tags">{page.tags.slice(0, 3).map(tag => <span key={tag}>#{tag}</span>)}</span>
      </button>
      <footer><span><Clock3 size={12} />{dateLabel(page.updatedAt)}<i />출처 {page.sources.length}</span><button className={'wk-icon wk-star' + (page.pinned ? ' is-on' : '')} aria-label={page.title + (page.pinned ? ' 즐겨찾기 해제' : ' 즐겨찾기 추가')} aria-pressed={page.pinned} disabled={busy} onClick={() => void changePage(page, { pinned: !page.pinned }, '즐겨찾기 변경')}><Star size={15} /></button></footer>
    </article>)}
  </div>;

  return <div className={'wk-app' + (graphMode ? ' wk-app--galaxy' : '') + (warroomMode ? ' wk-app--warroom' : '') + (encyclopediaMode && !draft && !graphMode ? ' wk-app--registry' : '') + (selected && inspectorOpen && inspectorTab === 'history' && encyclopediaMode ? ' wk-registry-history' : '') + (sidebarOpen ? ' wk-sidebar-open' : '') + (inspectorOpen ? ' wk-inspector-open' : '')}>
    {contextLink ? (
      <nav className="wk-rail" aria-label="스튜디오 바로가기">
        <Link to={contextLink?.to ?? "/ai"} className="wk-brand" aria-label={contextLink?.label ?? "INDEX AI"}>i<span>.</span></Link>
        <div className="wk-rail-links"><button className={warroomMode ? 'is-active' : ''} onClick={openWarroom} title="지식 현황판" aria-label="지식 현황판"><Activity size={21}/></button><button className={encyclopediaMode && !selected && !draft ? 'is-active' : ''} onClick={openEncyclopedia} title="백과사전" aria-label="백과사전"><BookOpen size={21} /></button><button className={!encyclopediaMode && !graphMode && !warroomMode ? 'is-active' : ''} onClick={() => home()} title="지식 라이브러리" aria-label="지식 라이브러리"><Library size={21} /></button><button className={graphMode ? 'is-active' : ''} onClick={() => { if (!busy && allowLeave()) { setDraft(null); setParams({ view: 'graph' }); setSidebarOpen(false); } }} title="문서 그래프" aria-label="문서 그래프"><Network size={21} /></button><Link to="/agent-studio/sources" title="원본 자료 관리" aria-label="원본 자료 관리"><Files size={20} /></Link><Link to="/agent-studio" title="Agent Studio" aria-label="Agent Studio"><Sparkles size={20} /></Link></div>
        <div className="wk-rail-bottom"><Link to="/agent-studio/settings" aria-label="스튜디오 설정" title="스튜디오 설정"><Settings2 size={19} /></Link><Link to="/admin" aria-label="관리자 대시보드" title="관리자 대시보드"><ArrowLeft size={19} /></Link><span className="wk-avatar" title={actor}>{actor.slice(0, 1).toUpperCase()}</span></div>
      </nav>
    ) : (
      <StudioRail
        wikiView={warroomMode ? 'warroom' : graphMode ? 'graph' : encyclopediaMode ? 'encyclopedia' : 'library'}
        onWikiView={(view) => {
          if (view === 'warroom') openWarroom();
          else if (view === 'encyclopedia') openEncyclopedia();
          else if (view === 'library') home();
          else if (!busy && allowLeave()) { setDraft(null); setParams({ view: 'graph' }); setSidebarOpen(false); }
        }}
      />
    )}
    <button className="wk-sidebar-scrim" aria-label="탐색기 닫기" onClick={() => setSidebarOpen(false)} />
    <aside className="wk-sidebar">
      <div className="wk-workspace"><span className="wk-workspace-symbol"><BookOpen size={19} /></span><div><strong>INDEX Wiki</strong><span>KNOWLEDGE LIBRARY</span></div><button className="wk-icon wk-mobile-only" onClick={() => setSidebarOpen(false)} aria-label="탐색기 닫기"><PanelLeftClose size={17} /></button></div>
      <div className="wk-search"><Search size={16} /><input ref={searchRef} value={query} onChange={event => { setQuery(event.target.value); if (!draft && !graphMode) setParams({ view: encyclopediaMode ? 'encyclopedia' : 'library' }); }} placeholder="지식 검색" aria-label="라이브러리 검색" /><kbd>⌘ K</kbd>{query && <button onClick={() => setQuery('')} aria-label="검색 초기화"><X size={13} /></button>}</div>
      <div className="wk-sidebar-scroll">
        <p className="wk-nav-label">WORKSPACE</p>
        <div className="wk-menu"><button className={warroomMode ? 'is-active' : ''} onClick={openWarroom}><Activity size={16}/><span>지식 현황판</span></button><button className={encyclopediaMode && !selected && !draft ? 'is-active' : ''} onClick={openEncyclopedia}><BookOpen size={16} /><span>백과사전</span></button>{([
          ['all', Library, '모든 문서', activePages.length], ['recent', Clock3, '최근 편집', activePages.filter(page => Date.now() - new Date(page.updatedAt).getTime() < 7 * 86_400_000).length], ['pinned', Star, '즐겨찾기', activePages.filter(page => page.pinned).length], ['review', ShieldCheck, '검토 대기', activePages.filter(page => page.status === 'review').length],
        ] as const).map(([key, Icon, label, count]) => <button key={key} className={!category && filter === key && !graphMode && !encyclopediaMode ? 'is-active' : ''} onClick={() => home(key)}><Icon size={16} /><span>{label}</span><small>{count}</small></button>)}</div>
        <div className="wk-nav-label wk-nav-label--split"><span>분야별 지식</span><Folder size={12} /></div>
        <div className="wk-menu wk-menu--categories">{categories.map((value, index) => <button key={value} className={category === value ? 'is-active' : ''} onClick={() => home('all', value)}><i className={'wk-category-dot wk-category-dot--' + index % 7} /><span>{value}</span><small>{activePages.filter(page => page.category === value).length}</small></button>)}</div>
        <p className="wk-nav-label">바로가기</p><div className="wk-menu"><button onClick={() => setModal('import')}><Upload size={16} /><span>자료 가져오기</span><ArrowUpRight size={13} /></button><button onClick={() => home('archived')} className={filter === 'archived' ? 'is-active' : ''}><Archive size={16} /><span>보관함</span><small>{pages.length - activePages.length}</small></button><button onClick={() => setModal('backup')}><ArrowDownToLine size={16} /><span>라이브러리 내보내기</span></button></div>
      </div>
      <div className="wk-storage"><span className="wk-storage-dot" /><div><strong>{repository.mode === 'server' ? 'INDEX 공용 서버에 저장' : repository.mode === 'cloud' ? '개인 클라우드 라이브러리' : '이 브라우저에 저장'}</strong><span>{repository.mode === 'server' ? '원본·활동·문서·수정 이력 보존' : repository.mode === 'cloud' ? '문서와 수정 이력을 함께 보존' : '다른 기기에서는 공유되지 않습니다'}</span></div><Info size={14}><title>현재 연결된 저장소의 범위를 표시합니다.</title></Info></div>
    </aside>

    <div className="wk-main">
      <header className="wk-topbar"><div className="wk-breadcrumb"><button className="wk-icon wk-mobile-only" onClick={() => setSidebarOpen(true)} aria-label="탐색기 열기"><Menu size={19} /></button><button onClick={openEncyclopedia}>INDEX Wiki</button><ChevronRight size={13} /><span>{draft ? (editId ? '문서 편집' : '새 문서') : graphMode ? '문서 그래프' : warroomMode ? '지식 현황판' : selected ? selected.category : encyclopediaMode ? '백과사전' : sectionTitle}</span></div><div className="wk-top-actions">{repository.mode === 'server' && <button className="wk-button" onClick={() => setModal('assistant')}><Sparkles size={15} />위키에 질문</button>}{(selected || draft) ? <button className={'wk-icon' + (inspectorOpen ? ' is-active' : '')} aria-label="문서 정보 패널" aria-pressed={inspectorOpen} onClick={() => setInspectorOpen(value => !value)}><PanelRight size={18} /></button> : <><button className="wk-button wk-button--subtle" onClick={() => setModal('import')}><Upload size={15} /><span>가져오기</span></button><button className="wk-button wk-button--primary" onClick={() => createPage()} disabled={loading}><Plus size={16} />새 문서</button></>}</div></header>
      {repository.mode === 'server' && !graphMode && !warroomMode && <WikiPipeline onRefresh={refreshLibrary} />}
      {error && <div className="wk-alert" role="alert"><AlertCircle size={16} /><span>{error}</span><button className="wk-icon" onClick={() => setError('')} aria-label="오류 닫기"><X size={15} /></button></div>}
      {notice && <div className="wk-notice" role="status"><Check size={14} /><span>{notice}</span><button onClick={() => setNotice('')} aria-label="알림 닫기"><X size={13} /></button></div>}
      {loading ? <div className="wk-loading"><LoaderCircle className="wk-spin" /><span>라이브러리를 불러오는 중…</span></div> : loadFailed ? <div className="wk-empty"><AlertCircle size={30} /><h2>라이브러리를 불러오지 못했습니다.</h2><p>저장된 데이터를 덮어쓰지 않았습니다. 연결 상태를 확인하고 다시 시도해 주세요.</p><button className="wk-button" onClick={() => setLoadAttempt(value => value + 1)}>다시 불러오기</button></div> : draft ? <>
        <div className="wk-editor-toolbar"><div><Pencil size={15} /><strong>{editId ? '문서 편집' : '새 문서 작성'}</strong><span>{dirty ? '저장되지 않은 변경사항' : 'Markdown 지원'}</span></div><div><button className="wk-icon" aria-label="분할 미리보기" aria-pressed={editorMode === 'split'} onClick={() => setEditorMode(value => value === 'split' ? 'write' : 'split')}><Columns2 size={17} /></button><button className="wk-button" disabled={busy} onClick={() => { if (allowLeave()) setDraft(null); }}>취소</button><button className="wk-button wk-button--primary" disabled={busy || !draft.title.trim()} onClick={() => void saveDraft()}>{busy ? <LoaderCircle className="wk-spin" size={14} /> : <Check size={14} />}저장<span className="wk-key">⌘ S</span></button></div></div>
        <div className="wk-editor-meta"><input className="wk-title-input" aria-label="문서 제목" readOnly={busy} value={draft.title} onChange={event => updateDraft({ title: event.target.value })} placeholder="지식에 이름을 붙여주세요" maxLength={200} /><div><CustomSelect disabled={busy} aria-label="문서 유형" value={draft.entryType ?? (editId?.startsWith('source-') ? 'source' : 'article')} options={Object.entries(WIKI_ENTRY_TYPES).map(([value, label]) => ({ value, label }))} onValueChange={value => updateDraft({ entryType: value as WikiEntryType })} /><CustomSelect disabled={busy} aria-label="문서 분야" value={draft.category} options={categories} onValueChange={value => updateDraft({ category: value })} /><CustomSelect disabled={busy} aria-label="문서 상태" value={draft.status} options={Object.entries(WIKI_STATUS).map(([value, label]) => ({ value, label }))} onValueChange={value => updateDraft({ status: value as WikiStatus })} /><CustomSelect disabled={busy} aria-label="대표 이미지" value={draft.cover || 'auto'} options={[{ value: 'auto', label: '대표 이미지 · 자동 추천' }, ...Object.entries(WIKI_COVERS).map(([value, cover]) => ({ value, label: cover.label }))]} onValueChange={value => updateDraft({ cover: value as WikiCoverChoice })} /><label className="wk-tags-input"><Tag size={13} /><input aria-label="문서 태그" readOnly={busy} value={draft.tags.join(', ')} onChange={event => updateDraft({ tags: event.target.value.split(',') })} placeholder="태그, 쉼표로 구분" /></label></div></div>
        <div className="wk-formatbar"><button onClick={() => insertText('## ')} title="제목 삽입">H2</button><button onClick={() => insertText('**', '**')} title="굵게"><b>B</b></button><button onClick={() => insertText('- ')} title="목록 삽입"><List size={15} /></button><button onClick={() => insertText('- [ ] ')} title="체크리스트 삽입"><Check size={15} /></button><span /><button onClick={() => insertText('[[', ']]')} title="위키 문서 링크 삽입"><Link2 size={15} />문서 연결</button><small>[[문서 제목]]으로 지식을 연결하세요</small></div>
        <div className={'wk-editor-panels' + (editorMode === 'split' ? ' is-split' : '')}><textarea ref={editorRef} aria-label="Markdown 본문" readOnly={busy} value={draft.content} onChange={event => updateDraft({ content: event.target.value })} placeholder={'## 개요\n\n현장에서 얻은 지식을 기록하세요.\n\n[[관련 문서]]를 연결하면 백링크가 만들어집니다.'} spellCheck={false} /><div className="wk-editor-preview"><span className="wk-preview-label">미리보기</span><WikiMarkdown content={draft.content} pages={activePages} onNavigate={goPage} onCreate={createPage} /></div></div>
        <footer className="wk-document-footer"><span>{draft.content.length.toLocaleString()}자</span><span>출처 {draft.sources.length}개</span><span>저장할 때 새 수정 이력 생성</span></footer>
      </> : selected && encyclopediaMode ? <RegistryDetailView key={selected.id} page={selected} pages={activePages} busy={busy} onNavigate={goPage} onBack={openEncyclopedia} onEdit={() => startDraft({ ...selected }, selected.id, selected.version)} onHistory={() => { setInspectorOpen(true); setInspectorTab('history'); }} onGraph={() => openGraphDocument(selected.id)} onSource={source => void openSource(source)} onSaveProcess={async content => { const next = await changePage(selected, { content }, '업무구조도 변경'); if (!next) throw new Error('구조도를 저장하지 못했습니다. 화면의 오류를 확인해 주세요.'); }} /> : selected ? <>
        <div className="wk-document-toolbar"><div><span className={'wk-status wk-status--' + selected.status}>{WIKI_STATUS[selected.status]}</span><span className="wk-version">v{selected.version}</span></div><div><button className={'wk-icon wk-star' + (selected.pinned ? ' is-on' : '')} onClick={() => void changePage(selected, { pinned: !selected.pinned }, '즐겨찾기 변경')} disabled={busy} aria-label="문서 즐겨찾기" aria-pressed={selected.pinned}><Star size={17} /></button><button className="wk-icon" aria-label="Markdown 내보내기" title="Markdown 내보내기" onClick={() => download(selected.title.replace(/[\\/:*?"<>|]/g, '_') + '.md', '# ' + selected.title + '\n\n' + selected.content + (selected.sources.length ? '\n\n---\n\n## 출처\n\n' + selected.sources.map(source => '- ' + source.title + (source.href ? ' (' + source.href + ')' : '')).join('\n') : ''))}><ArrowDownToLine size={17} /></button><button className="wk-icon" aria-label={selected.status === 'archived' ? '보관 해제' : '문서 보관'} title={selected.status === 'archived' ? '보관 해제' : '문서 보관'} disabled={busy} onClick={() => void changePage(selected, { status: selected.status === 'archived' ? 'draft' : 'archived' }, selected.status === 'archived' ? '보관 해제' : '문서 보관')}><Archive size={17} /></button><button className="wk-button" onClick={() => startDraft({ ...selected }, selected.id, selected.version)}><Pencil size={14} />편집</button></div></div>
        <div className="wk-reader" key={selected.id}><article><div className="wk-document-eyebrow"><span>{selected.category} · {WIKI_ENTRY_TYPES[entryType(selected)]}</span><i />INDEX KNOWLEDGE</div><h1 className="wk-document-title">{selected.title}</h1><div className="wk-document-meta"><span className="wk-author-avatar">{selected.updatedBy.slice(0, 1)}</span><span>{selected.updatedBy}</span><i />{dateLabel(selected.updatedAt)} 수정<i />약 {Math.max(1, Math.ceil(selected.content.length / 600))}분 읽기</div>{selected.tags.length > 0 && <div className="wk-document-tags">{selected.tags.map(tag => <button key={tag} onClick={() => { home(); setQuery(tag); }}>#{tag}</button>)}</div>}<figure className="wk-reader-cover"><img {...wikiCoverImage(coverForPage(selected))} sizes="(max-width: 680px) 90vw, 760px" decoding="async" /><figcaption>AI 생성 대표 이미지 · 실제 원본 자료는 출처에서 확인하세요.</figcaption></figure>{selected.status !== 'published' && <p className="wk-ency-caution">이 항목은 {WIKI_STATUS[selected.status]} 상태입니다. 검수 완료된 지식으로 간주하지 마세요.</p>}{toc.length > 0 && <nav className="wk-article-toc" aria-label="항목 목차"><h2>목차</h2>{toc.map(item => <button key={item.id} style={{ paddingLeft: (item.level - 1) * 14 }} onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{item.text}</button>)}</nav>}<div className="wk-reading-rule" />{selected.content ? <WikiMarkdown content={selected.content} pages={activePages} onNavigate={goPage} onCreate={createPage} /> : <div className="wk-empty-body"><FileText /><p>아직 본문이 없습니다.</p><button className="wk-button" onClick={() => startDraft({ ...selected }, selected.id, selected.version)}>내용 작성하기</button></div>}
          <section className="wk-article-references"><h2>출처 및 원본 자료</h2>{selected.sources.length ? <ol>{selected.sources.map(source => <li key={source.id}><button onClick={() => void openSource(source)}>{source.title}<ExternalLink size={14} /></button>{source.excerpt && <p>{source.excerpt}</p>}</li>)}</ol> : <p>연결된 원본 자료가 없습니다. 내용을 검증할 수 있는 출처를 보완해 주세요.</p>}</section>
          <button className="wk-button" onClick={() => { setInspectorOpen(true); setInspectorTab('history'); }}><History size={15} />편집 역사 · v{selected.version}</button>
          <div className="wk-reader-bottom"><Link2 size={16} /><div><strong>이 지식의 다음 연결</strong><span>{outgoing.length ? outgoing.length + '개의 문서 링크가 연결되어 있습니다.' : '편집에서 [[문서 제목]]을 추가해 지식을 연결하세요.'}</span></div><button className="wk-icon" aria-label="연결 정보 보기" onClick={() => { setInspectorOpen(true); setInspectorTab('context'); }}><ArrowUpRight size={18} /></button></div>
        </article></div><footer className="wk-document-footer"><span>{selected.content.length.toLocaleString()}자</span><span>출처 {selected.sources.length}개 · 백링크 {backlinks.length}개</span><span><Check size={12} />v{selected.version} 저장됨</span></footer>
      </> : pageId ? <div className="wk-empty"><FileText size={36} /><h2>문서를 찾지 못했습니다.</h2><p>다른 계정의 문서이거나 현재 작업공간에 없는 문서입니다.</p><button className="wk-button" onClick={() => home()}>라이브러리로 돌아가기</button></div> : warroomMode ? <Suspense fallback={<div className="wk-empty">지식 현황판을 불러오는 중…</div>}><WikiWarroom pages={pages} onNavigate={goPage} onGraph={()=>openGraphDocument(null)} onRegistry={openEncyclopedia} onImport={()=>setModal('import')} serverEnabled={repository.mode === 'server'}/></Suspense> : graphMode ? <div className="wk-graph-stage">{graph.nodes.length ? <WikiGraph theme="dark" nodes={graph.nodes} edges={graph.edges} selectedId={graphDocument?.id ?? null} onSelect={openGraphDocument} search={query} onLibrary={openEncyclopedia} onWarroom={openWarroom} onCreate={()=>createPage()} onAsk={repository.mode === 'server' ? ()=>setModal('assistant') : undefined} /> : <div className="wk-empty wk-empty--dark"><Network size={36}/><h2>INDEX 지식 은하</h2><p>문서와 자료를 추가하면 분야별 지식이 연결됩니다.</p><button className="wk-button wk-button--primary" onClick={()=>setModal('import')}><Upload size={15}/>자료 가져오기</button><button className="wk-button" onClick={openEncyclopedia}>지식 대장</button></div>}</div> : encyclopediaMode ? <WikiEncyclopedia pages={pages} query={query} onQuery={setQuery} onNavigate={goPage} onCreate={startDraft} onLibrary={() => home()} onGraph={() => openGraphDocument(null)} onWarroom={openWarroom} /> : <div className="wk-library-scroll">
        <section className="wk-library-hero"><div><span className="wk-eyebrow"><span />THE COLLECTIVE MEMORY OF INDEX</span><h1>경험을 기록하고,<br /><em>지식으로 연결합니다.</em></h1><p>현장의 기록부터 검증된 기준까지.<br className="wk-mobile-only" /> INDEX의 지식이 쌓이는 공간입니다.</p></div><figure className="wk-library-photo"><img {...wikiCoverImage('interior')} sizes="(max-width: 900px) 0px, 400px" decoding="async" /><figcaption>SPACE, MATERIAL & KNOWLEDGE</figcaption></figure></section>
        <div className="wk-stats"><div><BookOpen size={17} /><strong>{activePages.length.toString().padStart(2, '0')}</strong><span>지식 문서</span></div><div><Link2 size={17} /><strong>{graph.edges.length.toString().padStart(2, '0')}</strong><span>문서 간 연결</span></div><div><Files size={17} /><strong>{activePages.reduce((n, p) => n + p.sources.length, 0).toString().padStart(2, '0')}</strong><span>연결된 출처</span></div><div><ShieldCheck size={17} /><strong>{activePages.filter(p => p.status === 'published').length.toString().padStart(2, '0')}</strong><span>검수 완료</span></div></div>
        <section className="wk-collection"><div className="wk-section-heading"><div><h2>{deferredQuery ? '검색 결과' : sectionTitle}<span>{filteredPages.length}</span></h2><p>{deferredQuery ? '“' + deferredQuery + '” · 제목, 본문, 태그에서 검색합니다' : '흩어진 정보가 하나의 지식이 되는 곳'}</p></div><div className="wk-view-switch" aria-label="문서 보기 방식"><button className={layout === 'grid' ? 'is-active' : ''} aria-label="카드 보기" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><LayoutGrid size={16} /></button><button className={layout === 'list' ? 'is-active' : ''} aria-label="목록 보기" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><List size={17} /></button></div></div>
          {filteredPages.length ? renderCards() : <div className="wk-empty"><span className="wk-empty-art"><BookOpen size={35} /><i /><i /><i /></span><h2>{deferredQuery ? '일치하는 지식을 찾지 못했습니다.' : activePages.length ? '이곳에 해당하는 문서가 없습니다.' : 'INDEX의 첫 번째 지식을 남겨주세요.'}</h2><p>{deferredQuery ? '다른 단어로 검색하거나 검색어를 줄여보세요.' : '문서를 직접 쓰거나, PDF와 기존 자료를 가져와\n출처가 살아 있는 지식 라이브러리를 시작하세요.'}</p><div>{deferredQuery ? <button className="wk-button" onClick={() => setQuery('')}>검색 초기화</button> : <><button className="wk-button" onClick={() => setModal('import')}><Upload size={15} />자료 가져오기</button><button className="wk-button wk-button--primary" onClick={() => createPage()}><Plus size={15} />새 문서 작성</button></>}</div></div>}
        </section>
        <section className="wk-health"><div className="wk-health-title"><span><Sparkles size={17} /></span><div><h2>라이브러리 인사이트</h2><p>좋은 지식은 출처를 남기고, 서로 연결됩니다.</p></div></div><div className="wk-health-grid"><div><span>출처가 연결된 문서</span><strong>{activePages.filter(p => p.sources.length > 0).length}<small> / {activePages.length}</small></strong></div><div><span>아직 작성되지 않은 연결</span><strong>{brokenLinks}<small>개</small></strong></div><button onClick={() => home('review')}><span>검토를 기다리는 지식<ArrowUpRight size={13} /></span><strong>{activePages.filter(p => p.status === 'review').length}<small>개</small></strong></button></div></section>
        <footer className="wk-library-footer"><span>INDEX WIKI</span><span>기록은 남고, 지식은 이어집니다.</span><button onClick={() => setModal('backup')}>문서·이력 내보내기 <ArrowUpRight size={12} /></button></footer>
      </div>}
    </div>

    {(selected || draft) && <aside className="wk-inspector"><div className="wk-inspector-tabs"><button className={inspectorTab === 'context' ? 'is-active' : ''} onClick={() => setInspectorTab('context')}><Info size={14} />문서 정보</button><button className={inspectorTab === 'history' ? 'is-active' : ''} onClick={() => setInspectorTab('history')}><History size={14} />수정 이력</button><button className="wk-icon" aria-label="정보 패널 닫기" onClick={() => setInspectorOpen(false)}><X size={15} /></button></div><div className="wk-inspector-scroll">
      {inspectorTab === 'history' ? <><div className="wk-inspector-intro"><History size={24} /><h3>모든 버전이 남습니다.</h3><p>이전 내용을 확인하거나 새 버전으로 복원할 수 있습니다.</p></div>{historyLoading ? <p className="wk-muted">이력을 불러오는 중…</p> : historyError ? <p className="wk-inline-error">{historyError}</p> : !selected ? <p className="wk-muted">첫 저장 후 이력이 기록됩니다.</p> : <div className="wk-timeline">{revisions.map(rev => <button key={rev.revisionId} onClick={() => setPreviewRevision(rev)}><span className="wk-timeline-dot" /><div><strong>버전 {rev.version}{rev.version === selected.version && <small>현재</small>}</strong><p>{rev.reason}</p><span>{dateLabel(rev.updatedAt)} · {rev.updatedBy}</span></div><ChevronRight size={13} /></button>)}</div>}</> : <>
        <section className="wk-inspector-section"><h3>이 문서에서 <span>ON THIS PAGE</span></h3>{toc.length ? <div className="wk-toc">{toc.map(heading => <button key={heading.id} style={{ paddingLeft: (heading.level - 1) * 9 }} onClick={() => document.getElementById(heading.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{heading.text}</button>)}</div> : <p className="wk-muted">본문에 제목을 추가하면 목차가 표시됩니다.</p>}</section>
        <section className="wk-inspector-section"><h3><Files size={14} />원본 출처 <b>{(draft?.sources || selected?.sources || []).length}</b></h3>{(draft?.sources || selected?.sources || []).length ? (draft?.sources || selected?.sources || []).map(source => <button className="wk-source" key={source.id} onClick={() => void openSource(source)}><FileText size={17} /><span><strong>{source.title}</strong><small>{source.kind === 'file' ? '보존된 원본 파일' : source.kind === 'ontology' ? '지식 그래프' : '원본 자료 열기'}</small></span><ExternalLink size={12} /></button>) : <p className="wk-muted">직접 작성한 문서입니다.<br />자료를 가져오면 원본 출처가 연결됩니다.</p>}</section>
        <section className="wk-inspector-section"><h3><Link2 size={14} />연결된 문서 <b>{outgoing.length}</b></h3>{outgoing.length ? outgoing.map(target => { const page = resolvePage(target, activePages); return <button key={target} className={'wk-related' + (page ? '' : ' is-missing')} onClick={() => page ? goPage(page.id) : createPage(target)}><FileText size={14} /><span>{target}</span>{page ? <ArrowUpRight size={12} /> : <Plus size={12} />}</button>; }) : <p className="wk-muted">[[문서 제목]]으로 연결을 추가하세요.</p>}</section>
        <section className="wk-inspector-section"><h3><ArrowLeft size={14} />백링크 <b>{backlinks.length}</b></h3>{backlinks.length ? backlinks.map(page => <button key={page.id} className="wk-backlink" onClick={() => goPage(page.id)}><strong>{page.title}<ArrowUpRight size={12} /></strong><span>{plainText(page.content).slice(0, 100)}</span></button>) : <p className="wk-muted">이 문서를 참조하는 문서가<br />이곳에 모입니다.</p>}</section>
        <div className="wk-inspector-note"><ShieldCheck size={16} /><p>지식의 근거와 수정 이력을 함께 보존합니다. 가져온 자료는 초안으로 시작합니다.</p></div>
      </>}
    </div></aside>}

    {graphDocument && <WikiDialog key={graphDocument.id} title={graphDocument.title} description={graphDocument.category + ' · ' + WIKI_STATUS[graphDocument.status] + ' · v' + graphDocument.version} onClose={() => openGraphDocument(null)} wide side>
      <div className="wk-graph-document-toolbar"><div className="wk-view-switch" aria-label="문서 표시 방식"><button className={!showGraphMarkdown ? 'is-active' : ''} aria-label="문서 읽기" aria-pressed={!showGraphMarkdown} onClick={() => setShowGraphMarkdown(false)}><BookOpen size={16} /></button><button className={showGraphMarkdown ? 'is-active' : ''} aria-label="Markdown 원문" aria-pressed={showGraphMarkdown} onClick={() => setShowGraphMarkdown(true)}><FileText size={16} /></button></div><span>{showGraphMarkdown ? 'Markdown 원문' : '문서 읽기'}</span><button className="wk-button" onClick={() => { openGraphDocument(null); startDraft({ ...graphDocument }, graphDocument.id, graphDocument.version); }}><Pencil size={14} />편집</button></div>
      <div className="wk-graph-document" key={graphDocument.id + String(showGraphMarkdown)}>{graphDocument.status !== 'published' && <p className="wk-ency-caution">이 문서는 {WIKI_STATUS[graphDocument.status]} 상태입니다. 출처와 검수 상태를 확인해 주세요.</p>}{showGraphMarkdown ? <pre className="wk-graph-document-raw"><code>{graphDocument.content || '아직 본문이 없습니다.'}</code></pre> : <WikiMarkdown content={withoutProcess(graphDocument.content) || '*아직 본문이 없습니다.*'} pages={activePages} onNavigate={openGraphDocument} onCreate={title => { openGraphDocument(null); createPage(title); }} />}
        {graphDocument.sources.length > 0 && <section className="wk-article-references"><h2>원본 출처</h2>{graphDocument.sources.map(source => <button className="wk-source" key={source.id} onClick={() => void openSource(source)}><FileText size={16} /><span><strong>{source.title}</strong><small>보존된 원본 열기</small></span><ExternalLink size={13} /></button>)}</section>}
      </div><div className="wk-graph-document-actions"><span>그래프를 유지한 채 관련 문서를 탐색합니다.</span><button className="wk-button" onClick={() => goPage(graphDocument.id)}>전체 문서로 열기<ArrowUpRight size={14} /></button></div>
    </WikiDialog>}
    {modal === 'import' && <WikiDialog title="지식을 가져오세요" description="원본은 보존하고, 내용을 검토할 수 있는 위키 초안으로 가져옵니다." onClose={() => { if (!busy) setModal(null); }} wide>
      <button className={'wk-upload-zone' + (busy ? ' is-busy' : '')} disabled={busy} onClick={() => fileRef.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void handleFile(file); }}><span>{busy ? <LoaderCircle className="wk-spin" size={25} /> : <Upload size={25} />}</span><strong>{busy ? '원본을 보존하고 텍스트를 추출하는 중…' : '파일을 놓거나 클릭해서 가져오기'}</strong><small>PDF · Markdown · TXT / 최대 20MB</small></button><input ref={fileRef} type="file" accept=".pdf,.md,.txt" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void handleFile(file); }} />
      {importError && <p className="wk-inline-error" role="alert">{importError}</p>}
      <div className="wk-import-heading"><h3>기존 INDEX 자료</h3><span>{imports.length}개</span></div><div className="wk-import-search"><Search size={15} /><input value={importQuery} onChange={event => setImportQuery(event.target.value)} placeholder="문서·원본·개념 검색" aria-label="가져올 자료 검색" /></div><div className="wk-import-list">{importLoading ? <p className="wk-muted">기존 자료를 불러오는 중…</p> : imports.filter(item => item.title.toLocaleLowerCase().includes(importQuery.toLocaleLowerCase())).length ? imports.filter(item => item.title.toLocaleLowerCase().includes(importQuery.toLocaleLowerCase())).map(item => <button key={item.kind + item.id} disabled={busy} onClick={() => void handleImport(item)}><span className="wk-import-icon">{item.kind === 'ontology' ? <Network size={18} /> : <FileText size={18} />}</span><span><strong>{item.title}</strong><small>{item.subtitle}</small></span><Plus size={16} /></button>) : <div className="wk-import-empty"><Files size={24} /><p>가져올 기존 자료가 없습니다.<br />파일을 업로드하거나 새 문서를 작성해 보세요.</p></div>}</div>
    </WikiDialog>}
    {modal === 'assistant' && <aside className="wk-chat-panel"><WikiAssistant pages={activePages} onNavigate={id => goPage(id)} onClose={() => setModal(null)} /></aside>}
    {modal === 'backup' && <WikiDialog title="라이브러리 내보내기" description="축적한 지식을 다른 환경에서도 사용할 수 있도록 보관하세요." onClose={() => { if (!busy) setModal(null); }}><div className="wk-export-summary"><Library size={30} /><div><strong>문서 {pages.length}개와 전체 수정 이력</strong><p>본문, 태그, 연결된 출처와 이전 버전을 JSON 파일로 내보냅니다. PDF·이미지 등 원본 파일은 포함되지 않으며, 각 문서의 출처에서 별도로 내려받을 수 있습니다.</p></div></div><button className="wk-button wk-button--primary wk-full" disabled={busy || loading} onClick={() => void exportLibrary()}>{busy ? <LoaderCircle className="wk-spin" size={15} /> : <ArrowDownToLine size={15} />}JSON 아카이브 다운로드</button></WikiDialog>}
    {previewRevision && <WikiDialog title={'버전 ' + previewRevision.version + ' · ' + previewRevision.title} description={previewRevision.reason + ' · ' + new Date(previewRevision.updatedAt).toLocaleString('ko')} onClose={() => { if (!busy) setPreviewRevision(null); }} wide><div className="wk-revision-preview"><WikiMarkdown content={previewRevision.content} pages={activePages} onNavigate={goPage} onCreate={createPage} /></div><div className="wk-revision-actions"><p>복원하면 현재 내용을 덮어쓰는 새 버전이 생성됩니다.<br />기존 수정 이력은 모두 유지됩니다.</p><button className="wk-button wk-button--primary" disabled={busy || previewRevision.version === selected?.version} onClick={() => void restoreRevision(previewRevision)}><History size={15} />이 버전 복원</button></div></WikiDialog>}
  </div>;
}
