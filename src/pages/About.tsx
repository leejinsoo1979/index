import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { about } from "../data/about";
import { cases } from "../data/cases";
import { kiaaMembers } from "../data/team";
import { partners as defaultPartners, type Partner } from "../data/partners";
import { mergeContent, useSiteContent } from "../lib/siteContent";
import { aboutEditableDefaults, type AboutEditable } from "../data/aboutEditable";
import Placeholder from "./Placeholder";
import RepresentativeChatWidget from "../components/RepresentativeChatWidget";
import AgentShowcase from "../components/AgentShowcase";
import AiNav from "../components/AiNav";
import "./About.css";

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

const TOGETHER_ROWS = 7;

type SizedPartner = Partner & { weight: number };

/** Fresh shuffle + random word size (few large, many small) on each page load. */
function randomized(list: Partner[]): SizedPartner[] {
  const out = list.map((p) => {
    const r = Math.random() * 100;
    const weight = r < 3 ? 6 : r < 10 ? 5 : r < 22 ? 4 : r < 42 ? 3 : r < 70 ? 2 : 1;
    return { ...p, weight };
  });
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function PartnerWord({ p, hidden }: { p: SizedPartner; hidden?: boolean }) {
  const label = p.region ? `${p.name} · ${p.region} · ${p.cohort}` : `${p.name} · ${p.cohort}`;
  const common = { className: `ab-together__w t${p.weight}${p.url ? "" : " is-nolink"}`, title: label, "aria-hidden": hidden || undefined };
  return p.url ? (
    <a {...common} href={p.url} target="_blank" rel="noopener noreferrer" tabIndex={hidden ? -1 : undefined}>
      {p.name}
    </a>
  ) : (
    <span {...common}>{p.name}</span>
  );
}

/** Every partner, in rows that drift sideways on a loop (alternating directions); hover pauses a row. */
function TogetherWall({ eyebrow, title, lead, partners }: { eyebrow: string; title: string; lead: string; partners: Partner[] }) {
  // Order and size are re-drawn on every visit, so no company is permanently bigger or first.
  const rows = useMemo(() => {
    const list = randomized(partners.filter((p) => p.name.trim()));
    const out: SizedPartner[][] = Array.from({ length: TOGETHER_ROWS }, () => []);
    list.forEach((p, i) => out[i % TOGETHER_ROWS].push(p));
    return out;
  }, [partners]);
  return (
    <section className="ab-together" aria-labelledby="ab-together-title">
      <div className="ab-wrap">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="ab-title" id="ab-together-title">{title}</h2>
        <p className="ab-together__lead">
          {lead} <span>{partners.length}개 업체</span>
        </p>
      </div>
      <div className="ab-together__rows">
        {rows.map((row, r) => (
          <div className="ab-together__row" key={r}>
            <div
              className={`ab-together__track${r % 2 ? " is-reverse" : ""}`}
              style={{ animationDuration: `${row.length * 3.2 + r * 7}s` }}
            >
              {row.map((p) => <PartnerWord key={p.name} p={p} />)}
              {row.map((p) => <PartnerWord key={`dup-${p.name}`} p={p} hidden />)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Eyebrow({ children }: { children: string }) {
  return <p className="ab-eyebrow">{children}</p>;
}

export default function About() {
  const { loading, isAdmin } = useAuth();
  const latestCase = useMemo(() => [...cases].sort((a, b) => b.date.localeCompare(a.date))[0], []);
  // Copy and the partner list are edited in /admin/pages (Firestore siteContent); src/data holds the defaults.
  const { value: savedCopy } = useSiteContent<Partial<AboutEditable> | null>("about", null);
  const { value: partnerList } = useSiteContent<Partner[]>("partners", defaultPartners);
  const content = useMemo(() => ({ ...about, ...mergeContent(aboutEditableDefaults, savedCopy) }), [savedCopy]);

  if (loading) return null;
  // Draft page: admins only for now.
  if (!isAdmin) return <Placeholder title="AI" />;

  const { hero, mission, problems, people, together, cloud, cta } = content;
  return (
    <main className="ab" id="top">
      <AiNav />

      {/* ── 1. Hero ── */}
      <section className="ab-hero">
        <div className="ab-hero__orb" aria-hidden="true" />
        <div className="ab-wrap ab-hero__grid">
          <div className="ab-hero__copy">
            <Eyebrow>{hero.eyebrow}</Eyebrow>
            <h1 className="ab-display">
              {hero.title}
              <br />
              <span className="ab-accent">{hero.titleAccent}</span>
            </h1>
            <p className="ab-hero__lead">{hero.lead}</p>
            <div className="ab-actions">
              {hero.primary && (
                <Link className="ab-btn ab-btn--dark" to={hero.primary.to}>
                  {hero.primary.label} <Arrow />
                </Link>
              )}
            </div>
          </div>

          <div className="ab-hero__cards" aria-label="지금 INDEX에서">
            <Link className="ab-float ab-float--case" to={`/cases/${latestCase.id}`}>
              <span className="ab-float__kicker">최근 등록 사례 · {latestCase.category}</span>
              <strong>{latestCase.title}</strong>
              <span className="ab-float__meta">{latestCase.date}</span>
            </Link>
            <div className="ab-float ab-float--stat">
              <strong>{cases.length}</strong>
              <span>
                건의 현장 사례
                <br />
                Case Library
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. Mission ── */}
      <section className="ab-section ab-mission" id="mission">
        <div className="ab-wrap">
          <Eyebrow>{mission.eyebrow}</Eyebrow>
          <p className="ab-mission__statement">
            {mission.statement}
            <br />
            <span className="ab-accent">{mission.statementAccent}</span>
          </p>
          <div className="ab-pillars">
            {mission.pillars.map((p) => (
              <div className="ab-pillar" key={p.no}>
                <span className="ab-pillar__no">{p.no}</span>
                <h3>
                  {p.title} <small>{p.en}</small>
                </h3>
                <p>{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. Problems ── */}
      <section className="ab-section" id="problems">
        <div className="ab-wrap">
          <div className="ab-head">
            <div>
              <Eyebrow>{problems.eyebrow}</Eyebrow>
              <h2 className="ab-title">
                {problems.title} <span className="ab-accent">{problems.titleAccent}</span> {problems.titleTail}
              </h2>
              <p className="ab-lead">{problems.lead}</p>
            </div>
            <Link className="ab-textlink" to="/cases">
              사례로 확인하기 <Arrow />
            </Link>
          </div>
          <div className="ab-problems">
            {problems.items.map((item, i) => (
              <Link className="ab-problem" to="/cases" key={item.title}>
                <div className="ab-card-image">
                  <img src={`${item.image}-960-v1.jpg`} srcSet={`${item.image}-480-v1.jpg 480w, ${item.image}-960-v1.jpg 960w`} sizes="(max-width: 640px) 100vw, (max-width: 980px) 50vw, 33vw" width={960} height={640} alt={item.imageAlt} loading="lazy" decoding="async" />
                  <span className="ab-card-image__label">AI 대표 이미지</span>
                </div>
                <div className="ab-problem__body">
                  <div className="ab-problem__top">
                    <span className="ab-problem__no">{String(i + 1).padStart(2, "0")}</span>
                    <span className="ab-chip">{item.tag}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                  <span className="ab-problem__go">
                    사례 라이브러리 <Arrow />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <AgentShowcase copy={content.agents} />

      {/* ── 6. People ── */}
      <section className="ab-section ab-section--tint" id="people">
        <div className="ab-wrap">
          <div className="ab-head">
            <div>
              <Eyebrow>{people.eyebrow}</Eyebrow>
              <h2 className="ab-title">{people.title}</h2>
              <p className="ab-lead">{people.lead}</p>
            </div>
            <Link className="ab-textlink" to="/about/organization">
              {people.more} <Arrow />
            </Link>
          </div>
          <div className="ab-people">
            {kiaaMembers.map((m, i) => (
              <Link className="ab-person" to="/about/organization" key={m.id}>
                <span className="ab-person__word" aria-hidden="true">
                  {people.keywords[i] ?? ""}
                </span>
                <img src={m.image} alt="" loading="lazy" />
                <div>
                  <strong>{m.name}</strong>
                  <span>{m.role}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6b. INDEX와 함께하는 사람들 — dark word wall of partner companies ── */}
      <TogetherWall eyebrow={together.eyebrow} title={together.title} lead={together.lead} partners={partnerList} />

      {/* ── 7. Keyword cloud ── */}
      <section className="ab-section ab-cloud-section">
        <div className="ab-wrap">
          <Eyebrow>{cloud.eyebrow}</Eyebrow>
          <h2 className="ab-title">
            {cloud.title} <span className="ab-accent">{cloud.titleAccent}</span>
          </h2>
          <p className="ab-lead">{cloud.lead}</p>
          <div className="ab-cloud" aria-label="주거 실내건축의 교류와 탐구 주제">
            {cloud.words.map(([word, weight], i) => (
              <span key={word} className={`ab-cloud__w w${weight}${i % 3 === 1 ? " is-accent" : ""}`}>
                {word}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── 8. CTA ── */}
      <section className="ab-section ab-cta">
        <div className="ab-wrap">
          <Eyebrow>{cta.eyebrow}</Eyebrow>
          <h2 className="ab-display ab-display--center">
            {cta.title}
            <br />
            <span className="ab-accent">{cta.titleAccent}</span>
          </h2>
          <p className="ab-cta__body">{cta.body}</p>
        </div>
      </section>

      <footer className="ai-foot">
        <div className="ab-wrap ai-foot__inner">
          <div>
            <p className="ai-foot__brand">
              index<span>AI</span>
            </p>
            <p>주거인테리어 협회 · INDEX</p>
          </div>
          <nav aria-label="바로가기">
            <Link to="/">index 홈</Link>
            <Link to="/cases">Case Library</Link>
            <Link to="/mypage">My Page</Link>
          </nav>
        </div>
        <div className="ab-wrap ai-foot__bottom">© 2025 주거인테리어 협회. All rights reserved.</div>
      </footer>
      <RepresentativeChatWidget/>
    </main>
  );
}
