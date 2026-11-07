import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  APPLICATION_STATUS_LABEL,
  cancelApplication,
  deleteSeminar,
  effectiveStatus,
  formatSeminarDate,
  formatTimeRange,
  formatWon,
  holdsSeat,
  importLegacySeminars,
  saveSeminar,
  setApplicationConfirmed,
  setSeminarFields,
  uploadSeminarImage,
  useSeminarApplications,
  useSeminars,
  type Seminar,
  type SeminarApplication,
  type SeminarInput,
  type SeminarStatus,
} from "../../lib/seminars";
import { CustomSelect } from "../../components/ui/custom-select";

const STATUSES: SeminarStatus[] = ["예정", "접수중", "완료"];
const MAX_GALLERY = 8;

/** Applicant roster → CSV (opens in Excel with Korean intact thanks to the BOM). */
function downloadRoster(seminar: Seminar, rows: SeminarApplication[]) {
  const head = ["상태", "이름", "이메일", "전화번호", "소속/직책", "신청 동기", "신청일"];
  const esc = (v: string) => `"${v.replaceAll('"', '""')}"`;
  const lines = rows.map((a) =>
    [
      APPLICATION_STATUS_LABEL[a.status],
      a.applicant.name,
      a.applicant.email,
      a.applicant.phone ?? "",
      a.applicant.affiliation ?? "",
      a.applicant.motivation ?? "",
      new Date(a.createdAt).toLocaleString("ko-KR"),
    ]
      .map(esc)
      .join(","),
  );
  const blob = new Blob(["\ufeff" + [head.map(esc).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${seminar.date}_${seminar.title}_신청자.csv`.replace(/[\\/:*?"<>|]/g, " ");
  link.click();
  URL.revokeObjectURL(link.href);
}

const fmt = (n: number) => n.toLocaleString("ko-KR");

export default function AdminSeminars() {
  const { data: seminars, loading, error: loadError } = useSeminars({ includeUnpublished: true });
  const { data: applications } = useSeminarApplications({ all: true });
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<Seminar | null>(null);
  const [rosterFor, setRosterFor] = useState<Seminar | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");

  // 이미지·주소는 미리보기가 필요해 제어 상태로 관리 (나머지는 FormData)
  const [thumbnail, setThumbnail] = useState<string>("");
  const [gallery, setGallery] = useState<string[]>([]);
  const [address, setAddress] = useState("");
  const thumbInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const appsBySeminar = useMemo(() => {
    const map = new Map<string, SeminarApplication[]>();
    for (const a of applications) map.set(a.seminarId, [...(map.get(a.seminarId) ?? []), a]);
    return map;
  }, [applications]);

  async function run(action: () => Promise<unknown>, failMessage: string) {
    setNotice("");
    try {
      await action();
    } catch (err) {
      setNotice(`${failMessage}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function remove(s: Seminar) {
    const count = (appsBySeminar.get(s.id) ?? []).filter((a) => holdsSeat(a.status)).length;
    const warn = count > 0 ? `\n신청자 ${count}명의 신청 내역은 유지되지만 세미나 페이지는 사라집니다.` : "";
    if (!window.confirm(`'${s.title}' 세미나를 삭제할까요?${warn}`)) return;
    void run(() => deleteSeminar(s.id), "삭제에 실패했습니다");
  }

  function openComposer(target: Seminar | null) {
    setEditing(target);
    setThumbnail(target?.image ?? "");
    setGallery(target?.gallery ?? []);
    setAddress(target?.address ?? "");
    setFormError("");
    setComposerOpen(true);
  }

  function closeComposer() {
    setComposerOpen(false);
    setEditing(null);
    setFormError("");
  }

  async function handleThumbnail(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      setThumbnail(await uploadSeminarImage(file, 1600));
      setFormError("");
    } catch (err) {
      setFormError(`섬네일 이미지를 올리지 못했습니다: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleGallery(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const room = MAX_GALLERY - gallery.length;
    if (room <= 0) {
      setFormError(`관련 이미지는 최대 ${MAX_GALLERY}장까지 등록할 수 있습니다.`);
      return;
    }
    setUploading(true);
    try {
      const uploaded = await Promise.all(files.slice(0, room).map((f) => uploadSeminarImage(f, 1400)));
      setGallery((cur) => [...cur, ...uploaded]);
      setFormError(
        files.length > room
          ? `관련 이미지는 최대 ${MAX_GALLERY}장까지라 ${files.length - room}장은 제외했습니다.`
          : "",
      );
    } catch (err) {
      setFormError(`이미지를 올리지 못했습니다: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
    }
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || uploading) return;
    const data = new FormData(event.currentTarget);
    const get = (key: string) => String(data.get(key) ?? "").trim();

    const title = get("title");
    const date = get("date");
    const location = get("location");
    const capacity = Number(get("capacity"));
    const price = Number(get("price"));
    const timeStart = get("timeStart");
    const timeEnd = get("timeEnd");
    const applyDeadline = get("applyDeadline");

    if (!title) return setFormError("제목을 입력해 주세요.");
    if (!date) return setFormError("진행 일자를 선택해 주세요.");
    if (!location) return setFormError("장소 표기(지역)를 입력해 주세요.");
    if (!address.trim()) return setFormError("주소를 입력해 주세요.");
    if (!Number.isFinite(capacity) || capacity < 1)
      return setFormError("참여 인원(정원)은 1명 이상이어야 합니다.");
    if (editing && capacity < editing.enrolled)
      return setFormError(`이미 ${editing.enrolled}명이 신청해 정원을 그보다 줄일 수 없습니다.`);
    if (!Number.isFinite(price) || price < 0)
      return setFormError("수강료를 입력해 주세요. 무료 세미나는 0을 입력합니다.");
    if (timeStart && timeEnd && timeEnd <= timeStart)
      return setFormError("종료 시간은 시작 시간보다 늦어야 합니다.");
    if (applyDeadline && applyDeadline > date)
      return setFormError("접수 마감일은 진행 일자 이전이어야 합니다.");
    if (!thumbnail) return setFormError("섬네일 이미지를 등록해 주세요.");

    const input: SeminarInput = {
      title,
      level: get("level") === "심화" ? "심화" : "기초",
      status: (STATUSES.includes(get("status") as SeminarStatus) ? get("status") : "예정") as SeminarStatus,
      date,
      timeStart: timeStart || undefined,
      timeEnd: timeEnd || undefined,
      applyDeadline: applyDeadline || undefined,
      location,
      address: address.trim(),
      venue: get("venue") || undefined,
      capacity,
      price,
      instructor: get("instructor") || undefined,
      image: thumbnail,
      gallery,
      description: get("description") || undefined,
      published: data.get("published") === "on",
    };

    setSaving(true);
    try {
      await saveSeminar(input, editing?.id);
      closeComposer();
    } catch (err) {
      setFormError(`저장에 실패했습니다: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }


  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <div>
          <h1>세미나 관리</h1>
          <p>세미나를 게시하면 세미나 일정(목록·캘린더)에 바로 반영됩니다. 신청/정원을 누르면 신청자를 관리할 수 있습니다.</p>
        </div>
        <button
          type="button"
          className="admin-btn admin-btn--primary"
          onClick={() => openComposer(null)}
        >
          + 세미나 등록
        </button>
      </header>

      {(loadError || notice) && <p className="admin-modal__error">{loadError ?? notice}</p>}

      {!loading && seminars.length === 0 && (
        <section className="admin-card admin-empty">
          <p>등록된 세미나가 없습니다. 새로 등록하거나, 기존 사이트에 있던 세미나 일정을 가져올 수 있습니다.</p>
          <button
            type="button"
            className="admin-btn"
            onClick={() => void run(importLegacySeminars, "가져오기에 실패했습니다")}
          >
            기존 세미나 일정 가져오기
          </button>
        </section>
      )}

      <section className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>게시</th>
                <th>번호</th>
                <th>섬네일</th>
                <th>구분</th>
                <th>제목</th>
                <th>일시</th>
                <th>장소</th>
                <th>수강료</th>
                <th>신청/정원</th>
                <th>상태</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {seminars.map((s, index) => (
                <tr key={s.id}>
                  <td>
                    <button
                      type="button"
                      className={`admin-switch${s.published ? " is-on" : ""}`}
                      aria-label={s.published ? "게시 중 — 누르면 비공개" : "비공개 — 누르면 게시"}
                      title={s.published ? "게시 중" : "비공개"}
                      onClick={() => void run(() => setSeminarFields(s.id, { published: !s.published }), "변경에 실패했습니다")}
                    >
                      <span />
                    </button>
                  </td>
                  <td>{index + 1}</td>
                  <td>
                    {s.image ? (
                      <img className="admin-thumb" src={s.image} alt="" />
                    ) : (
                      <span className="admin-thumb admin-thumb--empty">없음</span>
                    )}
                  </td>
                  <td>
                    <span className="admin-chip">{s.level}</span>
                  </td>
                  <td className="admin-table__ellipsis admin-table__title">{s.title}</td>
                  <td>
                    {formatSeminarDate(s.date)}
                    {formatTimeRange(s) && <small className="admin-table__sub">{formatTimeRange(s)}</small>}
                  </td>
                  <td>{s.location}</td>
                  <td>{formatWon(s.price)}</td>
                  <td>
                    <button
                      type="button"
                      className={`admin-link-btn${s.enrolled >= s.capacity ? " admin-full" : ""}`}
                      onClick={() => setRosterFor(s)}
                      title="신청자 보기"
                    >
                      {s.enrolled}/{s.capacity}명
                    </button>
                    {(() => {
                      const waiting = (appsBySeminar.get(s.id) ?? []).filter((a) => a.status === "APPLIED").length;
                      return waiting > 0 ? <small className="admin-table__sub">접수 대기 {waiting}</small> : null;
                    })()}
                  </td>
                  <td>
                    <CustomSelect
                      className={`cselect__trigger--compact admin-select admin-select--${effectiveStatus(s)}`}
                      value={s.status}
                      options={STATUSES}
                      aria-label="상태 변경"
                      onValueChange={(v) =>
                        void run(
                          () => setSeminarFields(s.id, { status: v as SeminarStatus }),
                          "상태 변경에 실패했습니다",
                        )
                      }
                    />
                  </td>
                  <td className="admin-table__actions">
                    <button
                      type="button"
                      className="admin-btn"
                      onClick={() => openComposer(s)}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn--danger"
                      onClick={() => remove(s)}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
              {seminars.length === 0 && (
                <tr>
                  <td colSpan={11} className="admin-table__empty">
                    {loading ? "불러오는 중…" : "등록된 세미나가 없습니다."}
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
            onClick={closeComposer}
          />
          <form
            className="admin-modal__card admin-modal__card--wide"
            onSubmit={handleSubmit}
          >
            <h2>{editing ? "세미나 수정" : "세미나 등록"}</h2>

            <p className="admin-modal__section">기본 정보</p>
            <label>
              제목 <em>*</em>
              <input
                name="title"
                defaultValue={editing?.title}
                placeholder="예: 방수 시스템 설계 실무: 현장 적용 사례 중심"
                required
                autoFocus
              />
            </label>
            <div className="admin-modal__row">
              <label>
                구분
                <CustomSelect name="level" defaultValue={editing?.level ?? "기초"} options={["기초", "심화"]} />
              </label>
              <label>
                상태
                <CustomSelect name="status" defaultValue={editing?.status ?? "접수중"} options={STATUSES} />
              </label>
              <label>
                강사
                <input
                  name="instructor"
                  defaultValue={editing?.instructor}
                  placeholder="예: 김방수 기술사"
                />
              </label>
            </div>

            <p className="admin-modal__section">일정</p>
            <div className="admin-modal__row">
              <label>
                진행 일자 <em>*</em>
                <input
                  name="date"
                  type="date"
                  defaultValue={editing?.date}
                  required
                />
              </label>
              <label>
                시작 시간
                <input
                  name="timeStart"
                  type="time"
                  defaultValue={editing ? editing.timeStart : "14:00"}
                />
              </label>
              <label>
                종료 시간
                <input
                  name="timeEnd"
                  type="time"
                  defaultValue={editing ? editing.timeEnd : "17:00"}
                />
              </label>
            </div>
            <label>
              접수 마감일
              <input
                name="applyDeadline"
                type="date"
                defaultValue={editing?.applyDeadline}
              />
            </label>

            <p className="admin-modal__section">장소</p>
            <div className="admin-modal__row admin-modal__row--2">
              <label>
                장소 표기(지역) <em>*</em>
                <input
                  name="location"
                  defaultValue={editing?.location}
                  placeholder="예: 서울 강남구 — 목록 카드에 표시"
                  required
                />
              </label>
              <label>
                상세 장소명
                <input
                  name="venue"
                  defaultValue={editing?.venue}
                  placeholder="예: 협회 3층 세미나실"
                />
              </label>
            </div>
            <label>
              주소 <em>*</em>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="예: 서울특별시 강남구 테헤란로 123"
              />
            </label>
            {address.trim() && (
              <div className="admin-modal__map">
                <iframe
                  title="세미나 장소 지도"
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=16&hl=ko&output=embed`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            )}

            <p className="admin-modal__section">모집 · 결제</p>
            <div className="admin-modal__row admin-modal__row--2">
              <label>
                참여 인원(정원) <em>*</em>
                <input
                  name="capacity"
                  type="number"
                  min={1}
                  defaultValue={editing?.capacity ?? 40}
                  required
                />
              </label>
              <label>
                수강료(원) <em>*</em>
                <input
                  name="price"
                  type="number"
                  min={0}
                  step={1000}
                  defaultValue={editing?.price ?? 66000}
                  required
                />
              </label>
            </div>
            <p className="admin-modal__hint">
              수강료는 세미나 신청 시 결제 금액으로 청구됩니다. 무료 세미나는 0을
              입력하세요.
            </p>

            <p className="admin-modal__section">이미지</p>
            <label>
              섬네일 이미지 <em>*</em>
              <input
                ref={thumbInputRef}
                type="file"
                accept="image/*"
                onChange={handleThumbnail}
              />
            </label>
            {thumbnail && (
              <div className="admin-upload-preview">
                <img src={thumbnail} alt="섬네일 미리보기" />
                <button
                  type="button"
                  className="admin-btn admin-btn--danger"
                  onClick={() => {
                    setThumbnail("");
                    if (thumbInputRef.current) thumbInputRef.current.value = "";
                  }}
                >
                  섬네일 삭제
                </button>
              </div>
            )}
            <label>
              세미나 관련 이미지 (최대 {MAX_GALLERY}장)
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleGallery}
              />
            </label>
            {gallery.length > 0 && (
              <div className="admin-gallery-preview">
                {gallery.map((src, i) => (
                  <figure key={`${i}-${src.slice(-16)}`}>
                    <img src={src} alt={`관련 이미지 ${i + 1}`} />
                    <button
                      type="button"
                      aria-label={`관련 이미지 ${i + 1} 삭제`}
                      onClick={() =>
                        setGallery((cur) => cur.filter((_, idx) => idx !== i))
                      }
                    >
                      ×
                    </button>
                  </figure>
                ))}
              </div>
            )}

            <p className="admin-modal__section">소개</p>
            <label>
              세미나 소개
              <textarea
                name="description"
                rows={4}
                defaultValue={editing?.description}
                placeholder="세미나 개요, 커리큘럼, 대상 등을 입력하세요."
              />
            </label>

            <p className="admin-modal__section">게시</p>
            <label className="admin-modal__check">
              <input type="checkbox" name="published" defaultChecked={editing ? editing.published : true} />
              세미나 일정에 바로 게시 (해제하면 관리자만 볼 수 있는 비공개 상태로 저장)
            </label>
            <p className="admin-modal__hint">
              회원은 상태가 ‘접수중’이고 정원·접수 마감일 안일 때만 신청할 수 있습니다. 진행 일자가 지나면 자동으로 ‘완료’로 표시됩니다.
            </p>

            {formError && <p className="admin-modal__error">{formError}</p>}

            <div className="admin-modal__actions">
              <button type="button" className="admin-btn" onClick={closeComposer}>
                취소
              </button>
              <button type="submit" className="admin-btn admin-btn--primary" disabled={saving || uploading}>
                {uploading ? "이미지 업로드 중…" : saving ? "저장 중…" : editing ? "저장" : "등록"}
              </button>
            </div>
          </form>
        </div>
      )}

      {rosterFor && (
        <Roster
          seminar={seminars.find((s) => s.id === rosterFor.id) ?? rosterFor}
          applications={appsBySeminar.get(rosterFor.id) ?? []}
          onClose={() => setRosterFor(null)}
        />
      )}
    </div>
  );
}

/** Applicants of one seminar: confirm / cancel, and export. Updates live. */
function Roster({
  seminar,
  applications,
  onClose,
}: {
  seminar: Seminar;
  applications: SeminarApplication[];
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const sorted = [...applications].sort(
    (a, b) => Number(holdsSeat(b.status)) - Number(holdsSeat(a.status)) || a.createdAt - b.createdAt,
  );
  const active = applications.filter((a) => holdsSeat(a.status));

  async function act(id: string, action: () => Promise<unknown>) {
    setBusy(id);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="admin-modal" role="dialog" aria-modal="true" aria-label={`${seminar.title} 신청자`}>
      <button type="button" className="admin-modal__overlay" aria-label="닫기" onClick={onClose} />
      <div className="admin-modal__card admin-modal__card--wide admin-modal__card--roster">
        <h2>신청자 관리</h2>
        <p className="admin-modal__hint">
          {seminar.title} · {formatSeminarDate(seminar.date)} · 신청 {active.length}명 / 정원 {seminar.capacity}명
          {seminar.price > 0 && ` · 수강료 ${fmt(seminar.price)}원 (결제 연동 전)`}
        </p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>상태</th>
                <th>신청자</th>
                <th>연락처</th>
                <th>소속/직책</th>
                <th>신청 동기</th>
                <th>신청일</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => (
                <tr key={a.id}>
                  <td>
                    <span className={`admin-badge admin-badge--app-${a.status.toLowerCase()}`}>
                      {APPLICATION_STATUS_LABEL[a.status]}
                    </span>
                  </td>
                  <td>
                    {a.applicant.name}
                    <small className="admin-table__sub">{a.applicant.email}</small>
                  </td>
                  <td>{a.applicant.phone ?? "-"}</td>
                  <td className="admin-table__ellipsis">{a.applicant.affiliation ?? "-"}</td>
                  <td className="admin-table__ellipsis" title={a.applicant.motivation}>
                    {a.applicant.motivation ?? "-"}
                  </td>
                  <td>{new Date(a.createdAt).toLocaleDateString("ko-KR")}</td>
                  <td className="admin-table__actions">
                    {a.status === "APPLIED" && (
                      <button
                        type="button"
                        className="admin-btn admin-btn--primary"
                        disabled={busy === a.id}
                        onClick={() => void act(a.id, () => setApplicationConfirmed(a.id, true))}
                      >
                        접수 확정
                      </button>
                    )}
                    {a.status === "CONFIRMED" && (
                      <button
                        type="button"
                        className="admin-btn"
                        disabled={busy === a.id}
                        onClick={() => void act(a.id, () => setApplicationConfirmed(a.id, false))}
                      >
                        확정 해제
                      </button>
                    )}
                    {holdsSeat(a.status) && (
                      <button
                        type="button"
                        className="admin-btn admin-btn--danger"
                        disabled={busy === a.id}
                        onClick={() => {
                          if (window.confirm(`${a.applicant.name}님의 신청을 취소할까요? 정원이 1석 반환됩니다.`)) {
                            void act(a.id, () => cancelApplication(a.id, "admin"));
                          }
                        }}
                      >
                        신청 취소
                      </button>
                    )}
                    {a.status === "CANCELED" && (
                      <span className="admin-table__done">{a.canceledBy === "admin" ? "관리자 취소" : "본인 취소"}</span>
                    )}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="admin-table__empty">
                    아직 신청자가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {error && <p className="admin-modal__error">{error}</p>}
        <div className="admin-modal__actions">
          <button
            type="button"
            className="admin-btn"
            disabled={sorted.length === 0}
            onClick={() => downloadRoster(seminar, sorted)}
          >
            명단 CSV 다운로드
          </button>
          <button type="button" className="admin-btn admin-btn--primary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
