import { useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthContext";
import { CustomSelect } from "../../components/ui/custom-select";
import {
  deletePost,
  importSamplePosts,
  POST_GROUPS,
  savePost,
  setPostVisible,
  usePosts,
  type Post,
  type PostGroup,
  type PostInput,
} from "../../lib/posts";

/**
 * 게시판 관리 — Case Library posts in Firestore `posts` (src/lib/posts.ts).
 * Write, edit (Markdown body: `## 제목` = 목차 항목, `| 표 |`, `> 강조`), hide, delete.
 * Until posts are stored, the site shows the original sample cases; "기존 사례 가져오기" copies them in.
 */
const GROUPS = ["전체", ...POST_GROUPS] as const;

function today() {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

const BODY_HINT = `## 1. 문제 상황
현장에서 무엇이 있었는지 적습니다.

## 2. 원인
| 항목 | 내용 |
| --- | --- |
| 원인 | 예: 방수층 끊김 |

> 강조하고 싶은 문장은 > 로 시작합니다.`;

export default function AdminBoards() {
  const { user } = useAuth();
  const { data: posts, loading, error: loadError, usingSamples } = usePosts({ includeHidden: true });
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<(typeof GROUPS)[number]>("전체");
  const [editing, setEditing] = useState<Post | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const filtered = useMemo(
    () => posts.filter((p) => (group === "전체" || p.group === group) && (!query.trim() || `${p.title} ${p.category}`.includes(query.trim()))),
    [posts, query, group],
  );

  async function run(work: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setNotice(done);
    } catch (e) {
      setError((e as Error).message || "처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input: PostInput = {
      title: String(data.get("title") ?? ""),
      group: String(data.get("group") ?? "기타") as PostGroup,
      category: String(data.get("category") ?? ""),
      date: String(data.get("date") ?? ""),
      excerpt: String(data.get("excerpt") ?? ""),
      image: String(data.get("image") ?? ""),
      body: String(data.get("body") ?? ""),
      visible: data.get("visible") === "on",
    };
    const id = editing && editing !== "new" ? editing.id : undefined;
    setBusy(true);
    setError("");
    try {
      await savePost(input, id, user?.email ?? null);
      setEditing(null);
      setNotice(id ? "저장했습니다. 사이트에 바로 반영됩니다." : "등록했습니다. 사이트에 바로 반영됩니다.");
    } catch (e) {
      setError((e as Error).message || "저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const current = editing && editing !== "new" ? editing : null;

  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <div>
          <h1>게시판 관리</h1>
          <p>케이스 라이브러리 게시글을 쓰고 고칩니다. 저장하면 사이트에 바로 반영됩니다.</p>
        </div>
        <button type="button" className="admin-btn admin-btn--primary" onClick={() => setEditing("new")} disabled={busy}>
          + 새 게시글
        </button>
      </header>

      {(loadError || error) && <p className="admin-modal__error">{error || `불러오지 못했습니다: ${loadError}`}</p>}
      {notice && <p className="admin-modal__hint">{notice}</p>}

      {usingSamples && !loading && (
        <section className="admin-card admin-empty">
          <p>
            아직 저장된 게시글이 없어 사이트에는 처음 들어 있던 샘플 사례 {posts.length}건이 보이고 있습니다. 가져오면 이 글들을 그대로 고치거나 지울 수 있습니다.
          </p>
          <button type="button" className="admin-btn admin-btn--primary" disabled={busy} onClick={() => void run(importSamplePosts, "샘플 사례를 게시판으로 가져왔습니다.")}>
            기존 사례 가져오기
          </button>
        </section>
      )}

      <div className="admin-toolbar">
        <input type="search" placeholder="제목·카테고리 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="admin-toolbar__tabs" role="tablist">
          {GROUPS.map((item) => (
            <button key={item} type="button" className={group === item ? "is-active" : ""} onClick={() => setGroup(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>

      <section className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>분류</th>
                <th>제목</th>
                <th>등록일</th>
                <th>조회</th>
                <th>노출</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className={p.visible ? "" : "is-muted"}>
                  <td>
                    <span className="admin-chip">{p.group}</span>
                  </td>
                  <td className="admin-table__ellipsis admin-table__title">
                    {p.title}
                    <span className="admin-table__sub">{p.category}</span>
                  </td>
                  <td>{p.date}</td>
                  <td>{p.views.toLocaleString("ko-KR")}</td>
                  <td>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={p.visible}
                      aria-label={p.visible ? "사이트에서 숨기기" : "사이트에 보이기"}
                      className={`admin-switch${p.visible ? " is-on" : ""}`}
                      disabled={busy || usingSamples}
                      onClick={() => void run(() => setPostVisible(p.id, !p.visible), p.visible ? "숨겼습니다." : "다시 보이게 했습니다.")}
                    >
                      <span />
                    </button>
                  </td>
                  <td className="admin-table__actions">
                    <button type="button" className="admin-btn" disabled={busy || usingSamples} onClick={() => setEditing(p)}>
                      수정
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn--danger"
                      disabled={busy || usingSamples}
                      onClick={() => window.confirm(`"${p.title}" 글을 삭제할까요? 되돌릴 수 없습니다.`) && void run(() => deletePost(p.id), "삭제했습니다.")}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="admin-table__empty">
                    {loading ? "불러오는 중…" : "조건에 맞는 게시글이 없습니다."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {usingSamples && <p className="admin-modal__hint">샘플 사례는 가져온 뒤에 수정·숨김·삭제할 수 있습니다.</p>}
      </section>

      {editing && (
        <div className="admin-modal" role="dialog" aria-modal="true" aria-label={current ? "게시글 수정" : "새 게시글"}>
          <button type="button" className="admin-modal__overlay" aria-label="닫기" onClick={() => setEditing(null)} />
          <form className="admin-modal__card" onSubmit={(e) => void handleSubmit(e)}>
            <h2>{current ? "게시글 수정" : "새 게시글"}</h2>
            <label>
              제목
              <input name="title" defaultValue={current?.title} required maxLength={200} autoFocus />
            </label>
            <div className="admin-modal__row">
              <label>
                분류
                <CustomSelect name="group" defaultValue={current?.group ?? "방수"} options={[...POST_GROUPS]} />
              </label>
              <label>
                세부 카테고리
                <input name="category" defaultValue={current?.category} placeholder="예: 방수/누수" />
              </label>
              <label>
                등록일
                <input name="date" defaultValue={current?.date ?? today()} placeholder="2026.11.08" required pattern="\d{4}\.\d{2}\.\d{2}" />
              </label>
            </div>
            <label>
              요약 (목록에 보이는 두세 줄)
              <textarea name="excerpt" rows={2} defaultValue={current?.excerpt} />
            </label>
            <label>
              대표 이미지 주소
              <input name="image" defaultValue={current?.image} placeholder="https://… 또는 /images/…" />
            </label>
            <label>
              본문
              <textarea name="body" rows={14} defaultValue={current?.body} placeholder={BODY_HINT} />
            </label>
            <p className="admin-modal__hint">'## 제목'으로 시작하는 줄이 목차 항목이 됩니다. 표는 | 로, 강조 문장은 &gt; 로 시작합니다.</p>
            <label className="admin-modal__check">
              <input type="checkbox" name="visible" defaultChecked={current?.visible ?? true} />
              사이트에 보이기
            </label>
            {error && <p className="admin-modal__error">{error}</p>}
            <div className="admin-modal__actions">
              <button type="button" className="admin-btn" onClick={() => setEditing(null)} disabled={busy}>
                취소
              </button>
              <button type="submit" className="admin-btn admin-btn--primary" disabled={busy}>
                {busy ? "저장 중…" : current ? "저장" : "등록"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
