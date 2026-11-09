/** 인터랙션 북 목록: 새 책 만들기, 편집, 공개 링크 복사, 삭제. */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookPageView } from "../../components/flipbook/BookPageView";
import { bookLink, createFlipbook, deleteFlipbook, listFlipbooks, saveFlipbook, type Flipbook } from "../../lib/flipbooks";

const dateText = (time: number) => new Date(time).toLocaleDateString("ko-KR");

export default function AdminBooks() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<Flipbook[] | null>(null);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState("");

  useEffect(() => {
    listFlipbooks().then(setBooks).catch(() => { setBooks([]); setError("책 목록을 불러오지 못했습니다."); });
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
        <div><h1>인터랙션 북</h1><p>PDF나 빈 페이지로 책을 만들고, 링크로 공개합니다.</p></div>
        <button type="button" className="admin-btn admin-btn--primary" onClick={() => void create()}>새 책 만들기</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {books === null ? <p>불러오는 중…</p> : books.length === 0 ? <p>아직 만든 책이 없습니다.</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>표지</th><th>제목</th><th>쪽수</th><th>상태</th><th>수정일</th><th /></tr></thead>
            <tbody>
              {books.map((book) => (
                <tr key={book.id}>
                  <td><div style={{ width: 44, aspectRatio: `${book.width} / ${book.height}`, overflow: "hidden" }}>{book.pages[0] && <BookPageView page={book.pages[0]} still />}</div></td>
                  <td><Link to={`/admin/books/${book.id}`}>{book.title}</Link></td>
                  <td>{book.pages.length}</td>
                  <td>{book.published ? "공개" : "비공개"}</td>
                  <td>{dateText(book.updatedAt)}</td>
                  <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                    <Link className="admin-btn" to={`/admin/books/${book.id}`}>편집</Link>{" "}
                    <button type="button" className="admin-btn" disabled={!book.published} onClick={() => void copy(book)}>{copiedId === book.id ? "복사됨" : "링크 복사"}</button>{" "}
                    <button type="button" className="admin-btn" onClick={() => void remove(book)}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
