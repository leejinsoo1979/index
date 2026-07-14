import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { type AgentBlock, type AgentBlockType } from "../../lib/agentStudioStore";
import BlockContentEditor from "./BlockContentEditor";
import { BLOCK_TYPE_LABELS } from "./blockTypes";

const PALETTE: AgentBlockType[] = ["heading", "paragraph", "rich_text", "checklist", "image", "table", "quote", "callout", "law_reference", "construction_detail", "cost_table", "divider"];

export default function FlowBlockEditor({ blocks, selectedId, onSelect, onChange, onDelete, onAdd, onReorder }: {
  blocks: AgentBlock[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (block: AgentBlock) => void;
  onDelete: (id: string) => void;
  onAdd: (type: AgentBlockType) => void;
  onReorder: (draggedId: string, targetId: string) => void;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const ordered = useMemo(() => [...blocks].sort((a, b) => a.sortOrder - b.sortOrder), [blocks]);
  return <div className="agent-flow-editor">
    {ordered.map((block) => <article
      key={block.id}
      className={`agent-flow-block agent-flow-block--${block.type} ${selectedId === block.id ? "is-selected" : ""}`}
      onClick={() => onSelect(block.id)}
      draggable
      onDragStart={() => setDraggedId(block.id)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => { if (draggedId && draggedId !== block.id) onReorder(draggedId, block.id); setDraggedId(null); }}
    >
      <div className="agent-flow-block__rail"><GripVertical /><span>{BLOCK_TYPE_LABELS[block.type]}</span><button type="button" onClick={(event) => { event.stopPropagation(); onDelete(block.id); }} aria-label="블록 삭제"><Trash2 /></button></div>
      <BlockContentEditor block={block} onChange={onChange} />
    </article>)}
    <div className="agent-flow-add">
      <button type="button" onClick={() => setPaletteOpen((value) => !value)}><Plus /> 블록 추가</button>
      {paletteOpen && <div className="agent-flow-add__palette">{PALETTE.map((type) => <button key={type} type="button" onClick={() => { onAdd(type); setPaletteOpen(false); }}>{BLOCK_TYPE_LABELS[type]}</button>)}</div>}
    </div>
  </div>;
}
