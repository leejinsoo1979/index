import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ArrowRightIcon } from "./icons";
import { useAuth } from "../auth/AuthContext";
import {
  applyToSeminar,
  effectiveStatus,
  formatSeminarDate,
  formatWon,
  type Seminar,
} from "../lib/seminars";
import "./SeminarApplyModal.css";

interface SeminarApplyModalProps {
  seminar: Seminar;
  /** Signed-in member (or the local demo member). */
  uid: string;
  onClose: () => void;
}

export default function SeminarApplyModal({
  seminar,
  uid,
  onClose,
}: SeminarApplyModalProps) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: user?.displayName ?? "",
    email: user?.email ?? "",
    phone: "",
    affiliation: "",
    motivation: "",
  });
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const canSubmit =
    form.name.trim() !== "" && form.email.trim() !== "" && agreed && !submitting;

  function update(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      // 신청서 저장 + 정원 1석 차감 (관리자 화면에 실시간 반영)
      await applyToSeminar(seminar.id, uid, form);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "신청에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div
      className="apply-modal__overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="apply-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${seminar.title} 신청하기`}
      >
        <button
          type="button"
          className="apply-modal__close"
          aria-label="닫기"
          onClick={onClose}
        >
          ×
        </button>

        <div className="apply-modal__summary">
          <div className="apply-modal__badges">
            <span className="apply-modal__badge">{seminar.level}</span>
            <span className="apply-modal__badge apply-modal__badge--status">
              {effectiveStatus(seminar)}
            </span>
          </div>
          <h2>{seminar.title}</h2>
          <p>
            {formatSeminarDate(seminar.date)} · {seminar.location} · 참가 {seminar.enrolled}/
            {seminar.capacity}
          </p>
          <p className="apply-modal__fee">
            수강료 <strong>{formatWon(seminar.price)}</strong>
            {seminar.price > 0 && " — 결제는 접수 후 별도로 안내드립니다."}
          </p>
        </div>

        {done ? (
          <div className="apply-modal__form apply-modal__done" role="status">
            <h3>신청이 접수되었습니다</h3>
            <p>
              {form.name}님의 신청이 접수되었습니다. 접수 확정 여부와 신청 내역은
              마이페이지에서 확인할 수 있습니다.
            </p>
            <Link className="apply-modal__submit" to="/mypage" onClick={onClose}>
              신청 내역 보기 <ArrowRightIcon />
            </Link>
            <button type="button" className="apply-modal__cancel" onClick={onClose}>
              닫기
            </button>
          </div>
        ) : (
        <form className="apply-modal__form" onSubmit={handleSubmit}>
          <h3>신청 정보 입력</h3>

          <div className="apply-modal__grid">
            <div className="apply-modal__field">
              <label htmlFor="apply-name">
                이름 <span className="apply-modal__req">*</span>
              </label>
              <input
                id="apply-name"
                type="text"
                placeholder="이름을 입력하세요"
                value={form.name}
                onChange={update("name")}
                autoComplete="name"
              />
            </div>

            <div className="apply-modal__field">
              <label htmlFor="apply-email">
                이메일 <span className="apply-modal__req">*</span>
              </label>
              <input
                id="apply-email"
                type="email"
                placeholder="이메일을 입력하세요"
                value={form.email}
                onChange={update("email")}
                autoComplete="email"
              />
            </div>

            <div className="apply-modal__field">
              <label htmlFor="apply-phone">전화번호</label>
              <input
                id="apply-phone"
                type="tel"
                placeholder="전화번호를 입력하세요"
                value={form.phone}
                onChange={update("phone")}
                autoComplete="tel"
              />
            </div>

            <div className="apply-modal__field">
              <label htmlFor="apply-affiliation">소속 / 직책</label>
              <input
                id="apply-affiliation"
                type="text"
                placeholder="소속 및 직책을 입력하세요"
                value={form.affiliation}
                onChange={update("affiliation")}
              />
            </div>
          </div>

          <div className="apply-modal__field apply-modal__field--full">
            <label htmlFor="apply-motivation">신청 동기</label>
            <textarea
              id="apply-motivation"
              placeholder="신청 동기를 입력하세요"
              rows={4}
              value={form.motivation}
              onChange={update("motivation")}
            />
          </div>

          <label className="apply-modal__agree">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              개인정보 수집 및 이용에 동의합니다. (세미나 신청 및 운영 목적)
            </span>
          </label>

          {error && (
            <p className="apply-modal__error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="apply-modal__submit" disabled={!canSubmit}>
            {submitting ? "신청 중…" : "신청 완료하기"} <ArrowRightIcon />
          </button>

          <button type="button" className="apply-modal__cancel" onClick={onClose}>
            취소하고 돌아가기
          </button>
        </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
