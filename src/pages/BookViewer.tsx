import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import FlipViewer from "../components/flipbook/FlipViewer";
import { useAuth } from "../auth/AuthContext";
import { getFlipbook, type Flipbook } from "../lib/flipbooks";
import "../components/flipbook/Flipbook.css";

/** The public link of a book. Unpublished books open only for admins (preview). */
export default function BookViewer() {
  const { id = "" } = useParams();
  const { loading, configured, isAdmin } = useAuth();
  const [book, setBook] = useState<Flipbook | null>(null);
  const [failed, setFailed] = useState(false);

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
  if (book.pages.length === 0) return <div className="fbv-message">아직 페이지가 없는 책입니다.</div>;
  return <FlipViewer book={book} />;
}
