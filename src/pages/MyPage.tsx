import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeftIcon } from "../components/icons";
import { useAuth } from "../auth/AuthContext";
import "./MyPage.css";

/** Official multicolor Google "G" mark. */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export default function MyPage() {
  const navigate = useNavigate();
  const { user, loading, configured, signInWithGoogle, signInWithEmail, logout } =
    useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function runAuth(action: () => Promise<unknown>) {
    setError("");
    setSubmitting(true);
    try {
      await action();
      navigate("/cases");
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleEmailLogin(e: FormEvent) {
    e.preventDefault();
    void runAuth(() => signInWithEmail(email.trim(), password));
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
          <h1 className="auth-card__title">로그인됨</h1>
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
          <button
            type="button"
            className="auth-card__secondary"
            onClick={() => void logout()}
          >
            로그아웃
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link to="/" className="auth-card__logo">
          index
        </Link>
        <h1 className="auth-card__title">로그인</h1>
        <p className="auth-card__lead">Google 계정 또는 이메일로 계속하세요.</p>

        {!configured && (
          <div className="auth-card__notice">
            Firebase 설정이 필요합니다. `.env.local`에 Firebase Web App 값을
            추가하세요.
          </div>
        )}

        <button
          type="button"
          className="auth-card__google"
          onClick={() => void runAuth(signInWithGoogle)}
          disabled={!configured || submitting}
        >
          <GoogleLogo />
          Google로 로그인
        </button>

        <div className="auth-card__divider">or</div>

        <form className="auth-card__form" onSubmit={handleEmailLogin}>
          <input
            type="email"
            className="auth-card__field"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            type="password"
            className="auth-card__field"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error && <p className="auth-card__error">{error}</p>}
          <button
            type="submit"
            className="auth-card__submit"
            disabled={!configured || submitting}
          >
            로그인
          </button>
        </form>

        <p className="auth-card__switch">
          아직 계정이 없나요? <Link to="/signup">회원가입</Link>
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
