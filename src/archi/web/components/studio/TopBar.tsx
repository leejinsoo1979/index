'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FiChevronDown, FiDownload, FiShare2 } from 'react-icons/fi';
import { apiFetch } from '@archi-web/lib/client/api';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '작성 중',
  NEEDS_REVIEW: '검토 필요',
  APPROVED: '승인됨',
  ARCHIVED: '보관됨',
};

const EXPORT_FORMATS = [
  { format: 'pdf', label: 'PDF — 고객 제안서/기술자료' },
  { format: 'docx', label: 'DOCX — 수정 가능한 보고서' },
  { format: 'markdown', label: 'Markdown — Notion/CMS' },
  { format: 'txt', label: 'TXT — 블로그/카페 복사' },
  { format: 'html', label: 'HTML — 홈페이지/랜딩' },
  { format: 'json', label: 'JSON — 연동/백업/재가공' },
] as const;

type Props = {
  documentId: string;
  title: string;
  status: string;
  saveState: 'idle' | 'saving' | 'saved';
};

/** 문서 상단 바: 제목(인라인 편집) + 상태 + 지식 추출 + 내보내기 */
export function TopBar({ documentId, title, status, saveState }: Props) {
  const [exportOpen, setExportOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState(title);
  const lastSavedTitle = useRef(title);

  // 서버에서 새 제목이 로드되면 동기화 (편집 중이 아닐 때만)
  useEffect(() => {
    if (document.activeElement !== titleInputRef.current) {
      setTitleDraft(title);
      lastSavedTitle.current = title;
    }
  }, [title]);

  const titleInputRef = useRef<HTMLInputElement>(null);

  async function commitTitle() {
    const next = titleDraft.trim();
    if (!next || next === lastSavedTitle.current) {
      setTitleDraft(lastSavedTitle.current);
      return;
    }
    lastSavedTitle.current = next;
    try {
      await apiFetch(`/api/documents/${documentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: next }),
      });
    } catch (e) {
      setNotice((e as Error).message);
    }
  }

  async function handleExport(format: string) {
    setExportOpen(false);
    setBusy('export');
    setNotice(null);
    try {
      const result = await apiFetch<{ downloadUrl: string; filename?: string | null }>('/api/exports', {
        method: 'POST',
        body: JSON.stringify({ documentId, format }),
      });
      // Same-origin blob URL → a named download (window.open after an await can be popup-blocked).
      const link = document.createElement('a');
      link.href = result.downloadUrl;
      link.download = result.filename ?? '';
      link.rel = 'noopener';
      if (!result.downloadUrl.startsWith('blob:')) link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleExtract() {
    setBusy('extract');
    setNotice(null);
    try {
      const stats = await apiFetch<{
        nodesCreated: number;
        nodesLinked: number;
        edgesCreated: number;
      }>('/api/ontology/extract', {
        method: 'POST',
        body: JSON.stringify({ documentId }),
      });
      setNotice(
        `지식 추출: 노드 ${stats.nodesCreated}개 생성 · ${stats.nodesLinked}개 연결 · 관계 ${stats.edgesCreated}개`,
      );
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4">
      <Link href="/studio" className="text-xs text-zinc-400 hover:text-zinc-900">
        ← 문서
      </Link>
      <input
        ref={titleInputRef}
        value={titleDraft}
        onChange={(e) => setTitleDraft(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            titleInputRef.current?.blur();
          }
          if (e.key === 'Escape') {
            setTitleDraft(lastSavedTitle.current);
            titleInputRef.current?.blur();
          }
        }}
        placeholder="제목 없는 문서"
        title="클릭해서 제목 변경"
        className="min-w-0 flex-1 rounded px-1 text-sm font-bold text-zinc-900 outline-none hover:bg-zinc-100 focus:bg-zinc-100"
      />
      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">
        {STATUS_LABELS[status] ?? status}
      </span>
      <span className="text-[11px] text-zinc-400">
        {saveState === 'saving' ? '저장 중...' : saveState === 'saved' ? '저장됨' : ''}
      </span>

      <div className="ml-auto flex items-center gap-2">
        {notice && <span className="max-w-xs truncate text-[11px] text-zinc-500">{notice}</span>}
        <button
          onClick={handleExtract}
          disabled={busy !== null}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-zinc-900 hover:text-zinc-900 disabled:opacity-50"
        >
          <FiShare2 size={12} aria-hidden />
          {busy === 'extract' ? '추출 중...' : '지식 추출'}
        </button>
        <div className="relative">
          <button
            onClick={() => setExportOpen((v) => !v)}
            disabled={busy !== null}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            <FiDownload size={12} aria-hidden />
            {busy === 'export' ? '내보내는 중...' : '내보내기'}
            <FiChevronDown size={12} aria-hidden />
          </button>
          {exportOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-xl">
              {EXPORT_FORMATS.map(({ format, label }) => (
                <button
                  key={format}
                  onClick={() => handleExport(format)}
                  className="block w-full px-4 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-100"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
