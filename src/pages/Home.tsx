import { Link } from "react-router-dom";
import LogoParticles from "../components/LogoParticles";
import "./Home.css";

export default function Home() {
  return (
    <section className="home">
      <LogoParticles />
      <Link to="/mypage" className="home__start">
        Start
      </Link>
      <div className="home__hero">
        <p className="home__tagline">
          인테리어 공사 정보를 <span>index</span>로 검색하세요.
        </p>
        <p className="home__credit">crafted for K-IAA</p>
      </div>
    </section>
  );
}
