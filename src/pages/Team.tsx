import { Link } from "react-router-dom";
import TeamShowcase from "@/components/ui/team-showcase";
import { kiaaMembers } from "../data/team";
import "./Team.css";


export default function Team() {
  return (
    <main className="team-page">
      <div className="team-page__shell">
        <nav className="team-page__breadcrumb" aria-label="현재 위치">
          <Link to="/">HOME</Link>
          <span>›</span>
          <span>협회 소개</span>
          <span>›</span>
          <strong>조직 안내</strong>
        </nav>

        <h1 className="team-page__title">조직 안내</h1>
        <p className="team-page__lead">
          한국실내건축가협회 INDEX 운영진을 소개합니다. 사진이나 이름에 마우스를
          올려 각 구성원을 확인해 보세요.
        </p>

        <TeamShowcase members={kiaaMembers} />
      </div>
    </main>
  );
}
