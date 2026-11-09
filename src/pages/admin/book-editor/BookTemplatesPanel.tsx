import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Dialog } from "radix-ui";
import { ArrowLeft, ArrowRight, Check, CheckCheck, Heart, Search, X } from "lucide-react";
import { BookPageView, BookProvider } from "../../../components/flipbook/BookPageView";
import { CustomSelect } from "../../../components/ui/custom-select";
import { BOOK_TEMPLATES, TEMPLATE_CATEGORIES, applyBookTemplate, type BookTemplate, type TemplatePlacement } from "../../../data/book-templates";
import { buildSpreads, fontsInBook, loadBookFonts } from "../../../lib/flipbooks";
import type { BookEditorApi } from "./useBookEditor";
import "./BookTemplatesPanel.css";

const FAVORITES_KEY = "index-book-template-favorites-v1";
const categoryLabel = (template: BookTemplate) => TEMPLATE_CATEGORIES.find(c => c.value === template.category)?.label;
function readFavorites(): string[] {
  try { const value: unknown = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]"); return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []; } catch { return []; }
}

export default function BookTemplatesPanel({ ed }: { ed: BookEditorApi }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [favorites, setFavorites] = useState(readFavorites);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [active, setActive] = useState<BookTemplate | null>(null);
  useEffect(() => { loadBookFonts(new Set(BOOK_TEMPLATES.flatMap(t => fontsInBook(t.book)))); }, []);
  const templates = BOOK_TEMPLATES.filter(t => (category === "all" || t.category === category) && (!favoritesOnly || favorites.includes(t.id)) && `${t.name} ${t.subtitle} ${categoryLabel(t)}`.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(() => {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch { /* Favorites remain usable when browser storage is disabled. */ }
  }, [favorites]);
  const favorite = (id: string) => setFavorites(previous => previous.includes(id) ? previous.filter(v => v !== id) : [...previous, id]);
  return <div className="bt-panel be-scroll">
    <div className="bt-intro"><span>THE EDITORIAL COLLECTION</span><p>공간의 이야기를<br />한 권의 매거진으로.</p></div>
    <label className="bt-search"><Search size={15} /><input aria-label="템플릿 검색" value={query} onChange={e => setQuery(e.target.value)} placeholder="스타일, 템플릿 검색" />{query && <button type="button" aria-label="검색 지우기" onClick={() => setQuery("")}><X size={14} /></button>}</label>
    <div className="bt-tabs"><button type="button" aria-pressed={!favoritesOnly} onClick={() => setFavoritesOnly(false)}>모든 템플릿</button><button type="button" aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly(true)}><Heart size={13} />즐겨찾기 {favorites.length || ""}</button></div>
    <div className="bt-chips" role="group" aria-label="템플릿 카테고리">{[{ value: "all", label: "전체" }, ...TEMPLATE_CATEGORIES].map(item => <button key={item.value} type="button" aria-pressed={category === item.value} onClick={() => setCategory(item.value)}>{item.label}</button>)}</div>
    <div className="bt-result"><span>{templates.length}개의 템플릿</span></div>
    <div className="bt-gallery">{templates.map(template => <article key={template.id} className="bt-card">
      <div className="bt-card__art" style={{ aspectRatio: `${template.book.width} / ${template.book.height}` }}><button type="button" className="bt-card__open" onClick={() => setActive(template)} aria-label={`${template.name} 템플릿 미리보기`}><BookProvider book={template.book}><BookPageView page={template.book.pages[0]} still /></BookProvider><span className="bt-card__peek">내지 미리보기 ↗</span></button><button type="button" className="bt-favorite" aria-pressed={favorites.includes(template.id)} aria-label={`${template.name} 즐겨찾기`} onClick={() => favorite(template.id)}><Heart size={14} fill={favorites.includes(template.id) ? "currentColor" : "none"} /></button><span className="bt-pagecount">{String(template.book.pages.length).padStart(2, "0")} P</span></div>
      <button type="button" className="bt-card__name" onClick={() => setActive(template)}>{template.name}<small>{categoryLabel(template)}</small></button>
    </article>)}</div>
    {!templates.length && <p className="bt-empty">{favoritesOnly ? "하트를 눌러 마음에 드는 템플릿을 모아 보세요." : "검색 결과가 없습니다. 다른 검색어나 분야를 선택해 주세요."}</p>}
    <p className="bt-footnote">사진과 문구, 모든 요소를 편집할 수 있습니다.</p>
    {active && <TemplatePreview key={active.id} template={active} ed={ed} onClose={() => setActive(null)} />}
  </div>;
}

function TemplatePreview({ template, ed, onClose }: { template: BookTemplate; ed: BookEditorApi; onClose: () => void }) {
  const { book } = template;
  const [stop, setStop] = useState(0);
  const [single, setSingle] = useState(() => window.matchMedia("(max-width:620px)").matches);
  const [selected, setSelected] = useState(() => book.pages.map(p => p.id));
  const [placement, setPlacement] = useState<TemplatePlacement>(() => ed.book?.pages.every(p => !p.image && p.elements.length === 0) ? "replace" : "after-current");
  const [useSize, setUseSize] = useState(true);
  const spreads = useMemo(() => single ? book.pages.map((_, i) => ({ left: null, right: i })) : buildSpreads(book.pages.length), [book.pages, single]);
  useEffect(() => {
    const media = window.matchMedia("(max-width:620px)");
    const resize = () => {
      if (media.matches === single) return;
      const page = spreads[stop].left ?? spreads[stop].right ?? 0;
      setStop(media.matches ? page : Math.ceil(page / 2));
      setSingle(media.matches);
    };
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, [single, spreads, stop]);
  const visible = spreads[stop];
  const toggle = (id: string) => setSelected(ids => ids.includes(id) ? ids.filter(p => p !== id) : [...ids, id]);
  const insert = () => {
    let firstIndex = 0;
    ed.commit(open => { const result = applyBookTemplate(open, template, selected, placement, ed.pageIndex, useSize); firstIndex = result.firstIndex; return result.book; });
    ed.setPageIndex(firstIndex);
    ed.setSelectedId(null);
    ed.setNotice(`${template.name} · ${selected.length}쪽을 ${placement === "replace" ? "적용했습니다" : "추가했습니다"}. 실행 취소로 되돌릴 수 있습니다.`);
    onClose();
  };
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}><Dialog.Portal><Dialog.Overlay className="bt-overlay" /><Dialog.Content className="bt-dialog">
    <header className="bt-dialog__head"><div><span className="bt-eyebrow">{categoryLabel(template)} / EDITORIAL TEMPLATE</span><Dialog.Title>{template.name}</Dialog.Title><Dialog.Description>{book.pages.length}쪽 · {book.width === book.height ? "정사각형" : book.width > book.height ? "가로형" : "세로형"} · {book.width} × {book.height}</Dialog.Description></div><Dialog.Close className="bt-close" aria-label="미리보기 닫기"><X size={20} /></Dialog.Close></header>
    <BookProvider book={book}><div className="bt-preview-layout"><section className="bt-preview" aria-label="템플릿 펼침면 미리보기">
      <div className={`bt-spread${visible.left !== null && visible.right !== null ? " bt-spread--pair" : ""}`} style={{ "--bt-ratio": book.width / book.height } as CSSProperties}>
        {[visible.left, visible.right].filter((i): i is number => i !== null).map(i => <div className="bt-sheet" key={book.pages[i].id}><BookPageView page={book.pages[i]} still /></div>)}
      </div>
      <div className="bt-preview__nav"><button type="button" aria-label="이전 펼침면" disabled={stop === 0} onClick={() => setStop(n => n - 1)}><ArrowLeft size={19} /></button><span>{[visible.left, visible.right].filter((i): i is number => i !== null).map(i => i + 1).join(" — ")} / {book.pages.length}</span><button type="button" aria-label="다음 펼침면" disabled={stop === spreads.length - 1} onClick={() => setStop(n => n + 1)}><ArrowRight size={19} /></button></div>
      <p className="bt-preview__caption">생성한 예시 사진이 포함되어 있습니다. 적용 후 사진과 글을 자유롭게 교체하세요.</p>
    </section><aside className="bt-page-picker"><div className="bt-page-picker__head"><h3>사용할 페이지</h3><button type="button" onClick={() => setSelected(selected.length === book.pages.length ? [] : book.pages.map(p => p.id))}><CheckCheck size={15} />{selected.length === book.pages.length ? "선택 해제" : "전체 선택"}</button></div><div className="bt-page-picker__grid">{book.pages.map((page, i) => <div key={page.id} className="bt-page-option"><button type="button" className={`bt-page-option__art${selected.includes(page.id) ? " is-selected" : ""}`} style={{ aspectRatio: `${book.width} / ${book.height}` }} aria-label={`${i + 1}쪽 ${page.title} ${selected.includes(page.id) ? "선택 해제" : "선택"}`} aria-pressed={selected.includes(page.id)} onClick={() => toggle(page.id)}><BookPageView page={page} still /><span className="bt-check">{selected.includes(page.id) && <Check size={12} />}</span></button><button type="button" className="bt-page-option__label" onClick={() => setStop(single ? i : Math.ceil(i / 2))}>{String(i + 1).padStart(2, "0")} {page.title}</button></div>)}</div></aside></div></BookProvider>
    <footer className="bt-dialog__footer"><div className="bt-insert-settings"><CustomSelect aria-label="템플릿 삽입 위치" value={placement} onValueChange={v => setPlacement(v as TemplatePlacement)} options={[{ value: "after-current", label: `현재 ${ed.pageIndex + 1}쪽 뒤에 추가` }, { value: "at-end", label: "책의 마지막에 추가" }, { value: "replace", label: "기존 페이지 전체 교체" }]} />{placement === "replace" && <label className="bt-size"><input type="checkbox" checked={useSize} onChange={e => setUseSize(e.target.checked)} />템플릿 크기 사용</label>}{placement === "replace" && <span className="bt-replace-note">기존 {ed.book?.pages.length}쪽이 선택한 페이지로 바뀝니다.</span>}</div><button type="button" className="bt-apply" disabled={!selected.length} onClick={insert}>{selected.length}쪽 {placement === "replace" ? "적용하기" : "추가하기"}<ArrowRight size={17} /></button></footer>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
