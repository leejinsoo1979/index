import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserIcon, ArrowLeftIcon } from "../components/icons";
import "./MyPage.css";

type Method = "none" | "guest" | "member";

export default function MyPage() {
  const navigate = useNavigate();
  const [method, setMethod] = useState<Method>("none");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleLogin(e: FormEvent) {
    e.preventDefault();
    // Demo only — no real auth backend.
    alert(`로그인 시도: ${email}`);
  }

  return (
    <div className="mypage">
      <div className="mypage__inner">
        <Link to="/" className="mypage__logo">
          INDEX
        </Link>
        <p className="mypage__subtitle">로그인 방법을 선택해주세요</p>

        <div className="mypage__choices">
          <button
            type="button"
            className={
              "login-choice" + (method === "guest" ? " is-selected" : "")
            }
            onClick={() => setMethod("guest")}
          >
            <span className="login-choice__icon">
              <UserIcon />
            </span>
            <span className="login-choice__title">비회원으로 계속하기</span>
            <span className="login-choice__desc">The Standard We Trust.</span>
          </button>

          <button
            type="button"
            className={
              "login-choice login-choice--dark" +
              (method === "member" ? " is-selected" : "")
            }
            onClick={() => setMethod("member")}
          >
            <span className="login-choice__icon">
              <UserIcon />
            </span>
            <span className="login-choice__title">회원 로그인</span>
            <span className="login-choice__desc">Your Index for Clear Choices</span>
          </button>
        </div>

        {/* Member login form — revealed when 회원 로그인 is chosen */}
        <div
          className={
            "mypage__form-wrap" + (method === "member" ? " is-open" : "")
          }
        >
          <form className="login-form" onSubmit={handleLogin}>
            <h2 className="login-form__heading">회원 로그인</h2>
            <input
              type="email"
              className="login-form__field"
              placeholder="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <input
              type="password"
              className="login-form__field"
              placeholder="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button type="submit" className="login-form__submit">
              로그인
            </button>
            <p className="login-form__signup">
              아직 회원이 아니신가요?{" "}
              <Link to="/signup">회원가입</Link>
            </p>
          </form>
        </div>

        {/* Guest continuation message */}
        <div
          className={
            "mypage__form-wrap" + (method === "guest" ? " is-open" : "")
          }
        >
          <div className="guest-note">
            <p>비회원으로 둘러볼 수 있습니다.</p>
            <button
              type="button"
              className="login-form__submit"
              onClick={() => navigate("/")}
            >
              계속하기
            </button>
          </div>
        </div>

        <button
          type="button"
          className="mypage__back"
          onClick={() => navigate(-1)}
        >
          <ArrowLeftIcon /> 돌아가기
        </button>
      </div>
    </div>
  );
}
