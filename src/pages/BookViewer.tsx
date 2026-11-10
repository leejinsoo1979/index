import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";
import FlipViewer from "../components/flipbook/FlipViewer";
import { useAuth } from "../auth/AuthContext";
import { getFlipbook, type Flipbook } from "../lib/flipbooks";
import "../components/flipbook/Flipbook.css";

const InfinityViewer = lazy(() => import("../components/infinity/InfinityViewer"));
const InfinityPrint = lazy(() => import("../components/infinity/InfinityPrint"));

/** The public link of a book. Unpublished books open only for admins, who also get a way back to the editor. */
export default function BookViewer() {
  const { id = "" } = useParams();
  const { loading, configured, isAdmin } = useAuth();
  const [book, setBook] = useState<Flipbook | null>(null);
  const [failed, setFailed] = useState(false);
  const navigate = useNavigate();
  const canEdit = !configured || isAdmin;
  // Opened from the editor in a new tab: closing it returns there; otherwise go to the editor.
  const backToEditor = () => {
    if (window.opener && !window.opener.closed) window.close();
    navigate(book?.kind === "infinite" ? `/admin/infinity/${id}` : `/admin/books/${id}`);
  };

  useEffect(() => {
    if (loading) return; // rules decide on the signed-in user, so wait until it's known
    let live = true;
    getFlipbook(id)
      .then((found) => { if (!live) return; setBook(found); setFailed(!found || (!found.published && configured && !isAdmin)); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [id, loading, configured, isAdmin]);

  useEffect(() => {
    if (!book) return;
    const previous = document.title;
    document.title = book.title;
    return () => { document.title = previous; };
  }, [book]);

  if (failed) return <div className="fbv-message">책을 찾을 수 없거나 아직 공개되지 않았습니다.</div>;
  if (!book) return <div className="fbv-message">책을 펼치는 중…</div>;
  const infinite = book.kind === "infinite" && book.canvas;
  if (!infinite && book.pages.length === 0) return <div className="fbv-message">아직 페이지가 없는 책입니다.</div>;
  return (
    <>
      {infinite ? <Suspense fallback={null}>{new URLSearchParams(window.location.search).has("print") ? <InfinityPrint book={book} /> : <InfinityViewer book={book} />}</Suspense> : <FlipViewer book={book} />}
      {canEdit && (
        <div className="fbv-adminbar">
          <button type="button" onClick={backToEditor}><FiArrowLeft />편집으로 돌아가기</button>
          <span>{book.published ? "공개 중 · 관리자 미리보기" : "비공개 · 미리보기"}</span>
        </div>
      )}
    </>
  );
}
