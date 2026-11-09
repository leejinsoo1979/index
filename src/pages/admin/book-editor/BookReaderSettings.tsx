import { useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { FiBookOpen, FiX } from "react-icons/fi";
import BookReaderOptions from "../../../components/flipbook/BookReaderOptions";
import { PageTurnAudio } from "../../../components/flipbook/PageTurnAudio";
import FlipViewer from "../../../components/flipbook/FlipViewer";
import { resolveBookReaderSettings } from "../../../lib/book-reader";
import type { BookEditorApi } from "./useBookEditor";

export default function BookReaderSettings({ ed }: { ed: BookEditorApi }) {
  const audio = useRef<PageTurnAudio | null>(null);
  const [preview, setPreview] = useState(false);
  useEffect(() => () => { audio.current?.dispose(); audio.current = null; }, []);
  const reader = resolveBookReaderSettings(ed.book?.reader);
  return <section><h4>책 넘김과 소리</h4><BookReaderOptions value={reader} onChange={patch => {
    if (patch.sound === "none" || patch.volume === 0) audio.current?.stop();
    ed.commit(book => ({ ...book, reader: resolveBookReaderSettings({ ...book.reader, ...patch }) }), patch.volume !== undefined ? "reader-volume" : undefined);
  }} onListen={() => { audio.current ??= new PageTurnAudio(); return audio.current.play(reader.sound, reader.volume); }} />
    <Dialog.Root open={preview} onOpenChange={setPreview}><Dialog.Trigger className="be-btn be-btn--line be-btn--wide"><FiBookOpen />넘김 미리보기</Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="br-preview-overlay" /><Dialog.Content className="br-preview"><Dialog.Title className="br-visually-hidden">책 넘김 미리보기</Dialog.Title><Dialog.Description className="br-visually-hidden">페이지를 넘겨 선택한 효과와 소리를 확인하세요.</Dialog.Description><FlipViewer book={ed.book!} /><Dialog.Close className="br-preview__close" aria-label="넘김 미리보기 닫기"><FiX />닫기</Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
    <p className="be-hint">책 전체에 적용됩니다.</p></section>;
}
