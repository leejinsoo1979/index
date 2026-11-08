/* Adapted from hosungseo/korea100 warroom (web/public/warroom/index.html), MIT (c) 2026 Hoseong Seo.
   See third_party/korea100/LICENSE and NOTICE.
   Layout kept from the original: HUD brand + big counter, priority-signal chips, left gate rail with
   stacked progress bars, detail card, daily-board style rows × columns, route/pipeline panel,
   bottom ticker + nav. Data is INDEX's own wiki repository — no government dataset is used. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CustomSelect } from '@/components/ui/custom-select';
import { knowledgeRequest } from '@/lib/knowledgeServer';
import { WIKI_CATEGORIES, WIKI_STATUS, type WikiPage } from '../../../../wiki/types';
import { resolvePage, wikiLinks } from '../../../../wiki/markdown';
import WarroomStage, { STAGE_STATUS, type StageGate, type StageStatus } from './WarroomStage';
import './WikiWarroom.css';

export type WikiWarroomProps = {
  pages: WikiPage[];
  serverEnabled?: boolean;
  onNavigate: (id: string) => void;
  onGraph: () => void;
  onRegistry: () => void;
  onImport: () => void;
};

type Job = { id: string; source_id?: string | null; state: string; attempts?: number; error?: string | null };
type ServerStatus = {
  mode?: string;
  pages?: number;
  sources?: number;
  events?: number;
  exportError?: string | null;
  jobs?: Job[];
  storage?: string;
  model?: string | null;
  worker?: string;
};

type FieldStat = {
  key: string;
  total: number;
  published: WikiPage[];
  review: WikiPage[];
  draft: WikiPage[];
  sourced: WikiPage[];
  unsourced: WikiPage[];
  missingFrom: WikiPage[];
  isolated: WikiPage[];
  links: number;
  latest?: WikiPage;
};

type Lens = 'review' | 'unsourced' | 'missing' | 'isolated' | 'jobs';
type Selection = { kind: 'field'; key: string } | { kind: 'lens'; lens: Lens } | null;
type SortKey = 'total' | 'review' | 'recent' | 'name';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'total', label: '문서 많은 순' },
  { value: 'review', label: '검토 대기 많은 순' },
  { value: 'recent', label: '최근 수정 순' },
  { value: 'name', label: '이름 순' },
];

const LENS_LABEL: Record<Lens, string> = {
  review: '검토 대기',
  unsourced: '출처 없음',
  missing: '없는 문서를 가리키는 링크',
  isolated: '연결 없는 문서',
  jobs: '처리 작업',
};

/** Imported data sometimes stores several options in one string ("공간|자재"); show the first. */
function fieldOf(page: WikiPage) {
  const first = (page.category || '').split(/[,|\n]/)[0]?.trim();
  return first || '일반';
}

const byUpdated = (a: WikiPage, b: WikiPage) => (b.updatedAt || '').localeCompare(a.updatedAt || '');

function ago(iso?: string) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR');
}

function analyze(pages: WikiPage[]) {
  const active = pages.filter((p) => p.status !== 'archived');
  const archived = pages.length - active.length;
  const outgoing = new Map<string, number>();
  const incoming = new Map<string, number>();
  const missingTargets = new Map<string, { target: string; from: Set<string> }>();
  const hasMissing = new Set<string>();
  const linkTargets = new Map<string, string[]>();

  for (const page of active) {
    for (const target of wikiLinks(page.content || '')) {
      const other = resolvePage(target, active);
      if (other && other.id !== page.id) {
        const list = linkTargets.get(page.id) ?? [];
        if (!list.includes(other.id)) list.push(other.id);
        linkTargets.set(page.id, list);
        outgoing.set(page.id, (outgoing.get(page.id) ?? 0) + 1);
        incoming.set(other.id, (incoming.get(other.id) ?? 0) + 1);
      } else if (!other) {
        const key = target.normalize('NFC').toLocaleLowerCase();
        const entry = missingTargets.get(key) ?? { target, from: new Set<string>() };
        entry.from.add(page.id);
        missingTargets.set(key, entry);
        hasMissing.add(page.id);
      }
    }
  }

  const fields = new Map<string, FieldStat>();
  const ensure = (key: string) => {
    let f = fields.get(key);
    if (!f) {
      f = { key, total: 0, published: [], review: [], draft: [], sourced: [], unsourced: [], missingFrom: [], isolated: [], links: 0 };
      fields.set(key, f);
    }
    return f;
  };
  for (const key of WIKI_CATEGORIES) ensure(key);

  for (const page of [...active].sort(byUpdated)) {
    const f = ensure(fieldOf(page));
    f.total += 1;
    if (!f.latest) f.latest = page;
    if (page.status === 'published') f.published.push(page);
    else if (page.status === 'review') f.review.push(page);
    else f.draft.push(page);
    if ((page.sources ?? []).length > 0) f.sourced.push(page);
    else f.unsourced.push(page);
    if (hasMissing.has(page.id)) f.missingFrom.push(page);
    const out = outgoing.get(page.id) ?? 0;
    f.links += out;
    if (out === 0 && (incoming.get(page.id) ?? 0) === 0) f.isolated.push(page);
  }

  const all = [...fields.values()];
  const sum = (pick: (f: FieldStat) => number) => all.reduce((n, f) => n + pick(f), 0);
  return {
    active,
    archived,
    fields: all,
    totals: {
      docs: active.length,
      published: sum((f) => f.published.length),
      review: sum((f) => f.review.length),
      draft: sum((f) => f.draft.length),
      sourced: sum((f) => f.sourced.length),
      unsourced: sum((f) => f.unsourced.length),
      isolated: sum((f) => f.isolated.length),
      links: sum((f) => f.links),
      missingLinks: [...missingTargets.values()].reduce((n, m) => n + m.from.size, 0),
    },
    missingTargets: [...missingTargets.values()].sort((a, b) => b.from.size - a.from.size),
    linkTargets,
    hasMissing,
    incoming,
    recent: [...active].sort(byUpdated).slice(0, 18),
  };
}

/** Original warroom counts its big number up on boot. */
function useCountUp(target: number) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || target === 0) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return value;
}

export default function WikiWarroom({ pages, onNavigate, onGraph, onRegistry, onImport, serverEnabled = true }: WikiWarroomProps) {
  const data = useMemo(() => analyze(pages), [pages]);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [sort, setSort] = useState<SortKey>('total');
  const [lit, setLit] = useState(false);
  const [view, setView] = useState<'stage' | 'table'>('stage');
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const bigNum = useCountUp(data.totals.docs);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!serverEnabled) return;
    let alive = true;
    const load = () =>
      knowledgeRequest<ServerStatus>('status')
        .then((s) => {
          if (!alive) return;
          setStatus(s);
          setStatusError(null);
        })
        .catch((e: Error) => alive && setStatusError(e.message));
    void load();
    const timer = window.setInterval(load, 15000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [serverEnabled]);

  useEffect(() => {
    const t = window.setTimeout(() => setLit(true), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelection(null);
        setSelectedDoc(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const jobs = status?.jobs ?? [];
  const jobCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of jobs) m.set(j.state, (m.get(j.state) ?? 0) + 1);
    return m;
  }, [jobs]);
  const failedJobs = jobs.filter((j) => j.state === 'failed' || j.state === 'error');
  const openJobs = jobs.filter((j) => j.state === 'queued' || j.state === 'running' || j.state === 'claimed');

  const visibleFields = useMemo(() => {
    const rows = data.fields.filter((f) => f.total > 0 || (WIKI_CATEGORIES as readonly string[]).includes(f.key));
    const sorted = [...rows];
    if (sort === 'total') sorted.sort((a, b) => b.total - a.total || a.key.localeCompare(b.key, 'ko'));
    if (sort === 'review') sorted.sort((a, b) => b.review.length - a.review.length || b.total - a.total);
    if (sort === 'recent') sorted.sort((a, b) => (b.latest?.updatedAt || '').localeCompare(a.latest?.updatedAt || ''));
    if (sort === 'name') sorted.sort((a, b) => a.key.localeCompare(b.key, 'ko'));
    return sorted;
  }, [data.fields, sort]);

  // 3D wall: one tower per 분야, panels stacked by 검수 단계 (bottom → top), one tile per document.
  const stageGates = useMemo<StageGate[]>(() => {
    const docStatus = (p: WikiPage, base: StageStatus): StageStatus => (data.hasMissing.has(p.id) ? 'broken' : base);
    const doc = (p: WikiPage, base: StageStatus) => ({ id: p.id, title: p.title, status: docStatus(p, base), links: data.linkTargets.get(p.id) ?? [] });
    return visibleFields
      .filter((f) => f.total > 0)
      .map((f) => {
        const reviewSourced = f.review.filter((p) => (p.sources ?? []).length > 0);
        const reviewUnsourced = f.review.filter((p) => (p.sources ?? []).length === 0);
        const panels = [
          { key: 'draft', label: '초안', docs: f.draft.map((p) => doc(p, 'draft')) },
          { key: 'unsourced', label: '검토 대기 · 출처 없음', docs: reviewUnsourced.map((p) => doc(p, 'unsourced')) },
          { key: 'ready', label: '검토 대기 · 출처 있음', docs: reviewSourced.map((p) => doc(p, 'ready')) },
          { key: 'published', label: '검수 완료', docs: f.published.map((p) => doc(p, 'published')) },
        ].filter((p) => p.docs.length > 0);
        return { key: f.key, label: f.key, panels };
      });
  }, [visibleFields, data.hasMissing, data.linkTargets]);

  // Overview flow: strongest cross-분야 links (hub documents first).
  const overviewRoute = useMemo(() => {
    const field = new Map(data.active.map((p) => [p.id, fieldOf(p)]));
    const hubs = [...data.active].sort((a, b) => (data.incoming.get(b.id) ?? 0) + (data.linkTargets.get(b.id)?.length ?? 0) - ((data.incoming.get(a.id) ?? 0) + (data.linkTargets.get(a.id)?.length ?? 0)));
    const pairs: string[][] = [];
    const seen = new Set<string>();
    for (const p of hubs) {
      for (const target of data.linkTargets.get(p.id) ?? []) {
        if (field.get(target) === field.get(p.id)) continue;
        const key = [field.get(p.id), field.get(target)].sort().join('→');
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push([p.id, target]);
        if (pairs.length >= 8) return pairs;
      }
    }
    return pairs;
  }, [data.active, data.incoming, data.linkTargets]);

  const selectedPage = selectedDoc ? data.active.find((p) => p.id === selectedDoc) : undefined;
  const maxTotal = Math.max(1, ...data.fields.map((f) => f.total));
  const t = data.totals;
  const publishedRate = t.docs ? Math.round((t.published / t.docs) * 100) : 0;

  const signals: { lens: Lens; n: number; tone: 'warn' | 'danger' | 'accent' | 'muted' }[] = [
    { lens: 'review', n: t.review, tone: 'warn' },
    { lens: 'unsourced', n: t.unsourced, tone: 'danger' },
    { lens: 'missing', n: t.missingLinks, tone: 'danger' },
    { lens: 'isolated', n: t.isolated, tone: 'muted' },
    { lens: 'jobs', n: openJobs.length + failedJobs.length, tone: failedJobs.length ? 'danger' : 'accent' },
  ];

  const selectedField = selection?.kind === 'field' ? data.fields.find((f) => f.key === selection.key) : undefined;
  const asOf = new Date().toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div ref={rootRef} className={`wk-warroom${lit ? ' is-lit' : ''}${view === 'stage' ? ' is-stage' : ''}`}>
      {view === 'stage' && (
        <WarroomStage
          gates={stageGates}
          focusedGate={selection?.kind === 'field' ? selection.key : null}
          selectedDoc={selectedDoc}
          overviewRoute={overviewRoute}
          onFocusGate={(key) => setSelection(key ? { kind: 'field', key } : null)}
          onSelectDoc={setSelectedDoc}
        />
      )}
      <div className="wr-scan" aria-hidden />

      {/* ── HUD top: brand + big counter ── */}
      <header className="wr-top">
        <div className="wr-brand">
          <div className="wr-sys">
            <span className={`wr-dot${statusError ? ' is-off' : ''}`} aria-hidden />
            INDEX · WIKI WARROOM — {!serverEnabled ? '문서 현황' : statusError ? 'SERVER OFFLINE' : status ? 'LIVE' : '연결 중'}
          </div>
          <h1>
            INDEX 위키
            <br />
            <em>지식 현황판</em>
          </h1>
          <p className="wr-asof">
            기준 {asOf} · {status?.storage ?? (serverEnabled ? '지식 서버' : '라이브러리')} · 보관 문서 {data.archived}건 제외
          </p>
          <div className="wr-brief" role="group" aria-label="우선 확인 신호">
            {signals.map((s) => (
              <button
                type="button"
                key={s.lens}
                className={`wr-chip${selection?.kind === 'lens' && selection.lens === s.lens ? ' is-on' : ''}`}
                onClick={() => setSelection((cur) => (cur?.kind === 'lens' && cur.lens === s.lens ? null : { kind: 'lens', lens: s.lens }))}
              >
                <i className={`wr-tone wr-tone--${s.tone}`} aria-hidden />
                {LENS_LABEL[s.lens]} <b>{s.lens === 'jobs' && !status ? '—' : s.n}</b>
              </button>
            ))}
          </div>
        </div>
        <div className="wr-counter">
          <div className="wr-num">{bigNum.toLocaleString('ko-KR')}</div>
          <div className="wr-cap">저장 문서 STORED DOCUMENTS</div>
          <div className="wr-legend">
            {(['published', 'ready', 'unsourced', 'broken', 'draft'] as StageStatus[]).map((k) => {
              const n = stageGates.reduce((sum, g) => sum + g.panels.reduce((m, p) => m + p.docs.filter((d) => d.status === k).length, 0), 0);
              return (
                <span key={k}>
                  <i className="wr-tone" style={{ background: STAGE_STATUS[k].css, boxShadow: `0 0 6px ${STAGE_STATUS[k].css}` }} />
                  {STAGE_STATUS[k].label} {n}
                </span>
              );
            })}
          </div>
        </div>
      </header>

      <div className="wr-body">
        {/* ── left gate rail: fields with stacked status bars ── */}
        <nav className="wr-rail" aria-label="분야">
          <p className="wr-label">분야 FIELDS</p>
          {visibleFields.map((f, i) => {
            const on = selection?.kind === 'field' && selection.key === f.key;
            const w = (n: number) => `${(n / maxTotal) * 100}%`;
            return (
              <button
                type="button"
                key={f.key}
                className={`wr-gate${on ? ' is-on' : ''}${f.total === 0 ? ' is-empty' : ''}`}
                onClick={() => {
                  setSelectedDoc(null);
                  setSelection(on ? null : { kind: 'field', key: f.key });
                }}
              >
                <span className="wr-gl">
                  <span className="wr-gn">{String(i + 1).padStart(2, '0')}</span>
                  {f.key}
                </span>
                <span className="wr-bar" aria-hidden>
                  <i className="wr-seg--ok" style={{ width: w(f.published.length) }} />
                  <i className="wr-seg--warn" style={{ width: w(f.review.length) }} />
                  <i className="wr-seg--muted" style={{ width: w(f.draft.length) }} />
                </span>
                <span className="wr-gp">
                  {f.total === 0 ? '문서 없음' : `문서 ${f.total} · 검수 ${f.published.length} · 대기 ${f.review.length}`}
                </span>
              </button>
            );
          })}
        </nav>

        {/* ── center: daily-board style field × status rows ── */}
        <section className="wr-board" aria-label="분야별 현황" aria-hidden={view !== 'table'}>
          <div className="wr-board__head">
            <div>
              <h2>
                분야별 현황 — <em>상태·근거·연결</em>
              </h2>
              <p>
                전체 {t.docs}건 · 검수율 {publishedRate}% · 출처 연결 {t.sourced}건 · 내부 링크 {t.links}개
              </p>
            </div>
            <CustomSelect
              className="cselect__trigger--compact cselect__trigger--toolbar wr-sort"
              value={sort}
              onValueChange={(v) => setSort(v as SortKey)}
              options={SORT_OPTIONS}
              aria-label="정렬"
            />
          </div>

          <div className="wr-rows" role="table" aria-label="분야 × 상태">
            <div className="wr-row wr-row--head" role="row">
              <span role="columnheader">분야</span>
              <span role="columnheader">검수 완료</span>
              <span role="columnheader">검토 대기</span>
              <span role="columnheader">초안</span>
              <span role="columnheader">출처 없음</span>
              <span role="columnheader">깨진 링크</span>
            </div>
            {visibleFields.map((f) => (
              <div className="wr-row" role="row" key={f.key}>
                <button
                  type="button"
                  role="rowheader"
                  className={`wr-rowh${selection?.kind === 'field' && selection.key === f.key ? ' is-on' : ''}`}
                  onClick={() => setSelection({ kind: 'field', key: f.key })}
                >
                  <b>{f.key}</b>
                  <span>
                    문서 {f.total} · 링크 {f.links}
                    {f.latest ? ` · ${ago(f.latest.updatedAt)}` : ''}
                  </span>
                </button>
                <Cell list={f.published} tone="ok" onNavigate={onNavigate} />
                <Cell list={f.review} tone="warn" onNavigate={onNavigate} />
                <Cell list={f.draft} tone="muted" onNavigate={onNavigate} />
                <Cell list={f.unsourced} tone="danger" onNavigate={onNavigate} />
                <Cell list={f.missingFrom} tone="danger" onNavigate={onNavigate} />
              </div>
            ))}
          </div>

          <p className="wr-scope">
            이 현황판은 위키에 저장된 문서의 상태·출처·내부 링크만 집계합니다. 법령 조문 검증 결과와 현장 공정 기록은
            아직 위키에 연결되지 않아 집계하지 않습니다(0건으로 표시하지 않음).
          </p>
        </section>

        {/* ── right: detail card + pipeline (route panel) ── */}
        <aside className="wr-side">
          <div className="wr-detail">
            {(selection || selectedDoc) && (
              <button type="button" className="wr-close" aria-label="선택 해제" onClick={() => { setSelection(null); setSelectedDoc(null); }}>
                ✕
              </button>
            )}
            {selectedPage ? (
              <DocDetail
                page={selectedPage}
                links={(data.linkTargets.get(selectedPage.id) ?? []).map((id) => data.active.find((p) => p.id === id)).filter((p): p is WikiPage => Boolean(p))}
                backlinks={data.active.filter((p) => (data.linkTargets.get(p.id) ?? []).includes(selectedPage.id))}
                broken={data.hasMissing.has(selectedPage.id)}
                onSelect={setSelectedDoc}
                onNavigate={onNavigate}
              />
            ) : selectedField ? (
              <FieldDetail field={selectedField} onNavigate={onNavigate} onRegistry={onRegistry} />
            ) : selection?.kind === 'lens' ? (
              <LensDetail
                lens={selection.lens}
                data={data}
                jobs={jobs}
                onNavigate={onNavigate}
                onImport={onImport}
              />
            ) : (
              <>
                <div className="wr-d-gate">OVERVIEW · 최근 수정</div>
                <div className="wr-d-name">무엇이 막 바뀌었나</div>
                <ul className="wr-list">
                  {data.recent.slice(0, 8).map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => onNavigate(p.id)}>
                        <span>{p.title}</span>
                        <small>
                          {fieldOf(p)} · {WIKI_STATUS[p.status]} · {ago(p.updatedAt)}
                        </small>
                      </button>
                    </li>
                  ))}
                  {data.recent.length === 0 && <li className="wr-empty">저장된 문서가 없습니다.</li>}
                </ul>
              </>
            )}
          </div>

          <div className="wr-route">
            <div className="wr-route__head">
              <span className="wr-route__t">처리 파이프라인 PIPELINE</span>
              <span className={`wr-route__worker${status?.worker === 'running' ? ' is-run' : ''}`}>
                {!serverEnabled ? '서버 미연결' : statusError ? '연결 안 됨' : !status ? '연결 중' : status.worker === 'running' ? '처리 중' : '대기'}
              </span>
            </div>
            {!serverEnabled ? <p className="wr-route__note">지식 서버에 연결한 라이브러리에서 처리 상태를 확인할 수 있습니다.</p> : statusError ? (
              <p className="wr-route__note">지식 서버 상태를 읽지 못했습니다: {statusError}</p>
            ) : !status ? (
              <p className="wr-route__note">상태를 불러오는 중…</p>
            ) : (
              <>
                <div className="wr-route__big">
                  {openJobs.length}
                  <small> 진행·대기</small>
                </div>
                <div className="wr-route__grid">
                  <span>원본 자료</span>
                  <b>{status.sources ?? 0}</b>
                  <span>완료</span>
                  <b>{(jobCounts.get('done') ?? 0) + (jobCounts.get('completed') ?? 0)}</b>
                  <span>실패</span>
                  <b className={failedJobs.length ? 'is-bad' : ''}>{failedJobs.length}</b>
                  <span>취소</span>
                  <b>{jobCounts.get('cancelled') ?? 0}</b>
                  <span>모델</span>
                  <b className="wr-route__model">{status.model ?? '미설정'}</b>
                </div>
                {status.exportError && <p className="wr-route__gap">내보내기 오류: {status.exportError}</p>}
                <p className="wr-route__note">최근 작업 {jobs.length}건 기준 · 15초마다 갱신</p>
              </>
            )}
          </div>
        </aside>
      </div>

      {/* ── bottom: ticker + nav ── */}
      <footer className="wr-bottom">
        <div className="wr-ticker" aria-hidden>
          <span className="wr-strip">
            {[...data.recent, ...data.recent].map((p, i) => (
              <span key={`${p.id}-${i}`} className="wr-tick">
                <b>{p.title}</b>
                <span className={`wr-t-st wr-t-st--${p.status}`}>{WIKI_STATUS[p.status]}</span>
                {ago(p.updatedAt)}
              </span>
            ))}
          </span>
        </div>
        <div className="wr-nav">
          <div className="wr-links">
            <button type="button" className={view === 'stage' ? 'is-on' : ''} aria-pressed={view === 'stage'} onClick={() => setView('stage')}>
              개요 OVERVIEW
            </button>
            <button type="button" className={view === 'table' ? 'is-on' : ''} aria-pressed={view === 'table'} onClick={() => setView('table')}>
              전체표 TABLE
            </button>
            <button type="button" onClick={onGraph}>
              은하 그래프 GRAPH
            </button>
            <button type="button" onClick={onRegistry}>
              문서 대장 REGISTRY
            </button>
            <button type="button" onClick={onImport}>
              자료 가져오기 IMPORT
            </button>
          </div>
          <span className="wr-hint">{view === 'stage' ? '탑 클릭 = 분야 확대 · 칸 클릭 = 문서 흐름 · ESC = 전체 화면 복귀' : '분야·신호 클릭 = 상세 · ESC = 선택 해제'}</span>
        </div>
      </footer>
    </div>
  );
}

function DocDetail({ page, links, backlinks, broken, onSelect, onNavigate }: { page: WikiPage; links: WikiPage[]; backlinks: WikiPage[]; broken: boolean; onSelect: (id: string) => void; onNavigate: (id: string) => void }) {
  const status: StageStatus = broken ? 'broken' : page.status === 'published' ? 'published' : page.status === 'review' ? ((page.sources ?? []).length ? 'ready' : 'unsourced') : 'draft';
  const s = STAGE_STATUS[status];
  return (
    <>
      <div className="wr-d-gate">DOC · {fieldOf(page)}</div>
      <div className="wr-d-name">{page.title}</div>
      <span className="wr-d-st" style={{ color: s.css, borderColor: s.css }}>
        {s.en} · {s.label}
      </span>
      <p className="wr-d-meta">
        출처 {(page.sources ?? []).length} · 연결 {links.length} · 참조됨 {backlinks.length} · {ago(page.updatedAt)}
      </p>
      <button type="button" className="wr-d-open" onClick={() => onNavigate(page.id)}>
        문서 열기 →
      </button>
      {links.length > 0 && (
        <>
          <div className="wr-d-sub">흐름 → 이 문서가 연결한 지식 ({links.length})</div>
          <ul className="wr-list">
            {links.slice(0, 8).map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onSelect(p.id)}>
                  <span>{p.title}</span>
                  <small>{fieldOf(p)} · {WIKI_STATUS[p.status]}</small>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {backlinks.length > 0 && (
        <>
          <div className="wr-d-sub">흐름 ← 이 문서를 참조 ({backlinks.length})</div>
          <ul className="wr-list">
            {backlinks.slice(0, 6).map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onSelect(p.id)}>
                  <span>{p.title}</span>
                  <small>{fieldOf(p)} · {WIKI_STATUS[p.status]}</small>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {links.length + backlinks.length === 0 && <p className="wr-d-meta">아직 다른 문서와 연결되지 않았습니다.</p>}
    </>
  );
}

function Cell({ list, tone, onNavigate }: { list: WikiPage[]; tone: 'ok' | 'warn' | 'muted' | 'danger'; onNavigate: (id: string) => void }) {
  if (list.length === 0) {
    return (
      <span role="cell" className="wr-cell is-empty">
        —
      </span>
    );
  }
  const first = list[0]!;
  return (
    <button type="button" role="cell" className={`wr-cell wr-cell--${tone}`} onClick={() => onNavigate(first.id)} title={`${first.title} 열기`}>
      <span className="wr-cell__top">
        <i className={`wr-tone wr-tone--${tone}`} aria-hidden />
        {list.length}건
      </span>
      <span className="wr-cell__nm">{first.title}</span>
      <span className="wr-cell__who">{ago(first.updatedAt)}</span>
    </button>
  );
}

function FieldDetail({ field, onNavigate, onRegistry }: { field: FieldStat; onNavigate: (id: string) => void; onRegistry: () => void }) {
  const rate = field.total ? Math.round((field.published.length / field.total) * 100) : 0;
  const docs = [...field.review, ...field.draft, ...field.published].sort(byUpdated).slice(0, 7);
  const state = field.total === 0 ? '문서 없음' : field.unsourced.length > field.total / 2 ? '근거 보강 필요' : field.review.length > 0 ? '검수 진행 중' : '검수 완료';
  return (
    <>
      <div className="wr-d-gate">FIELD · 분야</div>
      <div className="wr-d-name">{field.key}</div>
      <div className="wr-d-row">
        <span>문서 DOCUMENTS</span>
        <b>{field.total}</b>
      </div>
      <div className="wr-d-grid">
        <span>검수율</span>
        <b>{rate}%</b>
        <span>출처 연결</span>
        <b>{field.sourced.length}</b>
        <span>내부 링크</span>
        <b>{field.links}</b>
        <span>깨진 링크 문서</span>
        <b className={field.missingFrom.length ? 'is-bad' : ''}>{field.missingFrom.length}</b>
        <span>연결 없는 문서</span>
        <b>{field.isolated.length}</b>
      </div>
      <span className="wr-d-st">{state}</span>
      <ul className="wr-list">
        {docs.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => onNavigate(p.id)}>
              <span>{p.title}</span>
              <small>
                {WIKI_STATUS[p.status]} · {ago(p.updatedAt)}
              </small>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="wr-d-link" onClick={onRegistry}>
        → 문서 대장에서 전체 보기
      </button>
    </>
  );
}

function LensDetail({
  lens,
  data,
  jobs,
  onNavigate,
  onImport,
}: {
  lens: Lens;
  data: ReturnType<typeof analyze>;
  jobs: Job[];
  onNavigate: (id: string) => void;
  onImport: () => void;
}) {
  const pick = (k: 'review' | 'unsourced' | 'isolated') => data.fields.flatMap((f) => f[k]).sort(byUpdated);
  return (
    <>
      <div className="wr-d-gate">SIGNAL · 확인 필요</div>
      <div className="wr-d-name">{LENS_LABEL[lens]}</div>
      {lens === 'missing' ? (
        <>
          <p className="wr-d-note">본문의 [[링크]]가 가리키는데 아직 없는 문서입니다. 새 문서를 쓰거나 링크를 고치세요.</p>
          <ul className="wr-list">
            {data.missingTargets.slice(0, 12).map((m) => (
              <li key={m.target}>
                <button type="button" onClick={() => onNavigate([...m.from][0]!)}>
                  <span>[[{m.target}]]</span>
                  <small>{m.from.size}개 문서에서 참조 · 첫 문서 열기</small>
                </button>
              </li>
            ))}
            {data.missingTargets.length === 0 && <li className="wr-empty">깨진 링크가 없습니다.</li>}
          </ul>
        </>
      ) : lens === 'jobs' ? (
        <>
          <p className="wr-d-note">원본 자료를 위키 문서로 바꾸는 작업 대기열입니다.</p>
          <ul className="wr-list">
            {jobs.slice(0, 12).map((j) => (
              <li key={j.id} className="wr-job">
                <span>
                  {j.state} · 시도 {j.attempts ?? 0}
                </span>
                <small>{j.error ? j.error.slice(0, 120) : j.source_id ?? j.id}</small>
              </li>
            ))}
            {jobs.length === 0 && <li className="wr-empty">작업이 없습니다.</li>}
          </ul>
          <button type="button" className="wr-d-link" onClick={onImport}>
            → 자료 가져오기
          </button>
        </>
      ) : (
        <ul className="wr-list">
          {pick(lens).slice(0, 12).map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onNavigate(p.id)}>
                <span>{p.title}</span>
                <small>
                  {fieldOf(p)} · {WIKI_STATUS[p.status]} · {ago(p.updatedAt)}
                </small>
              </button>
            </li>
          ))}
          {pick(lens).length === 0 && <li className="wr-empty">해당 문서가 없습니다.</li>}
        </ul>
      )}
    </>
  );
}
