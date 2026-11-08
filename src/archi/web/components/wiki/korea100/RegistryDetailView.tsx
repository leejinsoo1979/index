/* Adapted from Korea100 InstitutionDetailView, MIT (c) 2026 Hoseong Seo.
 * Retains the title band, structure board, metric strip, canvas and evidence layout.
 * Data and document actions use the existing INDEX wiki repository. */
import { useMemo, useState, type ReactNode } from 'react';
import { Dialog } from 'radix-ui';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Copy, FileText, History, Link2, Pencil, X } from 'lucide-react';
import { WIKI_STATUS, type WikiPage, type WikiSource } from '../../../../wiki/types';
import { WIKI_ENTRY_TYPES, articleLead, entryType } from '../../../../wiki/encyclopedia';
import { documentSections, readProcess, registryRecords, registryStatus, relatedWikiPages, withoutProcess, writeProcess } from '../../../../wiki/registry';
import { WikiMarkdown } from '../WikiMarkdown';
import DesktopProcessBoard from './DesktopProcessBoard';
import KnowledgeFlow from './KnowledgeFlow';
import { CustomSelect } from '@/components/ui/custom-select';
import ProcessEditor from './ProcessEditor';
import styles from './InstitutionDetail.module.css';
import './process.css';
import './index-adapter.css';

type Props = {
  page: WikiPage; pages: WikiPage[]; busy: boolean; onNavigate: (id: string) => void;
  onBack: () => void; onEdit: () => void; onHistory: () => void; onGraph: () => void;
  onSource: (source: WikiSource) => void; onSaveProcess: (content: string) => Promise<void>;
};
export function RegistryDetailView({page, pages, busy, onNavigate, onBack, onEdit, onHistory, onGraph, onSource, onSaveProcess}: Props) {
  const [compact, setCompact] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [processEditing, setProcessEditing] = useState(false);
  const [tab, setTab] = useState<'canvas' | 'document'>('canvas');
  const [copied, setCopied] = useState(false);
  const active = useMemo(() => registryRecords(pages).map(r=>r.page), [pages]);
  const currentIndex = active.findIndex(p=>p.id === page.id);
  const processState = useMemo(() => readProcess(page.content), [page.content]);
  const related = useMemo(() => relatedWikiPages(page, active), [page, active]);
  const sections = useMemo(() => documentSections(page), [page]);
  const verification = registryStatus(page);
  const process = processState.process;
  // 업무구조도 when the document has one; otherwise the knowledge flow (참조 → 이 항목 → 연결) is drawn by KnowledgeFlow.
  const flow = process;
  const boardProcess = useMemo(() => flow ? (process ? {...flow,nodes:flow.nodes.map((n,i)=>({...n,display_id:String(i+1).padStart(2,'0')}))} : flow) : null, [flow, process]);
  const stats = [
    {value:related.all.length, label:'연결 지식'}, {value:page.sources.length, label:'원본 출처'},
    {value:process?.nodes.length ?? sections.length, label:process?'업무 노드':'본문 항목'}, {value:related.incoming.length, label:'참조 문서'}, {value:'v'+page.version, label:'저장 버전'},
  ];
  const node = process?.nodes.find(n=>n.id === selectedNode);
  const relatedDocument = !process ? active.find(p=>p.id===selectedNode) : null;
  const sourcePages = active.filter(p=>p.id !== page.id && p.sources.some(s=>page.sources.some(source=>source.id===s.id)));
  return <div className={styles.detail + ' wk-korea100-scope wk-registry-detail'} data-source-layout="korea100">
    <div className={styles.switcher}>
      <button className="kr-command" onClick={onBack}><ArrowLeft size={15}/>지식 대장</button>
      <CustomSelect aria-label="지식 항목 선택" value={page.id} onValueChange={onNavigate} options={active.map(p=>({value:p.id,label:p.title}))}/>
      <div className={styles.switcherCommands}><button className="kr-command" disabled={currentIndex<=0} aria-label="이전 항목" onClick={()=>onNavigate(active[currentIndex-1]!.id)}><ArrowLeft size={14}/>이전</button><button className="kr-command" disabled={currentIndex<0 || currentIndex>=active.length-1} aria-label="다음 항목" onClick={()=>onNavigate(active[currentIndex+1]!.id)}>다음<ArrowRight size={14}/></button></div>
      <strong>{currentIndex+1} / {active.length}</strong>
    </div>
    <section className={styles.titleBand}>
      <div className={styles.titleTop}><div className={styles.titleCopy}>
        <div className={styles.titleMeta}><span className={styles.priority}>NO {String(currentIndex+1).padStart(2,'0')}</span><span className={styles.category}>{page.category}</span><span>{WIKI_ENTRY_TYPES[entryType(page)]}</span><span className={styles.verificationBadge} data-tone={verification.tone}><i/>{verification.label}</span></div>
        <h1>{page.title}</h1><p>{articleLead(withoutProcess(page.content)) || '이 항목의 개요를 작성해 주세요.'}</p>
      </div><div className={styles.detailActions}><button className="kr-command" onClick={onEdit}><Pencil size={14}/>문서 편집</button><button className="kr-command" onClick={onGraph}><Link2 size={14}/>그래프에서 보기</button></div></div>
      <div className={styles.detailStats} aria-label="지식 구조 통계">{stats.map(stat=><div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}</div>
    </section>
    <nav className="kr-section-nav" aria-label="항목 섹션"><a href="#index-structure">{process ? '업무구조도' : '지식 연결'}</a><a href="#index-one-page">한 장 요약</a><a href="#index-evidence">원본 근거</a><a href="#index-related">관련 지식</a><button onClick={onHistory}><History size={14}/>편집 이력</button></nav>
    {page.status !== 'published' && <p className="kr-review-note">{WIKI_STATUS[page.status]} 항목입니다. 원본 근거와 전문가 검수를 확인해 주세요.</p>}
    <section id="index-structure" className={styles.processSection}>
      <header className={styles.sectionHeading}><div><h2>{process ? '업무구조도' : '지식 연결'}</h2><p>{process ? '행위자와 단계별 업무 흐름 · 노드를 누르면 상세와 근거가 열립니다.' : '원본 문서와 관련 지식을 함께 확인합니다.'}</p></div><button className="kr-command" disabled={busy} onClick={()=>setProcessEditing(true)}><Pencil size={14}/>{process ? '업무구조도 편집' : '업무구조도 작성'}</button></header>
      {processState.error && <p className="kr-review-note" role="alert">구조도를 표시하지 못했습니다: {processState.error}</p>}
      {process && <div className="kr-board-tools"><p>{process ? `${process.lanes.length}개 행위자 · ${process.stages.length}단계 · ${process.nodes.length}개 노드` : `이 항목을 참조 ${related.incoming.length}개 · 이 항목에서 연결 ${related.outgoing.length}개`}</p><div role="group" aria-label="구조도 보기"><button aria-pressed={compact} onClick={()=>setCompact(true)}>핵심 흐름</button><button aria-pressed={!compact} onClick={()=>setCompact(false)}>전체 구조도</button></div></div>}
      {process ? <div className={styles.processPanel + ' kr-process-panel'}><DesktopProcessBoard process={boardProcess!} compact={compact} selectedNodeId={selectedNode ?? ''} onNodeChange={setSelectedNode}/></div> : related.all.length ? <KnowledgeFlow page={page} incoming={related.incoming} outgoing={related.outgoing} onNavigate={onNavigate}/> : <div className="kr-connection-summary"><div><Link2 size={20}/><strong>{related.all.length}개의 지식과 연결되어 있습니다.</strong><span>연결한 문서 {related.outgoing.length} · 참조하는 문서 {related.incoming.length}</span></div><button className="kr-command" onClick={onGraph}>전체 화면에서 관계 보기<ArrowUpRight size={14}/></button></div>}
    </section>
    <section id="index-one-page" className={styles.canvasSection}>
      <header className={styles.sectionHeading}><div><h2>한 장 요약</h2><p>정의 · 주요 내용 · 적용 조건 · 출처</p></div><div className="kr-tab-switch" role="group" aria-label="본문 보기 방식"><button aria-pressed={tab==='canvas'} onClick={()=>setTab('canvas')}>한 장 캔버스</button><button aria-pressed={tab==='document'} onClick={()=>setTab('document')}>전체 문서</button></div></header>
      {tab === 'document' ? <div className="kr-document-body"><WikiMarkdown content={withoutProcess(page.content)} pages={active} onNavigate={onNavigate} onCreate={onEdit}/></div> : <div className={styles.canvasGrid}>
        {sections.length ? sections.map((section,index)=><article key={section.id} className={styles.canvasBlock} data-size={index===0?'wide':undefined}><h3>{section.text}</h3><div className="kr-canvas-preview"><WikiMarkdown content={section.content || '*내용 미작성*'} pages={active} onNavigate={onNavigate} onCreate={onEdit}/></div><button className="kr-canvas-read" onClick={()=>setTab('document')}>전체 내용 읽기<ArrowUpRight size={12}/></button></article>) : <article className={styles.canvasBlock} data-size="wide"><h3>개요</h3><WikiMarkdown content={withoutProcess(page.content) || '*내용 미작성*'} pages={active} onNavigate={onNavigate} onCreate={onEdit}/></article>}
        <article className={styles.canvasBlock}><h3>항목 정보</h3><dl className="kr-meta-list"><dt>분야</dt><dd>{page.category}</dd><dt>검수</dt><dd>{WIKI_STATUS[page.status]}</dd><dt>최근 수정</dt><dd>{new Date(page.updatedAt).toLocaleDateString('ko-KR')}</dd><dt>편집자</dt><dd>{page.updatedBy}</dd><dt>태그</dt><dd>{page.tags.join(' · ') || '없음'}</dd></dl></article>
      </div>}
    </section>
    <section id="index-evidence" className={styles.canvasSection}><header className={styles.sectionHeading}><div><h2>원본 근거</h2><p>연결된 출처 {page.sources.length}개 · 각 출처의 원문을 직접 확인할 수 있습니다.</p></div></header><div className="kr-evidence-list">{page.sources.length ? page.sources.map(source=><article key={source.id}><div><FileText size={19}/><strong>{source.title}</strong><span>{source.kind === 'file' ? '원본 파일' : '원본 자료'}</span><button className="kr-command" onClick={()=>onSource(source)}>원본 열기<ArrowUpRight size={14}/></button></div>{source.excerpt && <blockquote>{source.excerpt}</blockquote>}</article>) : <p className="kr-empty-inline">연결된 원본 출처가 없습니다. 문서 편집 또는 자료 가져오기에서 근거를 보완해 주세요.</p>}</div></section>
    <section id="index-related" className={styles.canvasSection}><header className={styles.sectionHeading}><div><h2>관련 지식</h2><p>문서 링크, 백링크와 공통 출처로 이어집니다.</p></div></header><div className={styles.canvasGrid}><RelatedBlock title="연결한 항목" pages={related.outgoing} onNavigate={onNavigate}/><RelatedBlock title="이 항목을 참조" pages={related.incoming} onNavigate={onNavigate}/><RelatedBlock title="같은 출처를 사용하는 항목" pages={sourcePages} onNavigate={onNavigate}/></div></section>
    <footer className={styles.disclaimer}><strong>INDEX KNOWLEDGE</strong><span>수정일 {new Date(page.updatedAt).toLocaleString('ko-KR')} · v{page.version} · {WIKI_STATUS[page.status]}</span><button className="kr-command" onClick={async()=>{ try {await navigator.clipboard.writeText(window.location.href);setCopied(true);}catch{setCopied(false);} }}>{copied ? <Check size={13}/> : <Copy size={13}/>}링크 복사</button><a href="https://github.com/hosungseo/korea100" target="_blank" rel="noreferrer">Korea100 기반 · MIT</a></footer>
    {relatedDocument && <DetailDialog title={relatedDocument.title} subtitle={relatedDocument.category + ' · ' + WIKI_STATUS[relatedDocument.status] + ' · v' + relatedDocument.version} onClose={()=>setSelectedNode(null)}><div className="kr-node-detail"><WikiMarkdown content={withoutProcess(relatedDocument.content)} pages={active} onNavigate={setSelectedNode} onCreate={onEdit}/><h3>원본 근거</h3>{relatedDocument.sources.map(source=><button key={source.id} className="kr-source-button" onClick={()=>onSource(source)}>{source.title}<ArrowUpRight size={14}/></button>)}<button className="kr-command" onClick={()=>onNavigate(relatedDocument.id)}>전체 항목 열기<ArrowUpRight size={14}/></button></div></DetailDialog>}
    {node && <DetailDialog title={node.name} subtitle={node.lane+' · '+node.stage} onClose={()=>setSelectedNode(null)}><div className="kr-node-detail"><dl className="kr-meta-list"><dt>담당</dt><dd>{node.actor || '미작성'}</dd><dt>수행 내용</dt><dd>{node.action || '미작성'}</dd><dt>입력 자료</dt><dd>{node.input_documents?.join(' · ') || '미작성'}</dd><dt>산출 자료</dt><dd>{node.output_documents?.join(' · ') || '미작성'}</dd><dt>기한</dt><dd>{node.deadline || '미작성'}</dd><dt>주의·병목</dt><dd>{node.blocker || '미작성'}</dd></dl><h3>이 업무의 근거</h3>{node.source_ids?.length ? node.source_ids.map(id=>{const source=page.sources.find(s=>s.id===id);return source ? <button key={id} className="kr-source-button" onClick={()=>onSource(source)}>{source.title}<ArrowUpRight size={14}/></button> : <p key={id}>연결된 출처를 찾지 못했습니다: {id}</p>;}) : <p>이 노드에 지정된 근거가 없습니다.</p>}</div></DetailDialog>}
    {processEditing && <DetailDialog title="업무구조도 편집" subtitle="담당 주체와 단계, 업무 순서 및 원본 근거를 작성합니다." onClose={()=>setProcessEditing(false)}><ProcessEditor page={page} initial={process} onClose={()=>setProcessEditing(false)} onSave={async value=>{await onSaveProcess(writeProcess(page.content,value));setProcessEditing(false);}}/></DetailDialog>}
  </div>;
}
function RelatedBlock({title,pages,onNavigate}:{title:string;pages:WikiPage[];onNavigate:(id:string)=>void}) {
  return <article className={styles.canvasBlock}><h3>{title} · {pages.length}</h3><div className="kr-related-links">{pages.length ? pages.map(p=><button key={p.id} onClick={()=>onNavigate(p.id)}>{p.title}<ArrowUpRight size={13}/></button>) : <p>연결된 항목이 없습니다.</p>}</div></article>;
}
function DetailDialog({title,subtitle,onClose,children}:{title:string;subtitle:string;onClose:()=>void;children:ReactNode}) {
  return <Dialog.Root open onOpenChange={open=>{if(!open)onClose();}}><Dialog.Portal><Dialog.Overlay className="wk-overlay"/><Dialog.Content className="wk-modal wk-modal--wide wk-korea100-scope kr-dialog"><div className="wk-modal-heading"><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{subtitle}</Dialog.Description></div><Dialog.Close className="wk-icon" aria-label="닫기"><X size={18}/></Dialog.Close></div>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
