import { Move, Scaling } from "lucide-react";
import { useMemo, type PointerEvent as ReactPointerEvent } from "react";
import { type AgentBlock, type AgentCanvasLayout } from "../../lib/agentStudioStore";
import BlockContentEditor from "./BlockContentEditor";

const DEFAULT_W = 660;

function layoutFor(block: AgentBlock, index: number): AgentCanvasLayout {
  return block.metadata?.canvas ?? { x: 72, y: 72 + index * 150, w: DEFAULT_W, h: block.type === "heading" ? 100 : 132 };
}

export default function CanvasView({ blocks, selectedId, onSelect, onChange }: {
  blocks: AgentBlock[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (block: AgentBlock) => void;
}) {
  const ordered = useMemo(() => [...blocks].sort((a, b) => a.sortOrder - b.sortOrder), [blocks]);

  const startPointer = (event: ReactPointerEvent, block: AgentBlock, mode: "move" | "resize") => {
    event.preventDefault();
    event.stopPropagation();
    onSelect(block.id);
    const start = layoutFor(block, ordered.findIndex((item) => item.id === block.id));
    const startX = event.clientX;
    const startY = event.clientY;
    const move = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const canvas = mode === "move"
        ? { ...start, x: Math.max(0, Math.min(820 - start.w, start.x + dx)), y: Math.max(0, start.y + dy) }
        : { ...start, w: Math.max(220, Math.min(820 - start.x, start.w + dx)), h: Math.max(72, start.h + dy) };
      onChange({ ...block, metadata: { ...block.metadata, canvas } });
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };

  return <div className="agent-canvas-stage"><div className="agent-canvas-artboard" onClick={() => onSelect("")}>
    {ordered.map((block, index) => {
      const layout = layoutFor(block, index);
      return <article key={block.id} className={`agent-canvas-item ${selectedId === block.id ? "is-selected" : ""}`} style={{ left: layout.x, top: layout.y, width: layout.w, minHeight: layout.h }} onClick={(event) => { event.stopPropagation(); onSelect(block.id); }}>
        <button type="button" className="agent-canvas-item__move" onPointerDown={(event) => startPointer(event, block, "move")} aria-label="블록 이동"><Move /></button>
        <BlockContentEditor block={block} onChange={onChange} />
        <button type="button" className="agent-canvas-item__resize" onPointerDown={(event) => startPointer(event, block, "resize")} aria-label="블록 크기 조절"><Scaling /></button>
      </article>;
    })}
  </div></div>;
}
