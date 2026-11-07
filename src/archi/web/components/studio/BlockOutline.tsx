'use client';

import { FiTrash2 } from 'react-icons/fi';
import type { EditorBlock } from '@archi-web/components/editor/BlockEditor';

const TYPE_LABELS: Record<string, string> = {
  heading: '제목',
  paragraph: '문단',
  image: '이미지',
  checklist: '체크리스트',
  source_reference: '출처',
  cta: 'CTA',
  chart: '차트',
  table: '표',
  formula: '계산식',
  doc_meta: '문서정보',
  qna: 'Q&A',
  law_reference: '법규',
  callout: '강조',
  quote: '인용',
  code: '코드',
  cost_table: '견적표',
  construction_detail: '시공상세',
  container: '컨테이너',
  rich_text: '서식 텍스트',
  image_gallery: '갤러리',
  before_after: '전/후 비교',
  diagram: '다이어그램',
  construction_standard: '시공기준',
  material_spec: '자재사양',
  schedule: '공정표',
  risk_warning: '위험경고',
  seo_meta: 'SEO',
  blog_section: '블로그섹션',
  technical_section: '기술섹션',
  ontology_summary: '지식요약',
};

function blockSummary(block: EditorBlock): string {
  const c = block.content as { text?: string; title?: string; caption?: string; docCode?: string };
  return (c.text ?? c.title ?? c.caption ?? c.docCode ?? '').slice(0, 24) || '(비어 있음)';
}

type Props = {
  blocks: EditorBlock[];
  selectedBlockId: string | null;
  onSelectBlock: (id: string) => void;
  onAddBlock: () => void;
  onDeleteBlock: (id: string) => void;
};

function OutlineRow({
  block,
  depth,
  selectedBlockId,
  onSelectBlock,
  onDeleteBlock,
}: {
  block: EditorBlock;
  depth: number;
  selectedBlockId: string | null;
  onSelectBlock: (id: string) => void;
  onDeleteBlock: (id: string) => void;
}) {
  const selected = selectedBlockId === block.id;
  const isContainer = block.type === 'container';
  return (
    <li className="group relative" style={{ paddingLeft: depth * 12 }}>
      <button
        onClick={() => onSelectBlock(block.id)}
        className={`w-full rounded-lg border px-2.5 py-2 pr-7 text-left text-xs transition ${
          selected
            ? 'border-zinc-900 bg-zinc-900 text-white'
            : isContainer
              ? 'border-dashed border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400'
              : 'border-zinc-100 bg-zinc-50 text-zinc-600 hover:border-zinc-300'
        }`}
      >
        <span
          className={`mb-0.5 block text-[10px] font-semibold ${
            selected ? 'text-zinc-300' : 'text-zinc-400'
          }`}
        >
          {depth > 0 && '└ '}
          {isContainer && '📦 '}
          {TYPE_LABELS[block.type] ?? block.type}
        </span>
        <span className="block truncate">{blockSummary(block)}</span>
      </button>
      <button
        onClick={() => onDeleteBlock(block.id)}
        title="블록 삭제"
        aria-label="블록 삭제"
        className={`absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded transition ${
          selected
            ? 'text-zinc-400 hover:bg-white/15 hover:text-white'
            : 'text-zinc-300 opacity-0 hover:bg-zinc-200 hover:text-red-600 group-hover:opacity-100'
        }`}
      >
        <FiTrash2 size={12} aria-hidden />
      </button>
    </li>
  );
}

/** 우측 문서 블록 패널 — container 자식을 들여쓴 트리로 표시 + 선택/삭제 + 블록 추가 */
export function BlockOutline({
  blocks,
  selectedBlockId,
  onSelectBlock,
  onAddBlock,
  onDeleteBlock,
}: Props) {
  // parentId 기준으로 트리 구성: 최상위 블록 sortOrder 순 + 각 컨테이너의 자식
  const childrenByParent = new Map<string, EditorBlock[]>();
  for (const b of blocks) {
    if (b.parentId) {
      const list = childrenByParent.get(b.parentId) ?? [];
      list.push(b);
      childrenByParent.set(b.parentId, list);
    }
  }
  const topLevel = blocks
    .filter((b) => !b.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const rows: { block: EditorBlock; depth: number }[] = [];
  for (const block of topLevel) {
    rows.push({ block, depth: 0 });
    const children = (childrenByParent.get(block.id) ?? []).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    for (const child of children) rows.push({ block: child, depth: 1 });
  }

  return (
    <aside className="flex h-full w-full flex-col border-l border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-4 py-3">
        <h2 className="text-xs font-bold text-zinc-700">문서 구조</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {blocks.length === 0 ? (
          <p className="px-2 py-4 text-xs text-zinc-400">블록이 없습니다.</p>
        ) : (
          <ul className="space-y-1">
            {rows.map(({ block, depth }) => (
              <OutlineRow
                key={block.id}
                block={block}
                depth={depth}
                selectedBlockId={selectedBlockId}
                onSelectBlock={onSelectBlock}
                onDeleteBlock={onDeleteBlock}
              />
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-zinc-200 p-3">
        <button
          onClick={onAddBlock}
          className="w-full rounded-lg bg-zinc-900 py-2 text-xs font-bold text-white hover:bg-zinc-700"
        >
          + 블록 추가
        </button>
      </div>
    </aside>
  );
}
