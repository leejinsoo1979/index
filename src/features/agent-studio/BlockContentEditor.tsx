import { Check, ExternalLink, ImagePlus, Plus, Trash2 } from "lucide-react";
import { getBlockText, setBlockText, type AgentBlock, type AgentCitation } from "../../lib/agentStudioStore";
import { BLOCK_TYPE_LABELS } from "./blockTypes";

function stringValue(value: unknown) { return typeof value === "string" ? value : ""; }

export default function BlockContentEditor({ block, onChange }: {
  block: AgentBlock;
  onChange: (block: AgentBlock) => void;
}) {
  const patchContent = (patch: Record<string, unknown>) => onChange({ ...block, content: { ...block.content, ...patch } });
  const citations = block.citations ?? [];
  const patchCitation = (id: string, patch: Partial<AgentCitation>) => onChange({
    ...block,
    citations: citations.map((citation) => citation.id === id ? { ...citation, ...patch } : citation),
  });

  if (block.type === "divider") return <div className="agent-content-divider" role="separator" />;

  if (block.type === "checklist") {
    const items = Array.isArray(block.content.items)
      ? block.content.items.map((item, index) => typeof item === "string" ? { id: String(index), text: item, checked: false } : { id: String((item as { id?: unknown }).id ?? index), text: stringValue((item as { text?: unknown }).text), checked: Boolean((item as { checked?: unknown }).checked) })
      : [];
    return <div className="agent-content-checklist">
      <input className="agent-content__title" value={stringValue(block.content.title)} onChange={(event) => patchContent({ title: event.target.value })} placeholder="체크리스트 제목" />
      {items.map((item, index) => <div key={item.id} className="agent-content-checklist__item">
        <button type="button" className={item.checked ? "is-checked" : ""} onClick={() => patchContent({ items: items.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, checked: !candidate.checked } : candidate) })}>{item.checked && <Check />}</button>
        <input value={item.text} onChange={(event) => patchContent({ items: items.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, text: event.target.value } : candidate) })} placeholder="확인 항목" />
        <button type="button" aria-label="항목 삭제" onClick={() => patchContent({ items: items.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 /></button>
      </div>)}
      <button className="agent-content__subaction" type="button" onClick={() => patchContent({ items: [...items, { id: crypto.randomUUID(), text: "", checked: false }] })}><Plus /> 항목 추가</button>
    </div>;
  }

  if (["table", "cost_table", "schedule", "material_spec"].includes(block.type)) {
    const columns = Array.isArray(block.content.columns) ? block.content.columns.map(String) : ["항목", "내용"];
    const rows = Array.isArray(block.content.rows) ? block.content.rows.map((row) => Array.isArray(row) ? row.map(String) : []) : [["", ""]];
    return <div className="agent-content-table">
      <input className="agent-content__title" value={stringValue(block.content.title)} onChange={(event) => patchContent({ title: event.target.value })} placeholder={`${BLOCK_TYPE_LABELS[block.type]} 제목`} />
      <div className="agent-content-table__scroll"><table><thead><tr>{columns.map((column, columnIndex) => <th key={columnIndex}><input value={column} onChange={(event) => patchContent({ columns: columns.map((value, index) => index === columnIndex ? event.target.value : value) })} /></th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{columns.map((_, columnIndex) => <td key={columnIndex}><input value={row[columnIndex] ?? ""} onChange={(event) => patchContent({ rows: rows.map((candidate, index) => index === rowIndex ? columns.map((__, cellIndex) => cellIndex === columnIndex ? event.target.value : candidate[cellIndex] ?? "") : candidate) })} /></td>)}</tr>)}</tbody></table></div>
      <button className="agent-content__subaction" type="button" onClick={() => patchContent({ rows: [...rows, columns.map(() => "")] })}><Plus /> 행 추가</button>
    </div>;
  }

  if (["image", "image_gallery", "before_after"].includes(block.type)) {
    const src = stringValue(block.content.src);
    return <div className="agent-content-image">
      {src ? <img src={src} alt={stringValue(block.content.alt) || "문서 이미지"} /> : <div className="agent-content-image__empty"><ImagePlus /><strong>이미지를 추가하세요</strong><small>URL을 입력하거나 이미지 에이전트에서 생성할 수 있습니다.</small></div>}
      <label>이미지 URL<input value={src} onChange={(event) => patchContent({ src: event.target.value })} placeholder="https://..." /></label>
      <input value={stringValue(block.content.caption)} onChange={(event) => patchContent({ caption: event.target.value })} placeholder="이미지 설명" />
    </div>;
  }

  if (["source_reference", "law_reference", "construction_standard"].includes(block.type)) {
    return <div className="agent-content-source">
      <textarea value={getBlockText(block)} onChange={(event) => onChange(setBlockText(block, event.target.value))} placeholder="검토한 내용 또는 인용문" rows={4} />
      {citations.map((citation) => <div key={citation.id} className="agent-content-source__card">
        <div><input value={citation.title} onChange={(event) => patchCitation(citation.id, { title: event.target.value })} placeholder="출처명" /><input value={citation.publisher ?? ""} onChange={(event) => patchCitation(citation.id, { publisher: event.target.value })} placeholder="발행기관" /></div>
        <label><ExternalLink /><input value={citation.url ?? ""} onChange={(event) => patchCitation(citation.id, { url: event.target.value })} placeholder="https://공식-출처" /></label>
        <button type="button" onClick={() => onChange({ ...block, citations: citations.filter((item) => item.id !== citation.id) })}><Trash2 /></button>
      </div>)}
      <button className="agent-content__subaction" type="button" onClick={() => onChange({ ...block, citations: [...citations, { id: crypto.randomUUID(), title: "", checkedAt: new Date().toISOString() }] })}><Plus /> 출처 추가</button>
    </div>;
  }

  if (block.type === "qna") {
    return <div className="agent-content-qna"><label>질문<input value={stringValue(block.content.question)} onChange={(event) => patchContent({ question: event.target.value })} placeholder="질문" /></label><label>답변<textarea value={stringValue(block.content.answer)} onChange={(event) => patchContent({ answer: event.target.value })} rows={5} placeholder="답변" /></label></div>;
  }

  if (["seo_meta", "doc_meta"].includes(block.type)) {
    return <div className="agent-content-fields"><label>제목<input value={stringValue(block.content.title)} onChange={(event) => patchContent({ title: event.target.value })} /></label><label>설명<textarea value={stringValue(block.content.description)} onChange={(event) => patchContent({ description: event.target.value })} rows={3} /></label><label>키워드<input value={stringValue(block.content.keywords)} onChange={(event) => patchContent({ keywords: event.target.value })} placeholder="쉼표로 구분" /></label></div>;
  }

  const rows = block.type === "heading" ? 2 : block.type === "quote" || block.type === "callout" || block.type === "risk_warning" ? 3 : 6;
  return <textarea className="agent-content-text" value={getBlockText(block)} onChange={(event) => onChange(setBlockText(block, event.target.value))} rows={rows} placeholder={`${BLOCK_TYPE_LABELS[block.type]} 내용을 입력하세요`} />;
}
