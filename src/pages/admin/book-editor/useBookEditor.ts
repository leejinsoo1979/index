import { useCallback, useEffect, useRef, useState } from "react";
import { convertPdf, getFlipbook, prepareImage, saveFlipbook, uid, uploadBookFile, type BookElement, type BookPage, type Flipbook, type GridCell } from "../../../lib/flipbooks";

export type SaveState = "saved" | "dirty" | "saving" | "error";
export type AssetKind = Flipbook["assets"][number]["kind"];

const HISTORY = 100;
const SAVE_DELAY = 900;
/** Successive edits of one field within this time undo as a single step. */
const MERGE_MS = 900;

const replaceElement = (book: Flipbook, id: string, change: (element: BookElement) => BookElement): Flipbook => ({
  ...book,
  pages: book.pages.map((page) => (page.elements.some((element) => element.id === id) ? { ...page, elements: page.elements.map((element) => (element.id === id ? change(element) : element)) } : page)),
});

/** The open book: every change, undo history, autosave and uploads. */
export function useBookEditor(id: string) {
  const [book, setBook] = useState<Flipbook | null>(null);
  const [missing, setMissing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedId, setPrimaryId] = useState<string | null>(null);
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [activeCell, setActiveCell] = useState(0);
  const setSelectedId = useCallback((id: string | null) => { setPrimaryId(id); setExtraIds([]); setActiveCell(0); }, []);
  const setSelection = useCallback((ids: string[]) => { setPrimaryId(ids[0] ?? null); setExtraIds(ids.slice(1)); setActiveCell(0); }, []);
  const [notice, setNotice] = useState("");

  const current = useRef<Flipbook | null>(null);
  const past = useRef<Flipbook[]>([]);
  const future = useRef<Flipbook[]>([]);
  const lastMerge = useRef({ key: "", at: 0 });
  const timer = useRef(0);
  const saving = useRef(false);
  const again = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    let live = true;
    getFlipbook(id)
      .then((found) => {
        if (!live) return;
        if (!found) { setMissing(true); return; }
        const opened = { ...found, assets: found.assets ?? [] };
        current.current = opened;
        setBook(opened);
        setSavedAt(opened.updatedAt);
      })
      .catch(() => { if (live) setMissing(true); });
    return () => { live = false; };
  }, [id]);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const open = current.current;
    if (!open || !dirty.current) return;
    if (saving.current) { again.current = true; return; }
    saving.current = true;
    dirty.current = false;
    setSaveState("saving");
    try {
      await saveFlipbook(open);
      setSavedAt(Date.now());
      setSaveState(dirty.current ? "dirty" : "saved");
    } catch {
      dirty.current = true;
      setSaveState("error");
    } finally {
      saving.current = false;
      if (again.current) { again.current = false; void flush(); }
    }
  }, []);

  // Leaving the editor must not lose the last edit.
  useEffect(() => () => { void flush(); }, [flush]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty.current) { void flush(); event.preventDefault(); } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [flush]);

  const show = useCallback((next: Flipbook) => {
    current.current = next;
    setBook(next);
    dirty.current = true;
    setSaveState("dirty");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), SAVE_DELAY);
  }, [flush]);

  const remember = useCallback((before: Flipbook) => {
    past.current.push(before);
    if (past.current.length > HISTORY) past.current.shift();
    future.current = [];
  }, []);

  /** A change that is one undo step; pass `mergeKey` so typing in one field stays one step. */
  const commit = useCallback((change: (book: Flipbook) => Flipbook, mergeKey?: string) => {
    const before = current.current;
    if (!before) return;
    const now = Date.now();
    if (!mergeKey || mergeKey !== lastMerge.current.key || now - lastMerge.current.at > MERGE_MS) remember(before);
    lastMerge.current = { key: mergeKey ?? "", at: now };
    show(change(before));
  }, [remember, show]);

  /** A step of a drag: shown and saved but recorded as one undo step by `endDrag`. */
  const drag = useCallback((change: (book: Flipbook) => Flipbook) => {
    if (current.current) show(change(current.current));
  }, [show]);
  const endDrag = useCallback((before: Flipbook) => {
    if (current.current !== before) remember(before);
  }, [remember]);
  const snapshot = useCallback(() => current.current as Flipbook, []);

  const keepSelectionValid = (book: Flipbook) => {
    setPageIndex((index) => Math.min(index, Math.max(0, book.pages.length - 1)));
    setPrimaryId((id) => (id && book.pages.some((page) => page.elements.some((element) => element.id === id)) ? id : null));
    setExtraIds([]);
  };
  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (!previous || !current.current) return;
    future.current.push(current.current);
    lastMerge.current = { key: "", at: 0 };
    show(previous);
    keepSelectionValid(previous);
  }, [show]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next || !current.current) return;
    past.current.push(current.current);
    lastMerge.current = { key: "", at: 0 };
    show(next);
    keepSelectionValid(next);
  }, [show]);

  const updateElement = useCallback((elementId: string, patch: Partial<BookElement>, mergeKey?: string) => {
    commit((open) => replaceElement(open, elementId, (element) => ({ ...element, ...patch }) as BookElement), mergeKey);
  }, [commit]);
  const dragElement = useCallback((elementId: string, patch: Partial<BookElement>) => {
    drag((open) => replaceElement(open, elementId, (element) => ({ ...element, ...patch }) as BookElement));
  }, [drag]);

  /** One step of dragging several elements at once. */
  const dragElements = useCallback((patches: Record<string, Partial<BookElement>>) => {
    drag((open) => ({ ...open, pages: open.pages.map((page) => ({ ...page, elements: page.elements.map((element) => (patches[element.id] ? ({ ...element, ...patches[element.id] }) as BookElement : element)) })) }));
  }, [drag]);
  const updateElements = useCallback((patches: Record<string, Partial<BookElement>>, mergeKey?: string) => {
    commit((open) => ({ ...open, pages: open.pages.map((page) => ({ ...page, elements: page.elements.map((element) => (patches[element.id] ? ({ ...element, ...patches[element.id] }) as BookElement : element)) })) }), mergeKey);
  }, [commit]);
  const removeElements = useCallback((ids: string[]) => {
    commit((open) => ({ ...open, pages: open.pages.map((page) => ({ ...page, elements: page.elements.filter((element) => !ids.includes(element.id)) })) }));
    setSelectedId(null);
  }, [commit, setSelectedId]);
  /** Adds copies to a page, slightly offset, and selects them. Groups stay together under a new id. */
  const placeCopies = useCallback((sources: BookElement[], index: number) => {
    const groups = new Map<string, string>();
    const copies = sources.map((source) => {
      if (source.groupId && !groups.has(source.groupId)) groups.set(source.groupId, uid());
      return { ...source, id: uid(), x: source.x + 2, y: source.y + 2, ...(source.groupId ? { groupId: groups.get(source.groupId) } : {}) } as BookElement;
    });
    commit((open) => ({ ...open, pages: open.pages.map((page, i) => (i === index ? { ...page, elements: [...page.elements, ...copies] } : page)) }));
    setSelection(copies.map((copy) => copy.id));
  }, [commit, setSelection]);

  /** Changes one slot of a photo grid, against the latest book so parallel uploads can't overwrite each other. */
  const setGridCell = useCallback((elementId: string, index: number, patch: Partial<GridCell>, mergeKey?: string) => {
    commit((open) => replaceElement(open, elementId, (element) => (element.type === "grid" ? { ...element, cells: element.cells.map((cell, i) => (i === index ? { ...cell, ...patch } : cell)) } : element)), mergeKey);
  }, [commit]);

  const updatePage = useCallback((index: number, patch: Partial<BookPage>, mergeKey?: string) => {
    commit((open) => ({ ...open, pages: open.pages.map((page, i) => (i === index ? { ...page, ...patch } : page)) }), mergeKey);
  }, [commit]);

  const addElement = useCallback((element: BookElement, index: number) => {
    commit((open) => ({ ...open, pages: open.pages.map((page, i) => (i === index ? { ...page, elements: [...page.elements, element] } : page)) }));
    setSelectedId(element.id);
  }, [commit]);

  const removeElement = useCallback((elementId: string) => {
    commit((open) => ({ ...open, pages: open.pages.map((page) => ({ ...page, elements: page.elements.filter((element) => element.id !== elementId) })) }));
    setSelectedId(null);
  }, [commit]);

  const duplicateElement = useCallback((elementId: string) => {
    const copyId = uid();
    commit((open) => ({
      ...open,
      pages: open.pages.map((page) => {
        const at = page.elements.findIndex((element) => element.id === elementId);
        if (at < 0) return page;
        const source = page.elements[at];
        const elements = [...page.elements];
        elements.splice(at + 1, 0, { ...source, id: copyId, x: source.x + 2, y: source.y + 2 });
        return { ...page, elements };
      }),
    }));
    setSelectedId(copyId);
  }, [commit]);

  /** Moves an element up (+1) or down (-1) the stack. */
  const reorderElement = useCallback((elementId: string, step: 1 | -1) => {
    commit((open) => ({
      ...open,
      pages: open.pages.map((page) => {
        const at = page.elements.findIndex((element) => element.id === elementId);
        const to = at + step;
        if (at < 0 || to < 0 || to >= page.elements.length) return page;
        const elements = [...page.elements];
        [elements[at], elements[to]] = [elements[to], elements[at]];
        return { ...page, elements };
      }),
    }));
  }, [commit]);

  const report = useCallback((error: unknown, fallback: string) => {
    setNotice(error instanceof Error && error.message ? error.message : fallback);
  }, []);

  const rememberAsset = useCallback((url: string, kind: AssetKind) => {
    if (!current.current) return;
    drag((open) => ({ ...open, assets: [{ url, kind }, ...open.assets] }));
  }, [drag]);

  /** Uploads a picked image (shrunk first) and returns its address and size. */
  const uploadImage = useCallback(async (file: File) => {
    setNotice("이미지를 올리는 중…");
    try {
      const prepared = await prepareImage(file);
      const url = await uploadBookFile(id, prepared.image);
      rememberAsset(url, "image");
      setNotice("");
      return { url, width: prepared.width, height: prepared.height };
    } catch (error) {
      report(error, "이미지를 올리지 못했습니다.");
      return null;
    }
  }, [id, rememberAsset, report]);

  const uploadMedia = useCallback(async (file: File, kind: "video" | "audio") => {
    setNotice(kind === "video" ? "비디오를 올리는 중…" : "오디오를 올리는 중…");
    try {
      const url = await uploadBookFile(id, file);
      rememberAsset(url, kind);
      setNotice("");
      return url;
    } catch (error) {
      report(error, "파일을 올리지 못했습니다.");
      return null;
    }
  }, [id, rememberAsset, report]);

  /** Adds a PDF after the current page. Pages appear as they convert; undo removes them all at once. */
  const importPdf = useCallback(async (file: File, afterIndex: number) => {
    const before = current.current;
    if (!before) return;
    // A fresh book with nothing on it is replaced and takes the PDF's page size.
    setExtraIds([]);
    const replaceBlank = before.pages.every((page) => !page.image && page.elements.length === 0);
    let insertAt = replaceBlank ? 0 : afterIndex + 1;
    remember(before);
    lastMerge.current = { key: "", at: 0 };
    setNotice("PDF를 여는 중…");
    try {
      await convertPdf(file, async ({ image, width, height, index, total }) => {
        setNotice(`PDF 변환 중 ${index + 1} / ${total}쪽`);
        const url = await uploadBookFile(id, image);
        const page: BookPage = { id: uid(), image: url, elements: [] };
        drag((open) => {
          const pages = replaceBlank && index === 0 ? [] : [...open.pages];
          pages.splice(insertAt, 0, page);
          return { ...open, pages, ...(replaceBlank && index === 0 ? { width: Math.round(width), height: Math.round(height) } : {}) };
        });
        insertAt += 1;
      });
      setNotice("");
      setSelectedId(null);
    } catch (error) {
      report(error, "PDF를 변환하지 못했습니다.");
    }
  }, [drag, id, remember, report]);

  return {
    book, missing, saveState, savedAt, pageIndex, setPageIndex, selectedId, setSelectedId, notice, setNotice,
    activeCell, setActiveCell, setGridCell,
    selectedIds: selectedId ? [selectedId, ...extraIds] : [], setSelection, dragElements, updateElements, removeElements, placeCopies,
    commit, drag, endDrag, snapshot, undo, redo, flush,
    canUndo: past.current.length > 0, canRedo: future.current.length > 0,
    updateElement, dragElement, updatePage, addElement, removeElement, duplicateElement, reorderElement,
    uploadImage, uploadMedia, importPdf,
  };
}

export type BookEditorApi = ReturnType<typeof useBookEditor>;
