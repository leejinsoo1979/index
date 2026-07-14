import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  loadSeminars,
  saveSeminars,
  type AdminSeminar,
} from "../../lib/adminStore";

const STATUSES: AdminSeminar["status"][] = ["예정", "접수중", "완료"];
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MAX_GALLERY = 8;

/** "2026-08-04" → "2026.08.04 (화)" — 사이트 표기와 동일한 형식 */
function formatDotDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${iso.replaceAll("-", ".")} (${WEEKDAYS[d.getDay()]})`;
}

/** "2026.08.04 (화)" → "2026-08-04" (date input defaultValue용) */
function toIsoDate(dot?: string): string {
  const m = dot?.match(/(\d{4})[.-](\d{2})[.-](\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

/** 업로드 이미지를 리사이즈해 data URL로 변환 (localStorage 용량 보호) */
function readImage(file: File, maxSize = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.78));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 읽을 수 없습니다."));
    };
    img.src = url;
  });
}

const fmt = (n: number) => n.toLocaleString("ko-KR");

export default function AdminSeminars() {
  const [seminars, setSeminars] = useState<AdminSeminar[]>(loadSeminars);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<AdminSeminar | null>(null);
  const [formError, setFormError] = useState("");

  // 이미지·주소는 미리보기가 필요해 제어 상태로 관리 (나머지는 FormData)
  const [thumbnail, setThumbnail] = useState<string>("");
  const [gallery, setGallery] = useState<string[]>([]);
  const [address, setAddress] = useState("");
  const thumbInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  function update(next: AdminSeminar[]) {
    setSeminars(next);
    try {
      saveSeminars(next);
    } catch {
      setFormError(
        "저장 공간이 부족합니다. 이미지 수를 줄이거나 기존 세미나의 이미지를 정리해 주세요.",
      );
    }
  }

  function setStatus(id: number, status: AdminSeminar["status"]) {
    update(seminars.map((s) => (s.id === id ? { ...s, status } : s)));
  }

  function remove(id: number) {
    if (!window.confirm("이 세미나를 삭제할까요? 진행 중인 신청 내역은 유지됩니다.")) return;
    update(seminars.filter((s) => s.id !== id));
  }

  function openComposer(target: AdminSeminar | null) {
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
    try {
      setThumbnail(await readImage(file, 1200));
      setFormError("");
    } catch {
      setFormError("섬네일 이미지를 읽을 수 없습니다. 다른 파일을 선택해 주세요.");
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
    try {
      const converted = await Promise.all(
        files.slice(0, room).map((f) => readImage(f, 1000)),
      );
      setGallery((cur) => [...cur, ...converted]);
      setFormError(
        files.length > room
          ? `관련 이미지는 최대 ${MAX_GALLERY}장까지라 ${files.length - room}장은 제외했습니다.`
          : "",
      );
    } catch {
      setFormError("이미지를 읽을 수 없습니다. 파일 형식을 확인해 주세요.");
    }
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const get = (key: string) => String(data.get(key) ?? "").trim();

    const title = get("title");
    const dateIso = get("date");
    const location = get("location");
    const capacity = Number(get("capacity"));
    const price = Number(get("price"));
    const timeStart = get("timeStart");
    const timeEnd = get("timeEnd");
    const applyDeadline = get("applyDeadline");

    if (!title) return setFormError("제목을 입력해 주세요.");
    if (!dateIso) return setFormError("진행 일자를 선택해 주세요.");
    if (!location) return setFormError("장소 표기(지역)를 입력해 주세요.");
    if (!address.trim()) return setFormError("주소를 입력해 주세요.");
    if (!Number.isFinite(capacity) || capacity < 1)
      return setFormError("참여 인원(정원)은 1명 이상이어야 합니다.");
    if (!Number.isFinite(price) || price < 0)
      return setFormError("수강료를 입력해 주세요. 무료 세미나는 0을 입력합니다.");
    if (timeStart && timeEnd && timeEnd <= timeStart)
      return setFormError("종료 시간은 시작 시간보다 늦어야 합니다.");
    if (applyDeadline && applyDeadline > dateIso)
      return setFormError("접수 마감일은 진행 일자 이전이어야 합니다.");
    if (!thumbnail) return setFormError("섬네일 이미지를 등록해 주세요.");

    const record = {
      title,
      level: (get("level") === "심화" ? "심화" : "기초") as AdminSeminar["level"],
      status: (STATUSES.includes(get("status") as AdminSeminar["status"])
        ? get("status")
        : "예정") as AdminSeminar["status"],
      date: formatDotDate(dateIso),
      time: timeStart && timeEnd ? `${timeStart} ~ ${timeEnd}` : undefined,
      applyDeadline: applyDeadline ? applyDeadline.replaceAll("-", ".") : undefined,
      location,
      address: address.trim(),
      venue: get("venue") || undefined,
      capacity,
      price,
      instructor: get("instructor") || undefined,
      image: thumbnail,
      gallery: gallery.length ? gallery : undefined,
      description: get("description") || undefined,
    };

    if (editing) {
      update(seminars.map((s) => (s.id === editing.id ? { ...s, ...record } : s)));
    } else {
      const id = Math.max(0, ...seminars.map((s) => s.id)) + 1;
      update([{ id, enrolled: 0, ...record }, ...seminars]);
    }
    closeComposer();
  }

  const editingTime = editing?.time?.split("~").map((t) => t.trim()) ?? [];

  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <div>
          <h1>세미나 관리</h1>
          <p>세미나 일정·모집 상태·정원·수강료를 관리합니다.</p>
        </div>
        <button
          type="button"
          className="admin-btn admin-btn--primary"
          onClick={() => openComposer(null)}
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
              {seminars.map((s) => (
                <tr key={s.id}>
                  <td>{s.id}</td>
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
                    {s.date}
                    {s.time && <small className="admin-table__sub">{s.time}</small>}
                  </td>
                  <td>{s.location}</td>
                  <td>{s.price === 0 ? "무료" : `${fmt(s.price)}원`}</td>
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
                      onClick={() => openComposer(s)}
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
                  <td colSpan={10} className="admin-table__empty">
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
                  defaultValue={toIsoDate(editing?.date)}
                  required
                />
              </label>
              <label>
                시작 시간
                <input
                  name="timeStart"
                  type="time"
                  defaultValue={editingTime[0] ?? "14:00"}
                />
              </label>
              <label>
                종료 시간
                <input
                  name="timeEnd"
                  type="time"
                  defaultValue={editingTime[1] ?? "17:00"}
                />
              </label>
            </div>
            <label>
              접수 마감일
              <input
                name="applyDeadline"
                type="date"
                defaultValue={toIsoDate(editing?.applyDeadline)}
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

            {formError && <p className="admin-modal__error">{formError}</p>}

            <div className="admin-modal__actions">
              <button type="button" className="admin-btn" onClick={closeComposer}>
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
