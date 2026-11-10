/** 인피니티북 목록: 캔버스 전체 모습을 표지처럼 보여주고, 누르면 편집합니다. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FiArrowLeft, FiCopy, FiExternalLink, FiPlus, FiSearch, FiTrash2 } from "react-icons/fi";
import { INFINITY_TEMPLATES, emptyCanvas } from "../../data/infinity-templates";
import { BookProvider } from "../../components/flipbook/BookPageView";
import { InfinityWorld, backdropStyle } from "../../components/infinity/InfinityWorld";
import { bookLink, deleteFlipbook, listFlipbooks, loadBookFonts, saveFlipbook, type Flipbook } from "../../lib/flipbooks";
import { createInfinityBook, fitCamera, overviewRect, worldTransform } from "../../lib/infinity";
import "./AdminBooks.css";

const dateText = (time: number) => new Date(time).toLocaleDateString("ko-KR");

/**
 * The 인테리어쇼 portfolio books are generated from code. Copies that are still as generated (an older
 * seed, never edited since) are rebuilt with the current layouts, keeping their id, link and public state.
 */
async function refreshShowBooks(list: Flipbook[]): Promise<Flipbook[]> {
  const { SHOW_SEED, SHOW_TITLES, buildInteriorShowBooks } = await import("../../data/interior-show-infinity");
  // No seed: made before seeds existed. "edited": someone changed it in the editor, so it is left alone.
  const stale = list.filter((book) => SHOW_TITLES.has(book.title) && book.seed !== SHOW_SEED && (!book.seed || book.seed.startsWith("interior-show:")));
  if (stale.length === 0) return [];
  const built = await buildInteriorShowBooks();
  const fresh: Flipbook[] = [];
  for (const book of stale) {
    const next = built.find((item) => item.title === book.title);
    if (!next) continue;
    const updated = { ...book, seed: SHOW_SEED, canvas: next.canvas };
    await saveFlipbook(updated);
    fresh.push(updated);
  }
  return fresh;
}

/** Template chooser: search and a grid of live previews; picking one creates the book from it. */
function TemplateChooser({ onPick, onClose }: { onPick: (templateId: string, name: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const previews = useMemo(() => INFINITY_TEMPLATES.map((template) => ({ template, book: createInfinityBook(template.name, template.build()) })), []);
  useEffect(() => loadBookFonts(["'Noto Serif KR'", "'Noto Sans KR'"]), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const shown = previews.filter(({ template }) => !query.trim() || `${template.name} ${template.category} ${template.description}`.includes(query.trim()));
  return (
    <div className="ai-chooser" role="dialog" aria-label="템플릿 선택">
      <header className="ai-chooser__top">
        <button type="button" aria-label="닫기" onClick={onClose}><FiArrowLeft /></button>
        <strong>템플릿 선택</strong>
        <label className="ai-chooser__search"><input autoFocus placeholder="검색…" value={query} onChange={(event) => setQuery(event.target.value)} /><FiSearch /></label>
      </header>
      <div className="ai-chooser__grid">
        <button type="button" className="ai-chooser__card" onClick={() => onPick("", "제목 없는 인피니티북")}>
          <span className="ai-chooser__blank"><b>제목을 입력하세요</b><small>부제를 입력하세요</small></span>
          <span className="ai-chooser__name">빈 캔버스</span>
        </button>
        {shown.map(({ template, book }) => (
          <button key={template.id} type="button" className="ai-chooser__card" title={template.description} onClick={() => onPick(template.id, template.name)}>
            <InfinityCover book={book} />
            <span className="ai-chooser__name">{template.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function InfinityCover({ book }: { book: Flipbook }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => setSize({ w: element.clientWidth, h: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const canvas = book.canvas!;
  const camera = fitCamera(overviewRect(canvas), size.w, size.h, 0.98);
  return (
    <div ref={box} className="ab-cover__page ab-cover__page--wide ab-cover__canvas" style={{ aspectRatio: canvas.ratio === "4:3" ? "4 / 3" : "16 / 9", ...backdropStyle(canvas) }}>
      {size.w > 0 && <BookProvider book={book}><InfinityWorld canvas={canvas} still style={{ transform: worldTransform(camera, size.w, size.h) }} /></BookProvider>}
    </div>
  );
}

export default function AdminInfinity() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<Flipbook[] | null>(null);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [params, setParams] = useSearchParams();
  const choosing = params.get("new") === "1";
  const setChoosing = (open: boolean) => setParams(open ? { new: "1" } : {}, { replace: true });

  useEffect(() => {
    listFlipbooks()
      .then((all) => {
        const list = all.filter((book) => book.kind === "infinite" && book.canvas);
        setBooks(list);
        void refreshShowBooks(list).then((fresh) => { if (fresh.length) setBooks((current) => current?.map((book) => fresh.find((item) => item.id === book.id) ?? book) ?? null); });
        loadBookFonts(list.flatMap((book) => book.canvas!.elements.flatMap((element) => (element.type === "text" && element.font ? [element.font] : []))));
      })
      .catch(() => { setBooks([]); setError("목록을 불러오지 못했습니다."); });
  }, []);

  const create = async (templateId = "", name = "제목 없는 인피니티북") => {
    const template = INFINITY_TEMPLATES.find((item) => item.id === templateId);
    const book = createInfinityBook(name, template ? template.build() : emptyCanvas());
    try {
      await saveFlipbook(book);
      navigate(`/admin/infinity/${book.id}`);
    } catch {
      setError("만들지 못했습니다. 관리자 권한을 확인해 주세요.");
    }
  };
  const remove = async (book: Flipbook) => {
    if (!window.confirm(`「${book.title}」을(를) 삭제할까요? 공개 링크도 함께 사라집니다.`)) return;
    try {
      await deleteFlipbook(book.id);
      setBooks((current) => current?.filter((item) => item.id !== book.id) ?? null);
    } catch {
      setError("삭제하지 못했습니다.");
    }
  };
  const copy = async (book: Flipbook) => {
    await navigator.clipboard.writeText(bookLink(book.id));
    setCopiedId(book.id);
    window.setTimeout(() => setCopiedId(""), 1500);
  };

  return (
    <section>
      <div className="admin-page__head">
        <div><h1>인피니티북</h1><p>한 장의 넓은 캔버스 위에 내용을 펼치고, 프레임 사이를 확대·이동하며 발표합니다.</p></div>
        <button type="button" className="admin-btn admin-btn--primary" onClick={() => setChoosing(true)}>새 인피니티북</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {choosing && <TemplateChooser onClose={() => setChoosing(false)} onPick={(templateId, name) => void create(templateId, name)} />}
      {books === null ? <p>불러오는 중…</p> : (
        <div className="ab-gallery ab-gallery--wide">
          <button type="button" className="ab-new" onClick={() => setChoosing(true)}><FiPlus /><span>새 인피니티북</span></button>
          {books.map((book) => (
            <article key={book.id} className="ab-card">
              <Link to={`/admin/infinity/${book.id}`} className="ab-cover" aria-label={`${book.title} 편집`}><InfinityCover book={book} /></Link>
              <div className="ab-meta">
                <Link to={`/admin/infinity/${book.id}`} className="ab-title">{book.title}</Link>
                <p>
                  <span className={`ab-status${book.published ? " is-public" : ""}`}>{book.published ? "공개" : "비공개"}</span>
                  프레임 {book.canvas!.frames.length}개 · {dateText(book.updatedAt)}
                </p>
                <div className="ab-actions">
                  <button type="button" disabled={!book.published} title={book.published ? "공개 링크 복사" : "공개한 것만 링크를 복사할 수 있습니다"} onClick={() => void copy(book)}><FiCopy />{copiedId === book.id ? "복사됨" : "링크"}</button>
                  <a href={`/book/${book.id}`} target="_blank" rel="noreferrer" title="발표 화면으로 보기"><FiExternalLink />발표</a>
                  <button type="button" className="ab-delete" title="삭제" aria-label={`${book.title} 삭제`} onClick={() => void remove(book)}><FiTrash2 /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
