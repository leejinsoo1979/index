import { useNavigate } from "react-router-dom";
import SearchBar from "../components/SearchBar";
import "./Home.css";

export default function Home() {
  const navigate = useNavigate();

  function handleSearch(query: string) {
    navigate(`/cases?q=${encodeURIComponent(query)}`);
  }

  return (
    <section className="home">
      <div className="home__hero">
        <h1 className="home__title">index</h1>
        <p className="home__sub">인테리어 공사 정보, 검색으로 시작하세요.</p>
        <div className="home__search">
          <SearchBar onSearch={handleSearch} />
        </div>
      </div>
    </section>
  );
}
