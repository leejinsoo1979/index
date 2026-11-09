/** Tools for the selected element, pinned to the top of the canvas (text has its own TextToolbar). */
import { useState } from "react";
import { BringToFront, Copy, Eraser, FlipHorizontal2, FlipVertical2, Lock, Minus, Plus, RotateCcw, RotateCw, SendToBack, Trash2, Undo2, Unlock } from "lucide-react";
import { removeBackground } from "../../../lib/backgroundRemoval";
import { uploadBookFile, type BookElement, type ImageElement } from "../../../lib/flipbooks";
import type { BookEditorApi } from "./useBookEditor";
import "./BookElementToolbar.css";

const SCALE_STEP = 1.1;
const MIN_SIZE = 2;
const turn = (angle: number) => ((Math.round(angle) % 360) + 360) % 360;

export default function BookElementToolbar({ ed, element }: { ed: BookEditorApi; element: BookElement }) {
  const patch = (next: Partial<BookElement>, key?: string) => ed.updateElement(element.id, next, key ? `${key}:${element.id}` : undefined);
  const stopPointer = { onPointerDown: (event: React.PointerEvent) => event.stopPropagation() };
  const [cutoutStatus, setCutoutStatus] = useState("");

  if (element.locked) {
    return (
      <div className="be-floatbar" {...stopPointer}>
        <button type="button" aria-label="잠금 해제" title="잠금 해제" onClick={() => patch({ locked: false })}><Unlock size={16} /></button>
      </div>
    );
  }

  /** Grows or shrinks from the centre, keeping the proportions. */
  const scale = (factor: number) => {
    const shrinkLimit = Math.max(MIN_SIZE / element.w, MIN_SIZE / element.h);
    const applied = Math.max(factor, shrinkLimit);
    const w = element.w * applied;
    const h = element.h * applied;
    patch({ w, h, x: element.x + (element.w - w) / 2, y: element.y + (element.h - h) / 2 }, "scale");
  };
  const rotation = element.rotation ?? 0;

  async function cutOut(image: ImageElement) {
    if (cutoutStatus) return;
    setCutoutStatus("준비 중…");
    try {
      const cutout = await removeBackground(image.src, setCutoutStatus);
      setCutoutStatus("저장 중…");
      const result = await uploadBookFile(ed.book!.id, cutout);
      ed.updateElement(image.id, { src: result, cutout: { original: image.src, result } });
    } catch (error) {
      ed.setNotice(error instanceof Error ? error.message : "배경을 지우지 못했습니다.");
    } finally {
      setCutoutStatus("");
    }
  }
  const restorable = element.type === "image" && element.cutout?.result === element.src ? element.cutout : null;

  return (
    <div className="be-floatbar" {...stopPointer}>
      {element.type === "image" && (
        <>
          {restorable
            ? <button type="button" className="be-floatbar__text" title="배경 제거 전 사진으로" onClick={() => patch({ src: restorable.original, cutout: undefined })}><Undo2 size={15} />원본으로</button>
            : element.src && <button type="button" className="be-floatbar__text" disabled={Boolean(cutoutStatus)} onClick={() => void cutOut(element)}><Eraser size={15} />{cutoutStatus || "배경 제거"}</button>}
          <i className="be-floatbar__sep" />
          <button type="button" aria-label="좌우 반전" title="좌우 반전" className={element.flipX ? "is-on" : ""} onClick={() => patch({ flipX: !element.flipX })}><FlipHorizontal2 size={16} /></button>
          <button type="button" aria-label="상하 반전" title="상하 반전" className={element.flipY ? "is-on" : ""} onClick={() => patch({ flipY: !element.flipY })}><FlipVertical2 size={16} /></button>
          <i className="be-floatbar__sep" />
        </>
      )}
      <button type="button" aria-label="왼쪽으로 90도 회전" title="왼쪽으로 90도" onClick={() => patch({ rotation: turn(rotation - 90) })}><RotateCcw size={16} /></button>
      <input
        className="be-floatbar__angle"
        type="number"
        min={0}
        max={359}
        aria-label="회전 각도"
        value={Math.round(rotation)}
        onChange={(event) => patch({ rotation: turn(Number(event.target.value) || 0) }, "rotation")}
        onKeyDown={(event) => event.stopPropagation()}
      />
      <button type="button" aria-label="오른쪽으로 90도 회전" title="오른쪽으로 90도" onClick={() => patch({ rotation: turn(rotation + 90) })}><RotateCw size={16} /></button>
      <i className="be-floatbar__sep" />
      <button type="button" aria-label="작게" title="작게" onClick={() => scale(1 / SCALE_STEP)}><Minus size={16} /></button>
      <button type="button" aria-label="크게" title="크게" onClick={() => scale(SCALE_STEP)}><Plus size={16} /></button>
      <i className="be-floatbar__sep" />
      <button type="button" aria-label="앞으로" title="앞으로" onClick={() => ed.reorderElement(element.id, 1)}><BringToFront size={16} /></button>
      <button type="button" aria-label="뒤로" title="뒤로" onClick={() => ed.reorderElement(element.id, -1)}><SendToBack size={16} /></button>
      <i className="be-floatbar__sep" />
      <button type="button" aria-label="복제" title="복제" onClick={() => ed.duplicateElement(element.id)}><Copy size={16} /></button>
      <button type="button" aria-label="잠금" title="잠금" onClick={() => patch({ locked: true })}><Lock size={16} /></button>
      <button type="button" aria-label="삭제" title="삭제" onClick={() => ed.removeElement(element.id)}><Trash2 size={16} /></button>
    </div>
  );
}
