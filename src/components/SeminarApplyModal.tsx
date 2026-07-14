import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowRightIcon } from "./icons";
import {
  loadSeminars,
  recordSeminarApplication,
  seminarFee,
} from "../lib/adminStore";
import "./SeminarApplyModal.css";

interface ApplySeminar {
  id: number;
  title: string;
  date: string;
  location: string;
  level: string;
  status: string;
  capacity: number;
  enrolled: number;
}

interface SeminarApplyModalProps {
  seminar: ApplySeminar;
  onClose: () => void;
}

export default function SeminarApplyModal({
  seminar,
  onClose,
}: SeminarApplyModalProps) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    affiliation: "",
    motivation: "",
  });
  const [agreed, setAgreed] = useState(false);

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
    form.name.trim() !== "" && form.email.trim() !== "" && agreed;

  function update(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    // 결제 내역 생성 + 신청 인원 증가 (관리자 화면과 연동)
    const payment = recordSeminarApplication(seminar.id, {
      name: form.name.trim(),
      email: form.email.trim(),
    });
    alert(
      `신청이 완료되었습니다.\n${seminar.title}\n신청자: ${form.name}\n결제 금액: ${payment.amount.toLocaleString("ko-KR")}원 (주문번호 ${payment.orderNo})`,
    );
    onClose();
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
              {seminar.status}
            </span>
          </div>
          <h2>{seminar.title}</h2>
          <p>
            {seminar.date} · {seminar.location} · 참가 {seminar.enrolled}/
            {seminar.capacity}
          </p>
          <p className="apply-modal__fee">
            수강료{" "}
            <strong>
              {(() => {
                const fee =
                  loadSeminars().find((s) => s.id === seminar.id)?.price ??
                  seminarFee(seminar.level === "심화" ? "심화" : "기초");
                return fee === 0 ? "무료" : `${fee.toLocaleString("ko-KR")}원`;
              })()}
            </strong>{" "}
            — 신청 완료 시 결제됩니다.
          </p>
        </div>

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

          <button type="submit" className="apply-modal__submit" disabled={!canSubmit}>
            신청 완료하기 <ArrowRightIcon />
          </button>

          <button type="button" className="apply-modal__cancel" onClick={onClose}>
            취소하고 돌아가기
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
