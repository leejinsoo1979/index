import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeftIcon } from "../components/icons";
import { useAuth } from "../auth/AuthContext";
import {
  TermsSectionBlock,
  privacySections,
  termsSections,
} from "./Terms";
import "./MyPage.css";
import "./Signup.css";

type MemberType = "general" | "association";
type Gender = "male" | "female";

const memberTypes: {
  value: MemberType;
  title: string;
  description: string;
}[] = [
  {
    value: "general",
    title: "일반회원",
    description: "실내건축에 관심 있는 누구나 — 사례 검색과 세미나 신청",
  },
  {
    value: "association",
    title: "협회등록회원",
    description: "협회 등록 업체·전문가 — 사업자 정보 등록 후 전체 서비스 이용",
  },
];

const steps = ["회원 유형", "약관 동의", "정보 입력"];

export default function Signup() {
  const navigate = useNavigate();
  const { user, loading, configured, signUpWithEmail } = useAuth();

  const [step, setStep] = useState(0);
  const [memberType, setMemberType] = useState<MemberType | null>(null);

  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState<"terms" | "privacy" | null>(
    null,
  );
  const allAgreed = agreeTerms && agreePrivacy;

  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [company, setCompany] = useState("");
  const [businessFile, setBusinessFile] = useState<File | null>(null);

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isAssociation = memberType === "association";

  function selectType(type: MemberType) {
    setMemberType(type);
    setStep(1);
  }

  function toggleAll(checked: boolean) {
    setAgreeTerms(checked);
    setAgreePrivacy(checked);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (!gender) {
      setError("성별을 선택해 주세요.");
      return;
    }
    if (isAssociation && !businessFile) {
      setError("사업자등록증을 첨부해 주세요.");
      return;
    }

    setSubmitting(true);
    try {
      await signUpWithEmail(email.trim(), password, name.trim());
      // Auth stores email/password/name only — keep the extended profile
      // locally until a member-profile backend (e.g. Firestore) is wired up.
      window.localStorage.setItem(
        `index-member-profile:${email.trim().toLowerCase()}`,
        JSON.stringify({
          memberType,
          userId,
          phone,
          gender,
          address,
          birthdate,
          company: isAssociation ? company : undefined,
          businessFileName: businessFile?.name,
          agreedAt: new Date().toISOString(),
        }),
      );
      navigate("/cases");
    } catch (err) {
      setError(err instanceof Error ? err.message : "회원가입에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="auth-page">
        <p className="auth-page__loading">인증 상태를 확인하는 중입니다.</p>
      </div>
    );
  }

  if (user) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <Link to="/" className="auth-card__logo">
            index
          </Link>
          <h1 className="auth-card__title">이미 로그인됨</h1>
          <p className="auth-card__lead">
            {user.displayName || user.email} 계정으로 접속 중입니다.
          </p>
          <button
            type="button"
            className="auth-card__submit"
            onClick={() => navigate("/cases")}
          >
            서비스로 이동
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="signup-card">
        <Link to="/" className="auth-card__logo">
          index
        </Link>
        <h1 className="auth-card__title">회원가입</h1>

        <ol className="signup-steps" aria-label="가입 단계">
          {steps.map((label, index) => (
            <li
              key={label}
              className={
                index === step ? "is-current" : index < step ? "is-done" : ""
              }
              aria-current={index === step ? "step" : undefined}
            >
              <i>{index + 1}</i>
              {label}
            </li>
          ))}
        </ol>

        {!configured && (
          <div className="auth-card__notice">
            Firebase 설정이 필요합니다. `.env.local`에 Firebase Web App 값을
            추가하세요.
          </div>
        )}

        {step === 0 && (
          <div className="signup-types">
            {memberTypes.map((type) => (
              <button
                key={type.value}
                type="button"
                className={`signup-type${memberType === type.value ? " is-selected" : ""}`}
                onClick={() => selectType(type.value)}
              >
                <strong>{type.title}</strong>
                <span>{type.description}</span>
              </button>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="signup-agree">
            <label className="signup-agree__all">
              <input
                type="checkbox"
                checked={allAgreed}
                onChange={(e) => toggleAll(e.target.checked)}
              />
              <span>전체 동의</span>
            </label>

            <div
              className={`signup-agree__item${expandedDoc === "terms" ? " is-open" : ""}`}
            >
              <div className="signup-agree__row">
                <label>
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                  />
                  <span>
                    이용약관 동의 <em>(필수)</em>
                  </span>
                </label>
                <button
                  type="button"
                  aria-expanded={expandedDoc === "terms"}
                  onClick={() =>
                    setExpandedDoc(expandedDoc === "terms" ? null : "terms")
                  }
                >
                  {expandedDoc === "terms" ? "접기" : "펼치기"}
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m7 10 5 5 5-5" />
                  </svg>
                </button>
              </div>
              {expandedDoc === "terms" && (
                <div className="signup-agree__doc" tabIndex={0}>
                  {termsSections.map((section) => (
                    <TermsSectionBlock key={section.title} section={section} />
                  ))}
                </div>
              )}
            </div>

            <div
              className={`signup-agree__item${expandedDoc === "privacy" ? " is-open" : ""}`}
            >
              <div className="signup-agree__row">
                <label>
                  <input
                    type="checkbox"
                    checked={agreePrivacy}
                    onChange={(e) => setAgreePrivacy(e.target.checked)}
                  />
                  <span>
                    개인정보 수집·이용 동의 <em>(필수)</em>
                  </span>
                </label>
                <button
                  type="button"
                  aria-expanded={expandedDoc === "privacy"}
                  onClick={() =>
                    setExpandedDoc(expandedDoc === "privacy" ? null : "privacy")
                  }
                >
                  {expandedDoc === "privacy" ? "접기" : "펼치기"}
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m7 10 5 5 5-5" />
                  </svg>
                </button>
              </div>
              {expandedDoc === "privacy" && (
                <div className="signup-agree__doc" tabIndex={0}>
                  {privacySections.map((section) => (
                    <TermsSectionBlock key={section.title} section={section} />
                  ))}
                </div>
              )}
            </div>

            <div className="signup-nav">
              <button type="button" onClick={() => setStep(0)}>
                이전
              </button>
              <button
                type="button"
                className="is-primary"
                disabled={!allAgreed}
                onClick={() => setStep(2)}
              >
                다음
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <form className="signup-form" onSubmit={handleSubmit}>
            <label>
              아이디
              <input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <div className="signup-form__row">
              <label>
                비밀번호
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>
              <label>
                비밀번호 확인
                <input
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>
            </div>
            <label>
              이메일
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label>
              휴대폰번호
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="010-0000-0000"
                autoComplete="tel"
                required
              />
            </label>
            <div className="signup-form__row">
              <label>
                이름
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </label>
              <fieldset className="signup-form__gender">
                <legend>성별</legend>
                <label>
                  <input
                    type="radio"
                    name="gender"
                    checked={gender === "male"}
                    onChange={() => setGender("male")}
                  />
                  남성
                </label>
                <label>
                  <input
                    type="radio"
                    name="gender"
                    checked={gender === "female"}
                    onChange={() => setGender("female")}
                  />
                  여성
                </label>
              </fieldset>
            </div>
            <label>
              주소
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                autoComplete="street-address"
                required
              />
            </label>
            <label>
              생년월일
              <input
                type="date"
                value={birthdate}
                onChange={(e) => setBirthdate(e.target.value)}
                required
              />
            </label>

            {isAssociation && (
              <>
                <label>
                  업체명
                  <input
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    autoComplete="organization"
                    required
                  />
                </label>
                <label>
                  사업자등록증 첨부
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) =>
                      setBusinessFile(e.target.files?.[0] ?? null)
                    }
                  />
                  {businessFile && <small>{businessFile.name}</small>}
                </label>
              </>
            )}

            {error && <p className="auth-card__error">{error}</p>}

            <div className="signup-nav">
              <button type="button" onClick={() => setStep(1)}>
                이전
              </button>
              <button
                type="submit"
                className="is-primary"
                disabled={submitting || !configured}
              >
                {submitting ? "가입 중..." : "가입하기"}
              </button>
            </div>
          </form>
        )}

        <p className="auth-card__switch">
          이미 계정이 있나요? <Link to="/mypage">로그인</Link>
        </p>

        <button
          type="button"
          className="auth-card__back"
          onClick={() => navigate(-1)}
        >
          <ArrowLeftIcon /> 돌아가기
        </button>
      </div>
    </div>
  );
}
