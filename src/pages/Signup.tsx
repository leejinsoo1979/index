import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeftIcon } from "../components/icons";
import { useAuth } from "../auth/AuthContext";
import "./MyPage.css";

export default function Signup() {
  const navigate = useNavigate();
  const { user, loading, configured, signInWithGoogle, signUpWithEmail } =
    useAuth();
  const [name, setName] = useState("");
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
      setError(err instanceof Error ? err.message : "회원가입에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSignup(e: FormEvent) {
    e.preventDefault();
    void runAuth(() => signUpWithEmail(email.trim(), password, name));
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
      <div className="auth-card">
        <Link to="/" className="auth-card__logo">
          index
        </Link>
        <h1 className="auth-card__title">회원가입</h1>
        <p className="auth-card__lead">Google 계정 또는 이메일로 가입하세요.</p>

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
          <span>G</span>
          Google로 가입
        </button>

        <div className="auth-card__divider">or</div>

        <form className="auth-card__form" onSubmit={handleSignup}>
          <input
            type="text"
            className="auth-card__field"
            placeholder="이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
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
            autoComplete="new-password"
            minLength={6}
            required
          />
          {error && <p className="auth-card__error">{error}</p>}
          <button
            type="submit"
            className="auth-card__submit"
            disabled={!configured || submitting}
          >
            회원가입
          </button>
        </form>

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
