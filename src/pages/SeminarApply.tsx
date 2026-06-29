import { useState, type FormEvent } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { upcomingSeminars } from "../data/seminars";
import { ArrowRightIcon, ChevronRightIcon } from "../components/icons";
import Placeholder from "./Placeholder";
import "./SeminarApply.css";

export default function SeminarApply() {
  const { id } = useParams();
  const navigate = useNavigate();
  const seminar =
    upcomingSeminars.find((s) => String(s.id) === id) ?? upcomingSeminars[0];

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    affiliation: "",
    motivation: "",
  });
  const [agreed, setAgreed] = useState(false);

  if (!seminar) return <Placeholder title="세미나를 찾을 수 없습니다" />;

  const canSubmit =
    form.name.trim() !== "" && form.email.trim() !== "" && agreed;

  function update(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    // Demo only — no real backend.
    alert(`신청이 완료되었습니다.\n${seminar.title}\n신청자: ${form.name}`);
    navigate("/seminars");
  }

  return (
    <div className="apply">
      <div className="apply__inner">
        {/* Breadcrumb */}
        <nav className="apply__crumbs" aria-label="경로">
          <Link to="/seminars">세미나 목록</Link>
          <ChevronRightIcon />
          <Link to={`/seminars/${seminar.id}`}>세미나 상세</Link>
          <ChevronRightIcon />
          <span className="apply__crumb-current">신청하기</span>
        </nav>

        {/* Seminar summary */}
        <div className="apply__summary">
          <div className="apply__badges">
            <span className="badge badge--level">{seminar.level}</span>
            <span
              className={
                "badge " +
                (seminar.status === "접수중" ? "badge--open" : "badge--upcoming")
              }
            >
              {seminar.status}
            </span>
          </div>
          <h2 className="apply__summary-title">{seminar.title}</h2>
          <div className="apply__summary-meta">
            <span>{seminar.date}</span>
            <span className="apply__dot">·</span>
            <span>{seminar.location}</span>
            <span className="apply__dot">·</span>
            <span>
              참가 {seminar.enrolled}/{seminar.capacity}
            </span>
          </div>
        </div>

        {/* Form */}
        <form className="apply__form" onSubmit={handleSubmit}>
          <h3 className="apply__form-title">신청 정보 입력</h3>

          <div className="apply__grid">
            <div className="apply__field">
              <label htmlFor="name">
                이름 <span className="apply__req">*</span>
              </label>
              <input
                id="name"
                type="text"
                placeholder="이름을 입력하세요"
                value={form.name}
                onChange={update("name")}
                autoComplete="name"
              />
            </div>

            <div className="apply__field">
              <label htmlFor="email">
                이메일 <span className="apply__req">*</span>
              </label>
              <input
                id="email"
                type="email"
                placeholder="이메일을 입력하세요"
                value={form.email}
                onChange={update("email")}
                autoComplete="email"
              />
            </div>

            <div className="apply__field">
              <label htmlFor="phone">전화번호</label>
              <input
                id="phone"
                type="tel"
                placeholder="전화번호를 입력하세요"
                value={form.phone}
                onChange={update("phone")}
                autoComplete="tel"
              />
            </div>

            <div className="apply__field">
              <label htmlFor="affiliation">소속 / 직책</label>
              <input
                id="affiliation"
                type="text"
                placeholder="소속 및 직책을 입력하세요"
                value={form.affiliation}
                onChange={update("affiliation")}
              />
            </div>
          </div>

          <div className="apply__field apply__field--full">
            <label htmlFor="motivation">신청 동기</label>
            <textarea
              id="motivation"
              placeholder="신청 동기를 입력하세요"
              rows={4}
              value={form.motivation}
              onChange={update("motivation")}
            />
          </div>

          <label className="apply__agree">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              개인정보 수집 및 이용에 동의합니다. (세미나 신청 및 운영 목적)
            </span>
          </label>

          <button
            type="submit"
            className="apply__submit"
            disabled={!canSubmit}
          >
            신청 완료하기 <ArrowRightIcon />
          </button>

          <Link to="/seminars" className="apply__cancel">
            취소하고 돌아가기
          </Link>
        </form>
      </div>
    </div>
  );
}
