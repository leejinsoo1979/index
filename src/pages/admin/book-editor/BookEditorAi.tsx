import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { FiLoader, FiRefreshCw, FiX } from "react-icons/fi";
import { CustomSelect } from "../../../components/ui/custom-select";
import { adminRequest, buildSpreads, spreadOfPage, uid, type BookElement, type BookPage, type Flipbook, type TextElement } from "../../../lib/flipbooks";
import type { BookEditorApi } from "./useBookEditor";

/**
 * AI writing in two steps: the model reports what it sees in the photos, the editor corrects that,
 * and the article is written from the corrected version. Everything stays editable before and after
 * it goes on the page.
 */
type Reading = { summary: string; observed: string[]; uncertain: string[] };
type Article = { kicker: string; title: string; lead: string; body: string; caption: string };
type Target = "here" | "facing" | "new";

const STYLES = [
  { value: "magazine", label: "매거진 에디토리얼" },
  { value: "essay", label: "감성 에세이" },
  { value: "case", label: "시공 사례 리포트" },
  { value: "product", label: "제품 소개" },
  { value: "column", label: "전문가 칼럼" },
  { value: "caption", label: "짧은 사진 캡션" },
];
const LENGTHS = [{ value: "short", label: "짧게" }, { value: "medium", label: "보통" }, { value: "long", label: "길게" }] as const;
const QUICK_EDITS = ["더 짧게", "더 세련되게", "더 따뜻하게", "더 전문적으로"];
const MAX_PHOTOS = 6;

const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** Photos of the selection; with nothing selected, every photo on the pages in view. */
function photosInView(book: Flipbook, pageIndex: number, selectedIds: string[]): string[] {
  const fromElement = (element: BookElement) => (element.type === "image" ? [element.src] : element.type === "grid" ? element.cells.map((cell) => cell.src ?? "") : []);
  const selected = book.pages.flatMap((page) => page.elements).filter((element) => selectedIds.includes(element.id)).flatMap(fromElement).filter(Boolean);
  if (selected.length > 0) return [...new Set(selected)];
  const spread = buildSpreads(book.pages.length)[spreadOfPage(pageIndex)];
  const pages = [spread?.left, spread?.right].filter((index): index is number => index !== null && index !== undefined).map((index) => book.pages[index]);
  return [...new Set(pages.flatMap((page) => [page.image ?? "", ...page.elements.flatMap(fromElement)]).filter(Boolean))];
}

const LINE_HEIGHT = 1.5;
const linesOf = (text: string, size: number, width: number) => text.split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil((line.length * size * 0.92) / width)), 0);

const isDark = (background?: string) => {
  const match = /^#([0-9a-f]{6})$/i.exec(background ?? "");
  if (!match) return false;
  const value = parseInt(match[1], 16);
  return 0.299 * (value >> 16) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255) < 110;
};

/** Stacks the article inside a band of the page, shrinking the body so it fits. */
function articleElements(article: Article, book: Flipbook, page: BookPage, top: number, bottom: number): BookElement[] {
  const pageHeight = (1000 * book.height) / book.width;
  const left = 10;
  const widthPct = 80;
  const width = widthPct * 10;
  const toPct = (units: number) => (units / pageHeight) * 100;
  const dark = isDark(page.background);
  const ink = dark ? "#f4f4f5" : "#17181c";
  const soft = dark ? "#c6cad2" : "#5a616e";
  const font = "'Noto Sans KR'";
  const text = (value: string, y: number, h: number, patch: Partial<TextElement> & { size: number }): TextElement => ({ id: uid(), type: "text", text: value, x: left, y, w: widthPct, h, color: ink, bold: false, align: "left", font, actions: [], ...patch });

  const room = bottom - top;
  const compact = room < 50;
  const titleSize = compact ? 54 : 76;
  const leadSize = compact ? 24 : 30;
  const sizedHeight = (value: string, size: number, lineHeight: number, columns = 1) => {
    const columnWidth = (width - (columns - 1) * 40) / columns;
    return toPct((Math.ceil(linesOf(value, size, columnWidth) / columns) + 0.6) * size * lineHeight);
  };
  const out: BookElement[] = [];
  let y = top;
  if (article.kicker.trim()) {
    out.push(text(article.kicker, y, toPct(30), { size: 20, color: soft, spacing: 180, bold: true }));
    y += toPct(46);
  }
  const titleHeight = sizedHeight(article.title, titleSize, 1.22);
  out.push(text(article.title, y, titleHeight, { size: titleSize, bold: true, lineHeight: 1.22, spacing: -10 }));
  y += titleHeight + toPct(18);
  if (article.lead.trim()) {
    const leadHeight = sizedHeight(article.lead, leadSize, 1.55);
    out.push(text(article.lead, y, leadHeight, { size: leadSize, color: soft, lineHeight: 1.55 }));
    y += leadHeight + toPct(18);
  }
  out.push({ id: uid(), type: "shape", shape: "rect", fill: ink, x: left, y, w: 9, h: toPct(4), actions: [] });
  y += toPct(30);

  const captionHeight = article.caption.trim() ? toPct(linesOf(article.caption, 20, width) * 20 * LINE_HEIGHT + 12) : 0;
  const bodyRoom = bottom - y - captionHeight - toPct(16);
  const columns = !compact && article.body.length > 420 ? 2 : 1;
  let bodySize = compact ? 22 : 26;
  while (bodySize > 16 && sizedHeight(article.body, bodySize, 1.75, columns) > bodyRoom) bodySize -= 1;
  const bodyHeight = Math.max(bodyRoom > 0 ? Math.min(bodyRoom, sizedHeight(article.body, bodySize, 1.75, columns)) : 0, 2);
  out.push(text(article.body, y, bodyHeight, { size: bodySize, lineHeight: 1.75, columns }));
  if (article.caption.trim()) out.push(text(article.caption, bottom - captionHeight, captionHeight, { size: 20, color: soft, italic: true }));
  return out;
}

/** The empty band on a page, above or below what is already there. */
function freeBand(page: BookPage): { top: number; bottom: number } | null {
  if (page.image) return null;
  const solid = page.elements.filter((element) => element.type !== "link");
  if (solid.length === 0) return { top: 8, bottom: 94 };
  const above = Math.min(...solid.map((element) => element.y));
  const below = Math.max(...solid.map((element) => element.y + element.h));
  const candidates = [{ top: 6, bottom: above - 2 }, { top: below + 2, bottom: 95 }];
  const best = candidates.sort((a, b) => b.bottom - b.top - (a.bottom - a.top))[0];
  return best.bottom - best.top >= 34 ? best : null;
}

export function AiWriterPanel({ ed, onClose }: { ed: BookEditorApi; onClose: () => void }) {
  const book = ed.book!;
  const available = useMemo(() => photosInView(book, ed.pageIndex, ed.selectedIds), [book, ed.pageIndex, ed.selectedIds]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const photos = available.filter((url) => !excluded.includes(url)).slice(0, MAX_PHOTOS);
  const [style, setStyle] = useState("magazine");
  const [length, setLength] = useState<(typeof LENGTHS)[number]["value"]>("medium");
  const [memo, setMemo] = useState("");
  const [understanding, setUnderstanding] = useState("");
  const [uncertain, setUncertain] = useState<string[]>([]);
  const [article, setArticle] = useState<Article | null>(null);
  const [instruction, setInstruction] = useState("");
  const [target, setTarget] = useState<Target>("facing");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(label);
    setError("");
    try {
      await task();
    } catch (failure) {
      setError(errorText(failure, "AI 요청에 실패했습니다."));
    } finally {
      setBusy("");
    }
  };

  const read = () => run("사진을 살펴보는 중…", async () => {
    const reading = await adminRequest<Reading>("/api/flipbook-write", { action: "read", images: photos, memo });
    setUnderstanding([reading.summary, "", ...reading.observed.map((line) => `- ${line}`)].join("\n"));
    setUncertain(reading.uncertain);
    setArticle(null);
  });
  const write = (previous?: Article, ask?: string) => run(previous ? "글을 고치는 중…" : "글을 쓰는 중…", async () => {
    const result = await adminRequest<Article>("/api/flipbook-write", { action: "write", images: photos, understanding, style, length, memo, previous, instruction: ask });
    setArticle(result);
    setInstruction("");
  });

  const edit = (field: keyof Article, value: string) => setArticle((current) => (current ? { ...current, [field]: value } : current));

  const insert = () => {
    if (!article) return;
    const spread = buildSpreads(book.pages.length)[spreadOfPage(ed.pageIndex)];
    let mode = target;
    const here = book.pages[ed.pageIndex];
    const band = freeBand(here);
    if (mode === "here" && !band) { mode = "facing"; ed.setNotice("이 페이지에 자리가 없어 맞은편 페이지에 넣었습니다."); }
    const partner = spread ? (spread.left === ed.pageIndex ? spread.right : spread.left) : null;
    if (mode === "facing" && (partner === null || partner === undefined || !freeBand(book.pages[partner]))) { mode = "new"; ed.setNotice("맞은편에 자리가 없어 새 페이지에 넣었습니다."); }

    if (mode === "new") {
      const insertAt = ed.pageIndex + 1;
      const fresh: BookPage = { id: uid(), title: article.title, elements: [] };
      fresh.elements = articleElements(article, book, fresh, 8, 94);
      ed.commit((open) => { const pages = [...open.pages]; pages.splice(insertAt, 0, fresh); return { ...open, pages }; });
      ed.setPageIndex(insertAt);
      ed.setSelectedId(null);
      return;
    }
    const index = mode === "here" ? ed.pageIndex : (partner as number);
    const page = book.pages[index];
    const area = freeBand(page)!;
    const elements = articleElements(article, book, page, area.top, area.bottom);
    ed.commit((open) => ({ ...open, pages: open.pages.map((item, i) => (i === index ? { ...item, title: item.title || article.title, elements: [...item.elements, ...elements] } : item)) }));
    ed.setPageIndex(index);
    ed.setSelectedId(null);
  };

  const field = (name: keyof Article, label: string, rows: number) => (
    <label className="be-aifield"><span>{label}</span><textarea className="be-input be-area" rows={rows} style={{ height: "auto" }} value={article?.[name] ?? ""} onChange={(event) => edit(name, event.target.value)} /></label>
  );

  return (
    <div className="be-panel">
      <header className="be-panel__head"><h3>AI 글쓰기</h3><button type="button" aria-label="패널 닫기" onClick={onClose}><FiX /></button></header>
      <div className="be-scroll">
        <h4>사진 {photos.length}장</h4>
        {available.length === 0 ? <p className="be-hint">사진을 넣은 뒤 그 사진이나 그리드를 선택해 주세요. 선택이 없으면 보고 있는 두 쪽의 사진을 모두 씁니다.</p> : (
          <div className="be-aiphotos">
            {available.slice(0, 12).map((url) => (
              <button key={url} type="button" aria-pressed={!excluded.includes(url)} title={excluded.includes(url) ? "글쓰기에 포함" : "글쓰기에서 빼기"} className={excluded.includes(url) ? "is-off" : ""} onClick={() => setExcluded((list) => (list.includes(url) ? list.filter((item) => item !== url) : [...list, url]))}><img src={url} alt="" /></button>
            ))}
          </div>
        )}
        <h4>문체</h4>
        <CustomSelect aria-label="문체" options={STYLES} value={style} onValueChange={setStyle} />
        {style !== "caption" && <div className="be-seg be-seg--flat">{LENGTHS.map((item) => <button key={item.value} type="button" className={length === item.value ? "is-on" : ""} onClick={() => setLength(item.value)}>{item.label}</button>)}</div>}
        <h4>메모 (선택)</h4>
        <textarea className="be-input be-area" placeholder="현장명, 평수, 자재, 브랜드처럼 사진만으로 알 수 없는 사실을 적어 주세요." value={memo} onChange={(event) => setMemo(event.target.value)} />
        <button type="button" className="be-btn be-btn--primary be-btn--wide" disabled={photos.length === 0 || Boolean(busy)} onClick={() => void read()}>{understanding ? <><FiRefreshCw />사진 다시 분석</> : "사진 분석하기"}</button>

        {understanding && <>
          <h4>AI가 이해한 내용</h4>
          <p className="be-hint">사진과 다른 부분은 직접 고쳐 주세요. 글은 이 내용을 기준으로 씁니다.</p>
          <textarea className="be-input be-area" rows={9} style={{ height: "auto" }} value={understanding} onChange={(event) => setUnderstanding(event.target.value)} />
          {uncertain.length > 0 && <div className="be-aicheck"><strong>사진만으로 알 수 없는 것</strong>{uncertain.map((item) => <span key={item}>{item}</span>)}<small>맞는 내용을 위 메모에 적으면 글에 반영됩니다.</small></div>}
          <button type="button" className="be-btn be-btn--primary be-btn--wide" disabled={Boolean(busy)} onClick={() => void write()}>{article ? <><FiRefreshCw />처음부터 다시 쓰기</> : "이 내용으로 글쓰기"}</button>
        </>}

        {article && <>
          <h4>원고</h4>
          {field("kicker", "머리말", 1)}
          {field("title", "제목", 2)}
          {field("lead", "리드", 3)}
          {field("body", "본문", 10)}
          {field("caption", "사진 설명", 2)}
          <h4>AI로 고치기</h4>
          <div className="be-aichips">{QUICK_EDITS.map((item) => <button key={item} type="button" disabled={Boolean(busy)} onClick={() => void write(article, item)}>{item}</button>)}</div>
          <div className="be-row">
            <input className="be-input" placeholder="예: 첫 문단을 창가 이야기로 시작해 줘" value={instruction} onChange={(event) => setInstruction(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && instruction.trim() && !busy) void write(article, instruction); event.stopPropagation(); }} />
            <button type="button" className="be-btn be-btn--line" disabled={!instruction.trim() || Boolean(busy)} onClick={() => void write(article, instruction)}>고치기</button>
          </div>
          <h4>넣을 위치</h4>
          <div className="be-seg be-seg--flat">
            <button type="button" className={target === "facing" ? "is-on" : ""} onClick={() => setTarget("facing")}>맞은편</button>
            <button type="button" className={target === "here" ? "is-on" : ""} onClick={() => setTarget("here")}>이 페이지</button>
            <button type="button" className={target === "new" ? "is-on" : ""} onClick={() => setTarget("new")}>새 페이지</button>
          </div>
          <button type="button" className="be-btn be-btn--primary be-btn--wide" onClick={insert}>페이지에 넣기</button>
        </>}

        {busy && <p className="be-aibusy" role="status"><FiLoader />{busy}</p>}
        {error && <p className="be-aierror" role="alert">{error}</p>}
      </div>
    </div>
  );
}

const TEXT_EDITS = ["더 세련되게", "더 짧게", "더 길게", "더 쉽게", "더 전문적으로", "맞춤법 교정"];
const CONTINUE = "원문은 그대로 두고 같은 문체로 두세 문장을 이어 써서 전체를 돌려줘";

type Draft = { text: string; ask: string; base: string; target: [number, number] | null };

/**
 * AI right where the text is, in the style of Notion and Canva: a button under the selected box (or the
 * sentence dragged over while editing), the result previewed in place, and nothing changes until 적용.
 */
export function InlineTextAi({ ed, element, range }: { ed: BookEditorApi; element: TextElement; range: [number, number] | null }) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const target = range && range[1] > range[0] ? range : null;

  const run = async (ask: string, on: [number, number] | null = target) => {
    if (!element.text.trim()) { setError("먼저 글을 입력해 주세요."); return; }
    setBusy(true);
    setError("");
    try {
      const piece = on ? element.text.slice(on[0], on[1]) : element.text;
      const result = await adminRequest<{ text: string }>("/api/flipbook-write", { action: "rewrite", text: piece, instruction: ask, context: on ? element.text : undefined });
      setDraft({ text: result.text, ask, base: element.text, target: on });
      setInstruction("");
    } catch (failure) {
      setError(errorText(failure, "AI로 고치지 못했습니다."));
    } finally {
      setBusy(false);
    }
  };
  const apply = () => {
    if (!draft) return;
    if (draft.base !== element.text) { setError("그 사이 글이 바뀌었습니다. 다시 실행해 주세요."); setDraft(null); return; }
    const text = draft.target ? `${element.text.slice(0, draft.target[0])}${draft.text}${element.text.slice(draft.target[1])}` : draft.text;
    ed.updateElement(element.id, { text });
    setDraft(null);
    setOpen(false);
  };

  const below = element.y + element.h <= 66;
  const position = {
    left: `min(${element.x}%, calc(100% - 320px))`,
    ...(below ? { top: `calc(${element.y + element.h}% + 10px)` } : { bottom: `calc(${100 - element.y}% + 10px)` }),
  };
  const stop = { onPointerDown: (event: React.PointerEvent) => event.stopPropagation(), onDoubleClick: (event: React.MouseEvent) => event.stopPropagation() };

  if (!open) {
    return <button type="button" className="be-inlineai__pill" style={position} {...stop} onClick={() => setOpen(true)}><Sparkles size={14} />{target ? "선택한 문장 AI" : "AI로 고치기"}</button>;
  }
  return (
    <div className="be-inlineai" style={position} {...stop} role="dialog" aria-label="AI로 고치기">
      <header><Sparkles size={14} /><strong>{(draft?.target ?? target) ? "선택한 문장" : "이 글 전체"}</strong><button type="button" aria-label="닫기" onClick={() => { setOpen(false); setDraft(null); setError(""); }}><FiX /></button></header>
      {draft ? (
        <>
          <textarea className="be-input be-area" rows={5} style={{ height: "auto" }} aria-label="AI 결과" value={draft.text} onChange={(event) => setDraft({ ...draft, text: event.target.value })} onKeyDown={(event) => event.stopPropagation()} />
          <div className="be-inlineai__actions">
            <button type="button" className="be-btn be-btn--primary" disabled={busy} onClick={apply}>적용</button>
            <button type="button" className="be-btn be-btn--line" disabled={busy} onClick={() => void run(draft.ask, draft.target)}><FiRefreshCw />다시 쓰기</button>
            <button type="button" className="be-btn be-btn--line" disabled={busy} onClick={() => setDraft(null)}>취소</button>
          </div>
        </>
      ) : (
        <>
          <div className="be-aichips">
            {TEXT_EDITS.map((item) => <button key={item} type="button" disabled={busy} onClick={() => void run(item)}>{item}</button>)}
            {!target && <button type="button" disabled={busy} onClick={() => void run(CONTINUE, null)}>이어 쓰기</button>}
          </div>
          <div className="be-row">
            <input className="be-input" placeholder="원하는 수정을 적어 주세요" value={instruction} onChange={(event) => setInstruction(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && instruction.trim() && !busy) void run(instruction); event.stopPropagation(); }} />
            <button type="button" className="be-btn be-btn--line" disabled={!instruction.trim() || busy} onClick={() => void run(instruction)}>실행</button>
          </div>
        </>
      )}
      {busy && <p className="be-aibusy" role="status"><FiLoader />글을 다듬는 중…</p>}
      {error && <p className="be-aierror" role="alert">{error}</p>}
    </div>
  );
}
