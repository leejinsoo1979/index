import { Link } from "react-router-dom";
import "./Placeholder.css";

export default function Placeholder({ title }: { title: string }) {
  return (
    <section className="placeholder">
      <h1 className="placeholder__title">{title}</h1>
      <p className="placeholder__text">
        준비 중인 페이지입니다.
      </p>
      <Link to="/" className="placeholder__home">
        ← 홈으로 돌아가기
      </Link>
    </section>
  );
}
