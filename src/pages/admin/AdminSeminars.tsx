import { useState, type FormEvent } from "react";
import {
  loadSeminars,
  saveSeminars,
  type AdminSeminar,
} from "../../lib/adminStore";

const STATUSES: AdminSeminar["status"][] = ["예정", "접수중", "완료"];

export default function AdminSeminars() {
  const [seminars, setSeminars] = useState<AdminSeminar[]>(loadSeminars);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<AdminSeminar | null>(null);

  function update(next: AdminSeminar[]) {
    setSeminars(next);
    saveSeminars(next);
  }

  function setStatus(id: number, status: AdminSeminar["status"]) {
    update(seminars.map((s) => (s.id === id ? { ...s, status } : s)));
  }

  function remove(id: number) {
    if (!window.confirm("이 세미나를 삭제할까요?")) return;
    update(seminars.filter((s) => s.id !== id));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const record = {
      title: String(data.get("title") ?? "").trim(),
      level: (data.get("level") === "심화" ? "심화" : "기초") as AdminSeminar["level"],
      status: (STATUSES.includes(data.get("status") as AdminSeminar["status"])
        ? data.get("status")
        : "예정") as AdminSeminar["status"],
      date: String(data.get("date") ?? "").trim(),
      location: String(data.get("location") ?? "").trim(),
      capacity: Number(data.get("capacity") ?? 0) || 0,
    };
    if (!record.title || !record.date) return;

    if (editing) {
      update(seminars.map((s) => (s.id === editing.id ? { ...s, ...record } : s)));
    } else {
      const id = Math.max(0, ...seminars.map((s) => s.id)) + 1;
      update([{ id, enrolled: 0, ...record }, ...seminars]);
    }
    setComposerOpen(false);
    setEditing(null);
  }

  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <div>
          <h1>세미나 관리</h1>
          <p>세미나 일정·모집 상태·정원을 관리합니다.</p>
        </div>
        <button
          type="button"
          className="admin-btn admin-btn--primary"
          onClick={() => {
            setEditing(null);
            setComposerOpen(true);
          }}
        >
          + 세미나 등록
        </button>
      </header>

      <section className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>번호</th>
                <th>구분</th>
                <th>제목</th>
                <th>일시</th>
                <th>장소</th>
                <th>신청/정원</th>
                <th>상태</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {seminars.map((s) => (
                <tr key={s.id}>
                  <td>{s.id}</td>
                  <td>
                    <span className="admin-chip">{s.level}</span>
                  </td>
                  <td className="admin-table__ellipsis admin-table__title">{s.title}</td>
                  <td>{s.date}</td>
                  <td>{s.location}</td>
                  <td>
                    <span className={s.enrolled >= s.capacity ? "admin-full" : ""}>
                      {s.enrolled}/{s.capacity}명
                    </span>
                  </td>
                  <td>
                    <select
                      className={`admin-select admin-select--${s.status}`}
                      value={s.status}
                      onChange={(e) =>
                        setStatus(s.id, e.target.value as AdminSeminar["status"])
                      }
                    >
                      {STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="admin-table__actions">
                    <button
                      type="button"
                      className="admin-btn"
                      onClick={() => {
                        setEditing(s);
                        setComposerOpen(true);
                      }}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn--danger"
                      onClick={() => remove(s.id)}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
              {seminars.length === 0 && (
                <tr>
                  <td colSpan={8} className="admin-table__empty">
                    등록된 세미나가 없습니다.
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
            <h2>{editing ? "세미나 수정" : "세미나 등록"}</h2>
            <label>
              제목
              <input name="title" defaultValue={editing?.title} required autoFocus />
            </label>
            <div className="admin-modal__row">
              <label>
                구분
                <select name="level" defaultValue={editing?.level ?? "기초"}>
                  <option value="기초">기초</option>
                  <option value="심화">심화</option>
                </select>
              </label>
              <label>
                상태
                <select name="status" defaultValue={editing?.status ?? "예정"}>
                  {STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                정원
                <input
                  name="capacity"
                  type="number"
                  min={1}
                  defaultValue={editing?.capacity ?? 40}
                />
              </label>
            </div>
            <label>
              일시
              <input
                name="date"
                defaultValue={editing?.date}
                placeholder="예: 2026.09.10 (목)"
                required
              />
            </label>
            <label>
              장소
              <input
                name="location"
                defaultValue={editing?.location}
                placeholder="예: 서울 강남구"
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
