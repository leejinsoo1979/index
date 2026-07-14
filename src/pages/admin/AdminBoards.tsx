import { useMemo, useState, type FormEvent } from "react";
import {
  loadPosts,
  savePosts,
  type AdminPost,
} from "../../lib/adminStore";

const GROUPS = ["전체", "방수", "마감", "설비", "단열", "전기", "기타"];

function today() {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export default function AdminBoards() {
  const [posts, setPosts] = useState<AdminPost[]>(loadPosts);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("전체");
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<AdminPost | null>(null);

  function update(next: AdminPost[]) {
    setPosts(next);
    savePosts(next);
  }

  const filtered = useMemo(
    () =>
      posts.filter(
        (p) =>
          (group === "전체" || p.group === group) &&
          (!query.trim() || p.title.includes(query.trim())),
      ),
    [posts, query, group],
  );

  function toggleVisible(id: number) {
    update(posts.map((p) => (p.id === id ? { ...p, visible: !p.visible } : p)));
  }

  function remove(id: number) {
    if (!window.confirm("이 게시글을 삭제할까요?")) return;
    update(posts.filter((p) => p.id !== id));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") ?? "").trim();
    const postGroup = String(data.get("group") ?? "기타");
    const category = String(data.get("category") ?? "").trim() || postGroup;
    if (!title) return;

    if (editing) {
      update(
        posts.map((p) =>
          p.id === editing.id ? { ...p, title, group: postGroup, category } : p,
        ),
      );
    } else {
      const id = Math.max(0, ...posts.map((p) => p.id)) + 1;
      update([
        { id, title, group: postGroup, category, date: today(), views: 0, visible: true },
        ...posts,
      ]);
    }
    setComposerOpen(false);
    setEditing(null);
  }

  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <div>
          <h1>게시판 관리</h1>
          <p>케이스 라이브러리 게시글을 관리합니다.</p>
        </div>
        <button
          type="button"
          className="admin-btn admin-btn--primary"
          onClick={() => {
            setEditing(null);
            setComposerOpen(true);
          }}
        >
          + 새 게시글
        </button>
      </header>

      <div className="admin-toolbar">
        <input
          type="search"
          placeholder="제목 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="admin-toolbar__tabs" role="tablist">
          {GROUPS.map((item) => (
            <button
              key={item}
              type="button"
              className={group === item ? "is-active" : ""}
              onClick={() => setGroup(item)}
            >
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
                <th>번호</th>
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
                  <td>{p.id}</td>
                  <td>
                    <span className="admin-chip">{p.group}</span>
                  </td>
                  <td className="admin-table__ellipsis admin-table__title">{p.title}</td>
                  <td>{p.date}</td>
                  <td>{p.views.toLocaleString("ko-KR")}</td>
                  <td>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={p.visible}
                      className={`admin-switch${p.visible ? " is-on" : ""}`}
                      onClick={() => toggleVisible(p.id)}
                    >
                      <span />
                    </button>
                  </td>
                  <td className="admin-table__actions">
                    <button
                      type="button"
                      className="admin-btn"
                      onClick={() => {
                        setEditing(p);
                        setComposerOpen(true);
                      }}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn--danger"
                      onClick={() => remove(p.id)}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="admin-table__empty">
                    조건에 맞는 게시글이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {composerOpen && (
        <div className="admin-modal" role="dialog" aria-modal="true">
          <button
            type="button"
            className="admin-modal__overlay"
            aria-label="닫기"
            onClick={() => {
              setComposerOpen(false);
              setEditing(null);
            }}
          />
          <form className="admin-modal__card" onSubmit={handleSubmit}>
            <h2>{editing ? "게시글 수정" : "새 게시글"}</h2>
            <label>
              제목
              <input name="title" defaultValue={editing?.title} required autoFocus />
            </label>
            <label>
              분류
              <select name="group" defaultValue={editing?.group ?? "방수"}>
                {GROUPS.filter((g) => g !== "전체").map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <label>
              세부 카테고리
              <input
                name="category"
                defaultValue={editing?.category}
                placeholder="예: 방수/누수"
              />
            </label>
            <div className="admin-modal__actions">
              <button
                type="button"
                className="admin-btn"
                onClick={() => {
                  setComposerOpen(false);
                  setEditing(null);
                }}
              >
                취소
              </button>
              <button type="submit" className="admin-btn admin-btn--primary">
                {editing ? "저장" : "등록"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
