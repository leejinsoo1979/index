/**
 * 원본 자료 — the uploaded originals kept by the INDEX wiki knowledge server (the single source of
 * truth agreed by the team). Replaces the old ARCHI knowledge-base screen, which kept a separate,
 * empty store. Lists originals (PDF/text/documents), which wiki documents cite each one, recent
 * processing state, and lets admins upload new originals or open the stored file.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, FileText, LoaderCircle, RefreshCw, Search, Upload } from 'lucide-react';
import { CustomSelect } from '@/components/ui/custom-select';
import { ingestWikiFile, knowledgeOriginal, knowledgeRequest } from '@/lib/knowledgeServer';
import { NavRail } from '@archi-web/components/studio/NavRail';
import type { WikiPage } from '../../wiki/types';
import './StudioSources.css';

type SourceRecord = {
  id: string;
  title: string;
  name?: string;
  mime?: string;
  kind?: string;
  createdAt?: string;
  actor?: string;
};

type Job = { id: string; source_id?: string | null; state: string; error?: string | null };
type Status = { jobs?: Job[] };

type KindFilter = 'all' | 'pdf' | 'text';
type SortKey = 'recent' | 'name' | 'cited';

const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: '모든 형식' },
  { value: 'pdf', label: 'PDF' },
  { value: 'text', label: '문서·텍스트' },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'recent', label: '최근 올린 순' },
  { value: 'name', label: '이름 순' },
  { value: 'cited', label: '연결 문서 많은 순' },
];

const JOB_LABEL: Record<string, string> = {
  queued: '처리 대기',
  claimed: '처리 중',
  running: '처리 중',
  done: '처리 완료',
  completed: '처리 완료',
  failed: '처리 실패',
  error: '처리 실패',
  cancelled: '처리 제외',
};

const isPdf = (s: SourceRecord) => s.mime === 'application/pdf' || /\.pdf$/i.test(s.name ?? '');

function formatDate(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function StudioSources() {
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [serverFilters, setServerFilters] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [sort, setSort] = useState<SortKey>('recent');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [raw, pageList, status] = await Promise.all([
        knowledgeRequest<SourceRecord[]>('sources?kind=originals'),
        knowledgeRequest<WikiPage[]>('pages'),
        knowledgeRequest<Status>('status').catch(() => ({ jobs: [] }) as Status),
      ]);
      const originals = raw.filter((s) => s.kind !== 'activity');
      // An older server ignores ?kind=originals and returns only the newest activity rows.
      setServerFilters(!(originals.length === 0 && raw.length > 0));
      setSources(originals);
      setPages(pageList);
      setJobs(status.jobs ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  /** source id → wiki documents that cite it */
  const citedBy = useMemo(() => {
    const map = new Map<string, WikiPage[]>();
    for (const page of pages) {
      if (page.status === 'archived') continue;
      for (const s of page.sources ?? []) {
        if (s.storage !== 'server' || !s.fileKey) continue;
        const list = map.get(s.fileKey) ?? [];
        if (!list.includes(page)) list.push(page);
        map.set(s.fileKey, list);
      }
    }
    return map;
  }, [pages]);

  const jobBySource = useMemo(() => {
    const map = new Map<string, Job>();
    for (const j of jobs) if (j.source_id && !map.has(j.source_id)) map.set(j.source_id, j);
    return map;
  }, [jobs]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = sources.filter((s) => {
      if (kind === 'pdf' && !isPdf(s)) return false;
      if (kind === 'text' && isPdf(s)) return false;
      if (!q) return true;
      return `${s.title} ${s.name ?? ''}`.toLowerCase().includes(q);
    });
    const cited = (s: SourceRecord) => citedBy.get(s.id)?.length ?? 0;
    if (sort === 'name') list.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
    else if (sort === 'cited') list.sort((a, b) => cited(b) - cited(a));
    else list.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    return list;
  }, [sources, query, kind, sort, citedBy]);

  const pdfCount = sources.filter(isPdf).length;
  const linkedCount = sources.filter((s) => (citedBy.get(s.id)?.length ?? 0) > 0).length;

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    let added = 0;
    let duplicated = 0;
    try {
      for (const file of Array.from(files)) {
        const result = await ingestWikiFile(file);
        if (result.duplicated) duplicated += 1;
        else added += 1;
      }
      setNotice(
        `${added}개를 올렸습니다${duplicated ? ` · 이미 있던 자료 ${duplicated}개는 건너뜀` : ''}. 위키 문서로 정리되기까지 시간이 걸릴 수 있습니다.`,
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function openOriginal(source: SourceRecord) {
    // Open the tab synchronously so pop-up blockers allow it, then point it at the file.
    const win = window.open('', '_blank');
    try {
      const url = await knowledgeOriginal(source.id);
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch (e) {
      win?.close();
      setError((e as Error).message);
    }
  }

  return (
    <div className="sp flex h-screen overflow-hidden">
      <NavRail />
      <main className="sp-main">
        <header className="sp-head">
          <div className="sp-head__title">
            <h1>원본 자료</h1>
            <p>
              위키 지식서버에 보관된 원본 {sources.length}개 · PDF {pdfCount}개 · 위키 문서와 연결 {linkedCount}개
            </p>
          </div>
          <div className="sp-head__actions">
            <button type="button" className="sp-icon" onClick={() => void load()} disabled={loading} aria-label="새로고침" title="새로고침">
              <RefreshCw size={16} className={loading ? 'sp-spin' : undefined} />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.md,.txt,.json"
              multiple
              hidden
              onChange={(e) => void handleUpload(e.target.files)}
            />
            <button type="button" className="sp-button sp-button--primary" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <LoaderCircle size={15} className="sp-spin" /> : <Upload size={15} />}
              {uploading ? '올리는 중…' : '원본 올리기'}
            </button>
          </div>
        </header>

        <div className="sp-toolbar">
          <label className="sp-search">
            <Search size={15} aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="자료 이름으로 찾기" aria-label="원본 자료 검색" />
          </label>
          <CustomSelect
            className="cselect__trigger--compact cselect__trigger--toolbar sp-select"
            value={kind}
            onValueChange={(v) => setKind(v as KindFilter)}
            options={KIND_OPTIONS}
            aria-label="형식"
          />
          <CustomSelect
            className="cselect__trigger--compact cselect__trigger--toolbar sp-select"
            value={sort}
            onValueChange={(v) => setSort(v as SortKey)}
            options={SORT_OPTIONS}
            aria-label="정렬"
          />
          <span className="sp-toolbar__count">{rows.length}개</span>
        </div>

        {error && (
          <p className="sp-alert" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="sp-notice" role="status">
            {notice}
          </p>
        )}
        {!serverFilters && (
          <p className="sp-alert" role="status">
            지식 서버가 아직 원본 목록 필터를 지원하지 않아 원본이 표시되지 않습니다. 서버 업데이트 후 새로고침해 주세요.
          </p>
        )}

        <div className="sp-scroll">
          {loading && sources.length === 0 ? (
            <div className="sp-empty">
              <LoaderCircle size={20} className="sp-spin" />
              원본 목록을 불러오는 중…
            </div>
          ) : rows.length === 0 ? (
            <div className="sp-empty">
              <FileText size={22} aria-hidden />
              <strong>{sources.length === 0 ? '보관된 원본이 없습니다' : '조건에 맞는 원본이 없습니다'}</strong>
              {sources.length === 0 && <span>PDF·Markdown·텍스트 자료를 올리면 위키 문서로 정리되고 AI 답변의 근거가 됩니다.</span>}
            </div>
          ) : (
            <table className="sp-table">
              <thead>
                <tr>
                  <th>자료</th>
                  <th>형식</th>
                  <th>올린 날짜</th>
                  <th>연결된 위키 문서</th>
                  <th>최근 처리</th>
                  <th aria-label="작업" />
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const cited = citedBy.get(s.id) ?? [];
                  const job = jobBySource.get(s.id);
                  return (
                    <tr key={s.id}>
                      <td>
                        <div className="sp-name">
                          <span className="sp-name__icon" aria-hidden>
                            <FileText size={16} />
                          </span>
                          <span className="sp-name__text">
                            <strong>{s.title}</strong>
                            {s.name && <small>{s.name}</small>}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="sp-tag">{isPdf(s) ? 'PDF' : s.kind === 'document' ? '문서' : '텍스트'}</span>
                      </td>
                      <td className="sp-muted">{formatDate(s.createdAt)}</td>
                      <td>
                        {cited.length === 0 ? (
                          <span className="sp-muted">아직 없음</span>
                        ) : (
                          <div className="sp-cited">
                            <Link to={`/agent-studio/wiki?page=${encodeURIComponent(cited[0]!.id)}`}>{cited[0]!.title}</Link>
                            {cited.length > 1 && <small>외 {cited.length - 1}개</small>}
                          </div>
                        )}
                      </td>
                      <td>
                        {job ? (
                          <span className={`sp-state sp-state--${job.state}`} title={job.error ?? undefined}>
                            {JOB_LABEL[job.state] ?? job.state}
                          </span>
                        ) : (
                          <span className="sp-muted">—</span>
                        )}
                      </td>
                      <td className="sp-actions">
                        <button type="button" className="sp-button" onClick={() => void openOriginal(s)}>
                          <ExternalLink size={14} />
                          원본 열기
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="sp-foot">
            원본은 위키 지식서버(이 서버의 디스크)에 보관됩니다. 업로드한 원본은 AI가 위키 문서로 정리한 뒤 검수를 거쳐 답변 근거로 쓰입니다.
          </p>
        </div>
      </main>
    </div>
  );
}
