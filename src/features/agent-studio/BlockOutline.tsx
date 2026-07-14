import { ChevronDown, ChevronRight, GripVertical, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { getBlockText, type AgentBlock, type AgentBlockType } from "../../lib/agentStudioStore";
import { BLOCK_TYPE_LABELS } from "./blockTypes";

const QUICK_TYPES: AgentBlockType[] = ["heading", "paragraph", "checklist", "image", "table", "law_reference", "callout", "container"];

function summary(block: AgentBlock) {
  if (block.type === "divider") return "구분선";
  const text = getBlockText(block).trim().replace(/\s+/g, " ");
  return text || BLOCK_TYPE_LABELS[block.type];
}

export default function BlockOutline({ blocks, selectedId, onSelect, onDelete, onAdd, onReorder }: {
  blocks: AgentBlock[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: (type: AgentBlockType, parentId?: string | null) => void;
  onReorder: (draggedId: string, targetId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const ordered = useMemo(() => [...blocks].sort((a, b) => a.sortOrder - b.sortOrder), [blocks]);
  const topLevel = ordered.filter((block) => !block.parentId);

  const renderRow = (block: AgentBlock, depth = 0) => {
    const children = ordered.filter((candidate) => candidate.parentId === block.id);
    const isCollapsed = collapsed.has(block.id);
    return (
      <div key={block.id}>
        <div
          className={`agent-outline__row ${selectedId === block.id ? "is-selected" : ""}`}
          style={{ paddingLeft: 8 + depth * 15 }}
          draggable
          onDragStart={() => setDraggedId(block.id)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => { if (draggedId && draggedId !== block.id) onReorder(draggedId, block.id); setDraggedId(null); }}
          onClick={() => onSelect(block.id)}
        >
          <GripVertical className="agent-outline__grip" />
          {children.length > 0 ? (
            <button type="button" className="agent-outline__toggle" onClick={(event) => {
              event.stopPropagation();
              setCollapsed((current) => {
                const next = new Set(current);
                if (next.has(block.id)) next.delete(block.id); else next.add(block.id);
                return next;
              });
            }}>{isCollapsed ? <ChevronRight /> : <ChevronDown />}</button>
          ) : <span className="agent-outline__toggle" />}
          <span className="agent-outline__copy"><strong>{BLOCK_TYPE_LABELS[block.type]}</strong><small>{summary(block).slice(0, 34)}</small></span>
          {block.type === "container" && <button type="button" className="agent-outline__child" aria-label="하위 블록 추가" onClick={(event) => { event.stopPropagation(); onAdd("paragraph", block.id); }}><Plus /></button>}
          <button type="button" className="agent-outline__delete" aria-label="블록 삭제" onClick={(event) => { event.stopPropagation(); onDelete(block.id); }}><Trash2 /></button>
        </div>
        {!isCollapsed && children.map((child) => renderRow(child, depth + 1))}
      </div>
    );
  };

  return (
    <aside className="agent-outline">
      <header><div><strong>블록 아웃라인</strong><small>{blocks.length}개 블록</small></div><button type="button" onClick={() => setAdding((value) => !value)} aria-label="블록 추가"><Plus /></button></header>
      {adding && <div className="agent-outline__palette">{QUICK_TYPES.map((type) => <button key={type} type="button" onClick={() => { onAdd(type); setAdding(false); }}>{BLOCK_TYPE_LABELS[type]}</button>)}</div>}
      <div className="agent-outline__list">{topLevel.length ? topLevel.map((block) => renderRow(block)) : <p className="agent-outline__empty">아직 블록이 없습니다.</p>}</div>
      <footer><button type="button" onClick={() => onAdd("paragraph")}><Plus /> 블록 추가</button></footer>
    </aside>
  );
}
