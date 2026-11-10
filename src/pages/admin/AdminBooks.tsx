/** 플립북 목록: 표지 갤러리. 표지를 누르면 편집하고, 공개 링크 복사와 삭제도 여기서 합니다. */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiCopy, FiExternalLink, FiPlus, FiTrash2 } from "react-icons/fi";
import { BookPageView, BookProvider } from "../../components/flipbook/BookPageView";
import { bookLink, createFlipbook, deleteFlipbook, fontsInBook, listFlipbooks, loadBookFonts, saveFlipbook, type Flipbook } from "../../lib/flipbooks";
import "./AdminBooks.css";
import InteriorShowDrafts from "./InteriorShowDrafts";

const dateText = (time: number) => new Date(time).toLocaleDateString("ko-KR");

export default function AdminBooks() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<Flipbook[] | null>(null);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState("");

  useEffect(() => {
    listFlipbooks()
      .then((all) => { const list = all.filter((book) => book.kind !== "infinite"); setBooks(list); loadBookFonts(list.flatMap((book) => fontsInBook({ ...book, pages: book.pages.slice(0, 1) }))); })
      .catch(() => { setBooks([]); setError("책 목록을 불러오지 못했습니다."); });
  }, []);

  const create = async () => {
    const book = createFlipbook();
    try {
      await saveFlipbook(book);
      navigate(`/admin/books/${book.id}`);
    } catch {
      setError("책을 만들지 못했습니다. 관리자 권한을 확인해 주세요.");
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
        <div><h1>플립북</h1><p>PDF나 빈 페이지로 책을 만들고, 링크로 공개합니다.</p></div>
        <button type="button" className="admin-btn admin-btn--primary" onClick={() => void create()}>새 책 만들기</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {books !== null && <InteriorShowDrafts books={books} onCreated={(added) => { setBooks(current => { const map = new Map((current ?? []).map(book => [book.id, book])); for (const book of added) map.set(book.id, book); return [...map.values()].sort((a,b) => b.updatedAt-a.updatedAt); }); loadBookFonts(added.flatMap(book => fontsInBook({...book,pages:book.pages.slice(0,1)}))); }} />}
      {books === null ? <p>불러오는 중…</p> : (
        <div className="ab-gallery">
          <button type="button" className="ab-new" onClick={() => void create()}><FiPlus /><span>새 책 만들기</span></button>
          {books.map((book) => (
            <article key={book.id} className="ab-card">
              <Link to={`/admin/books/${book.id}`} className="ab-cover" aria-label={`${book.title} 편집`}>
                <div className={`ab-cover__page ab-cover__page--${book.width / book.height > 0.72 ? "wide" : "tall"}`} style={{ aspectRatio: `${book.width} / ${book.height}` }}>
                  {book.pages[0] && <BookProvider book={book}><BookPageView page={book.pages[0]} still /></BookProvider>}
                </div>
              </Link>
              <div className="ab-meta">
                <Link to={`/admin/books/${book.id}`} className="ab-title">{book.title}</Link>
                <p>
                  <span className={`ab-status${book.published ? " is-public" : ""}`}>{book.published ? "공개" : "비공개"}</span>
                  {book.pages.length}쪽 · {dateText(book.updatedAt)}
                </p>
                <div className="ab-actions">
                  <button type="button" disabled={!book.published} title={book.published ? "공개 링크 복사" : "공개한 책만 링크를 복사할 수 있습니다"} onClick={() => void copy(book)}><FiCopy />{copiedId === book.id ? "복사됨" : "링크"}</button>
                  <a href={`/book/${book.id}`} target="_blank" rel="noreferrer" title="새 창에서 보기"><FiExternalLink />보기</a>
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
