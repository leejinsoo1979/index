import { Link } from "react-router-dom";
import TeamShowcase, { type TeamMember } from "@/components/ui/team-showcase";
import "./Team.css";

const kiaaMembers: TeamMember[] = [
  {
    id: "1",
    name: "김성원",
    role: "회장 · CHAIRMAN",
    image: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&q=70&fit=crop",
    social: { linkedin: "#" },
  },
  {
    id: "2",
    name: "이해린",
    role: "부회장 · VICE CHAIRMAN",
    image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&q=70&fit=crop",
    social: { linkedin: "#", instagram: "#" },
  },
  {
    id: "3",
    name: "박준호",
    role: "기술위원장 · TECHNICAL DIRECTOR",
    image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&q=70&fit=crop",
    social: { linkedin: "#" },
  },
  {
    id: "4",
    name: "최다인",
    role: "교육위원장 · EDUCATION DIRECTOR",
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&q=70&fit=crop",
    social: { linkedin: "#", twitter: "#" },
  },
  {
    id: "5",
    name: "정우석",
    role: "사례DB 총괄 · CASE DATABASE LEAD",
    image: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&q=70&fit=crop",
    social: { behance: "#", linkedin: "#" },
  },
  {
    id: "6",
    name: "한서율",
    role: "사무국장 · SECRETARY GENERAL",
    image: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&q=70&fit=crop",
    social: { instagram: "#" },
  },
];

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
