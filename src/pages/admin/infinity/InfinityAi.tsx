/**
 * AI in the 인피니티북 editor, on the same /api/flipbook-write service as the page book:
 * - a panel that reads the chosen photos, lets the editor correct that reading, writes in a chosen style,
 *   and sets the article beside the photos as a scene (optionally framed, so it becomes a stop);
 * - a rewrite box for the selected text (shorter, more refined, continue, or any instruction).
 */
import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { FiLoader, FiRefreshCw } from "react-icons/fi";
import { CustomSelect } from "../../../components/ui/custom-select";
import { adminRequest, uid, type BookElement, type ImageElement, type TextElement } from "../../../lib/flipbooks";
import { containedIn, type InfinityCanvas, type InfinityFrame, type Rect } from "../../../lib/infinity";

type Reading = { summary: string; observed: string[]; uncertain: string[] };
type Article = { kicker: string; title: string; lead: string; body: string; caption: string };

const STYLES = [
  { value: "magazine", label: "매거진 에디토리얼" },
  { value: "essay", label: "감성 에세이" },
  { value: "case", label: "시공 사례 리포트" },
  { value: "product", label: "제품 소개" },
  { value: "column", label: "전문가 칼럼" },
  { value: "caption", label: "짧은 사진 캡션" },
];
const LENGTHS = [{ value: "short", label: "짧게" }, { value: "medium", label: "보통" }, { value: "long", label: "길게" }] as const;
const TEXT_EDITS = ["더 짧게", "더 세련되게", "더 따뜻하게", "더 전문적으로", "맞춤법 다듬기"];
const CONTINUE = "이 글의 흐름과 문체를 그대로 이어서 두세 문장을 더 써 주세요. 원문은 그대로 두고 덧붙인 전체 글을 돌려주세요.";
const MAX_PHOTOS = 6;
const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

const lines = (value: string, w: number, size: number) => value.split("\n").reduce((sum, part) => sum + Math.max(1, Math.ceil((Array.from(part).length * size * 0.92) / Math.max(w, 1))), 0);
const textEl = (value: string, x: number, y: number, w: number, size: number, color: string, extra: Partial<TextElement> = {}): TextElement => ({
  id: uid(), type: "text", text: value, x, y, w, h: size * (extra.lineHeight ?? 1.4) * lines(value, w, size) + size * 0.3, size, color, bold: false, align: "left", font: "'Noto Sans KR'", lineHeight: 1.4, actions: [], ...extra,
});

/** Photos to write about: the selected photo, or those inside the selected/current frame, or all on the canvas. */
function photosFor(canvas: InfinityCanvas, selectedId: string | null, frame: InfinityFrame | null): ImageElement[] {
  const images = canvas.elements.filter((e): e is ImageElement => e.type === "image" && Boolean(e.src));
  const picked = images.find((e) => e.id === selectedId);
  if (picked) return [picked];
  if (frame) { const inside = images.filter((e) => containedIn(e, frame)); if (inside.length) return inside; }
  return images;
}

/** The article as a scene: kicker, title, rule, a lead that types out, the body and a caption. */
export function articleScene(article: Article, anchor: Rect, ink: string, accent: string): BookElement[] {
  const size = Math.max(anchor.h * 0.075, 24);
  const x = anchor.x + anchor.w + size * 1.6;
  const w = Math.max(anchor.w * 0.62, size * 11);
  let y = anchor.y + size * 0.4;
  const els: BookElement[] = [];
  const push = (el: TextElement) => { els.push(el); y = el.y + el.h + size * 0.35; return el; };
  if (article.kicker) push(textEl(article.kicker, x, y, w, size * 0.42, accent, { font: "'Montserrat'", bold: true, spacing: 220, textCase: "upper" }));
  push(textEl(article.title, x, y, w, size, ink, { font: "'Noto Serif KR'", bold: true, lineHeight: 1.25 }));
  els.push({ id: uid(), type: "line", color: accent, thickness: Math.max(2, size * 0.05), style: "solid", arrow: false, x, y, w: size * 2.2, h: Math.max(2, size * 0.05), actions: [] });
  y += size * 0.5;
  if (article.lead) push({ ...textEl(article.lead, x, y, w, size * 0.52, ink, { font: "'Noto Serif KR'", lineHeight: 1.6 }), animation: "type", delay: 0.4 });
  if (article.body) push(textEl(article.body, x, y, w, size * 0.4, ink, { lineHeight: 1.75, opacity: 0.82 }));
  if (article.caption) push(textEl(article.caption, x, y, w, size * 0.34, accent, { lineHeight: 1.5 }));
  return els;
}

export function InfinityAiPanel({ canvas, selectedId, frame, onInsert }: {
  canvas: InfinityCanvas;
  selectedId: string | null;
  frame: InfinityFrame | null;
  /** Adds the scene; `wrap` also puts a frame around photo and text so it becomes a stop. */
  onInsert: (elements: BookElement[], wrap: { anchor: Rect; title: string } | null) => void;
}) {
  const available = useMemo(() => photosFor(canvas, selectedId, frame), [canvas, selectedId, frame]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const photos = available.filter((e) => !excluded.includes(e.id)).slice(0, MAX_PHOTOS);
  const [style, setStyle] = useState("magazine");
  const [length, setLength] = useState<(typeof LENGTHS)[number]["value"]>("short");
  const [memo, setMemo] = useState("");
  const [understanding, setUnderstanding] = useState("");
  const [uncertain, setUncertain] = useState<string[]>([]);
  const [article, setArticle] = useState<Article | null>(null);
  const [instruction, setInstruction] = useState("");
  const [wrap, setWrap] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const dark = (canvas.background || "").match(/^#([0-9a-f]{2})/i) ? parseInt(canvas.background.slice(1, 3), 16) < 110 : false;

  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(label); setError("");
    try { await task(); } catch (failure) { setError(errorText(failure, "AI 요청에 실패했습니다.")); } finally { setBusy(""); }
  };
  const read = () => run("사진을 살펴보는 중…", async () => {
    const reading = await adminRequest<Reading>("/api/flipbook-write", { action: "read", images: photos.map((p) => p.src), memo });
    setUnderstanding([reading.summary, "", ...reading.observed.map((line) => `- ${line}`)].join("\n"));
    setUncertain(reading.uncertain);
    setArticle(null);
  });
  const write = (previous?: Article, ask?: string) => run(previous ? "글을 고치는 중…" : "글을 쓰는 중…", async () => {
    const result = await adminRequest<Article>("/api/flipbook-write", { action: "write", images: photos.map((p) => p.src), understanding, style, length, memo, previous, instruction: ask });
    setArticle(result); setInstruction("");
  });
  const edit = (field: keyof Article, value: string) => setArticle((current) => (current ? { ...current, [field]: value } : current));
  const insert = () => {
    if (!article || photos.length === 0) return;
    const xs = photos.map((p) => p.x); const ys = photos.map((p) => p.y);
    const anchor = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...photos.map((p) => p.x + p.w)) - Math.min(...xs), h: Math.max(...photos.map((p) => p.y + p.h)) - Math.min(...ys) };
    onInsert(articleScene(article, anchor, dark ? "#f3efe8" : "#1f2430", dark ? "#d6b98c" : "#8a6a4a"), wrap ? { anchor, title: article.title.slice(0, 20) } : null);
  };
  const field = (name: keyof Article, label: string, rows: number) => (
    <label className="ie-field ie-field--col"><span>{label}</span><textarea className="ie-input ie-area" rows={rows} style={{ height: "auto" }} value={article?.[name] ?? ""} onChange={(event) => edit(name, event.target.value)} /></label>
  );

  return (
    <div className="ie-panel__scroll ie-ai">
      <h5>사진 {photos.length}장</h5>
      {available.length === 0 ? <p className="ie-hint">캔버스에 사진을 넣은 뒤 그 사진이나 사진이 든 프레임을 선택하세요. 선택이 없으면 캔버스의 사진을 모두 씁니다.</p> : (
        <div className="ie-aiphotos">
          {available.slice(0, 12).map((p) => (
            <button key={p.id} type="button" aria-pressed={!excluded.includes(p.id)} title={excluded.includes(p.id) ? "글쓰기에 포함" : "글쓰기에서 빼기"} className={excluded.includes(p.id) ? "is-off" : ""} style={{ backgroundImage: `url("${p.src}")` }}
              onClick={() => setExcluded((list) => (list.includes(p.id) ? list.filter((item) => item !== p.id) : [...list, p.id]))} />
          ))}
        </div>
      )}
      <h5>문체</h5>
      <CustomSelect aria-label="문체" options={STYLES} value={style} onValueChange={setStyle} />
      {style !== "caption" && <div className="ie-seg">{LENGTHS.map((item) => <button key={item.value} type="button" className={length === item.value ? "is-on" : ""} onClick={() => setLength(item.value)}>{item.label}</button>)}</div>}
      <label className="ie-field ie-field--col"><span>알려 줄 내용 (선택)</span><textarea className="ie-input ie-area" rows={3} style={{ height: "auto" }} placeholder="현장 이름, 평형, 쓴 자재, 강조할 점" value={memo} onChange={(event) => setMemo(event.target.value)} /></label>
      <button type="button" className="ie-upload" disabled={photos.length === 0 || Boolean(busy)} onClick={() => void read()}><Sparkles size={16} />{understanding ? "사진 다시 읽기" : "1. 사진 읽기"}</button>
      {understanding && (
        <>
          <label className="ie-field ie-field--col"><span>AI가 본 내용 — 틀린 곳을 고쳐 주세요</span><textarea className="ie-input ie-area" rows={7} style={{ height: "auto" }} value={understanding} onChange={(event) => setUnderstanding(event.target.value)} /></label>
          {uncertain.length > 0 && <p className="ie-hint">확실하지 않은 것: {uncertain.join(", ")}</p>}
          <button type="button" className="ie-upload" disabled={Boolean(busy)} onClick={() => void write()}><Sparkles size={16} />{article ? "처음부터 다시 쓰기" : "2. 이 내용으로 글쓰기"}</button>
        </>
      )}
      {article && (
        <>
          {field("kicker", "머리말", 1)}{field("title", "제목", 2)}{field("lead", "리드 (발표 때 타이핑)", 3)}{field("body", "본문", 6)}{field("caption", "캡션", 2)}
          <div className="ie-aichips">{["더 짧게", "더 세련되게", "더 따뜻하게", "더 전문적으로"].map((ask) => <button key={ask} type="button" disabled={Boolean(busy)} onClick={() => void write(article, ask)}>{ask}</button>)}</div>
          <div className="ie-row"><input className="ie-input" placeholder="원하는 수정을 적어 주세요" value={instruction} onChange={(event) => setInstruction(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && instruction.trim() && !busy) void write(article, instruction); event.stopPropagation(); }} /><button type="button" className="ie-btn" disabled={!instruction.trim() || Boolean(busy)} onClick={() => void write(article, instruction)}>고치기</button></div>
          <label className="ie-field"><span>사진과 글을 프레임으로 묶기 (경로에 추가)</span><input type="checkbox" className="ie-switch" checked={wrap} onChange={(event) => setWrap(event.target.checked)} /></label>
          <button type="button" className="ie-upload" disabled={Boolean(busy)} onClick={insert}>3. 사진 옆에 넣기</button>
        </>
      )}
      {busy && <p className="ie-hint ie-aibusy" role="status"><FiLoader />{busy}</p>}
      {error && <p className="ie-error" role="alert">{error}</p>}
    </div>
  );
}

type Draft = { text: string; ask: string; base: string };

/** Rewrites the selected text; the result is shown and can be edited before it replaces the text. */
export function InfinityTextAi({ element, onApply }: { element: TextElement; onApply: (text: string) => void }) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const run = async (ask: string) => {
    if (!element.text.trim()) { setError("먼저 글을 입력해 주세요."); return; }
    setBusy(true); setError("");
    try {
      const result = await adminRequest<{ text: string }>("/api/flipbook-write", { action: "rewrite", text: element.text, instruction: ask });
      setDraft({ text: result.text, ask, base: element.text }); setInstruction("");
    } catch (failure) { setError(errorText(failure, "AI로 고치지 못했습니다.")); } finally { setBusy(false); }
  };
  const apply = () => {
    if (!draft) return;
    if (draft.base !== element.text) { setError("그 사이 글이 바뀌었습니다. 다시 실행해 주세요."); setDraft(null); return; }
    onApply(draft.text); setDraft(null);
  };
  return (
    <section className="ie-ai">
      <h4><span><Sparkles size={14} /> AI로 고치기</span></h4>
      {draft ? (
        <>
          <textarea className="ie-input ie-area" rows={5} style={{ height: "auto" }} aria-label="AI 결과" value={draft.text} onChange={(event) => setDraft({ ...draft, text: event.target.value })} onKeyDown={(event) => event.stopPropagation()} />
          <div className="ie-row">
            <button type="button" className="ie-btn ie-btn--dark" disabled={busy} onClick={apply}>적용</button>
            <button type="button" className="ie-btn" disabled={busy} onClick={() => void run(draft.ask)}><FiRefreshCw />다시</button>
            <button type="button" className="ie-btn" disabled={busy} onClick={() => setDraft(null)}>취소</button>
          </div>
        </>
      ) : (
        <>
          <div className="ie-aichips">
            {TEXT_EDITS.map((ask) => <button key={ask} type="button" disabled={busy} onClick={() => void run(ask)}>{ask}</button>)}
            <button type="button" disabled={busy} onClick={() => void run(CONTINUE)}>이어 쓰기</button>
          </div>
          <div className="ie-row"><input className="ie-input" placeholder="원하는 수정을 적어 주세요" value={instruction} onChange={(event) => setInstruction(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && instruction.trim() && !busy) void run(instruction); event.stopPropagation(); }} /><button type="button" className="ie-btn" disabled={!instruction.trim() || busy} onClick={() => void run(instruction)}>실행</button></div>
        </>
      )}
      {busy && <p className="ie-hint ie-aibusy" role="status"><FiLoader />글을 다듬는 중…</p>}
      {error && <p className="ie-error" role="alert">{error}</p>}
    </section>
  );
}
