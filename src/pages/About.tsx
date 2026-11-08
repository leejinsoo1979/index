import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { about } from "../data/about";
import { cases } from "../data/cases";
import { kiaaMembers } from "../data/team";
import { isAdminEmail } from "../lib/adminStore";
import { effectiveStatus, formatSeminarDate, useSeminars, type Seminar } from "../lib/seminars";
import Placeholder from "./Placeholder";
import RepresentativeChatWidget from "../components/RepresentativeChatWidget";
import AgentShowcase from "../components/AgentShowcase";
import "./About.css";

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

/** Section anchors in the page's own navigation (cdsa.kr-style). */
const NAV_SECTIONS = [
  { id: "mission", label: "미션" },
  { id: "problems", label: "우리가 푸는 문제" },
  { id: "curriculum", label: "커리큘럼" },
  { id: "showcase", label: "에이전트" },
  { id: "people", label: "전문가" },
] as const;
const NAV_PAGES = [
  { to: "/cases", label: "사례" },
  { to: "/seminars", label: "세미나" },
] as const;

function AiNav({ notice }: { notice: { text: string; to: string } }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    NAV_SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => {
      window.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  return (
    <div className={`ai-top${scrolled ? " is-scrolled" : ""}${open ? " is-open" : ""}`}>
      <Link className="ai-notice" to={notice.to}>
        <span className="ai-notice__dot" aria-hidden="true" />
        <span className="ai-notice__text">{notice.text}</span>
        <span className="ai-notice__go">
          확인 <Arrow />
        </span>
      </Link>
      <header className="ai-nav">
        <div className="ai-nav__inner">
          <a className="ai-nav__brand" href="#top" onClick={() => setOpen(false)}>
            index<span>AI</span>
          </a>
          <nav className="ai-nav__links" aria-label="AI 페이지 메뉴">
            {NAV_SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className={active === s.id ? "is-active" : ""} onClick={() => setOpen(false)}>
                {s.label}
              </a>
            ))}
            {NAV_PAGES.map((p) => (
              <Link key={p.to} to={p.to}>
                {p.label}
              </Link>
            ))}
          </nav>
          <div className="ai-nav__actions">
            <Link className="ai-nav__association" to="/" onClick={() => setOpen(false)}>
              협회 사이트 <Arrow />
            </Link>
            <Link className="ai-nav__cta" to="/seminars">
              교육 신청
            </Link>
            <button
              type="button"
              className="ai-nav__toggle"
              aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>
    </div>
  );
}

function Eyebrow({ children }: { children: string }) {
  return <p className="ab-eyebrow">{children}</p>;
}

export default function About() {
  const { user, loading } = useAuth();
  const { data: seminars } = useSeminars();

  const upcoming = useMemo(() => seminars.filter((s) => effectiveStatus(s) !== "완료"), [seminars]);
  const nextSeminar = upcoming[0] ?? null;
  const latestCase = useMemo(() => [...cases].sort((a, b) => b.date.localeCompare(a.date))[0], []);

  // Seminar matrix: rows = level, columns = topic; each seminar lands in its first matching topic.
  const matrix = useMemo(() => {
    const topics = about.curriculum.topics;
    const pick = (s: Seminar) => topics.find((t) => t.match.test(s.title))?.key ?? "기타";
    const cell = (level: string, key: string) =>
      seminars.filter((s) => s.level === level && pick(s) === key).sort((a, b) => b.date.localeCompare(a.date));
    return (["기초", "심화"] as const).map((level) => ({ level, cells: topics.map((t) => cell(level, t.key)) }));
  }, [seminars]);

  if (loading) return null;
  // Draft page: admins only for now.
  if (!isAdminEmail(user?.email)) return <Placeholder title="AI" />;

  const { hero, mission, problems, curriculum, people, cloud, cta } = about;
  const notice = nextSeminar
    ? { text: `다가오는 세미나 · ${formatSeminarDate(nextSeminar.date)} ${nextSeminar.title}`, to: `/seminars/${nextSeminar.id}` }
    : { text: "INDEX 실무 세미나 · 일정과 신청은 세미나 페이지에서 확인하세요", to: "/seminars" };

  return (
    <main className="ab" id="top">
      <AiNav notice={notice} />

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
              <Link className="ab-btn ab-btn--dark" to={hero.primary.to}>
                {hero.primary.label} <Arrow />
              </Link>
              {hero.secondary.to.startsWith("#") ? (
                <a className="ab-btn ab-btn--line" href={hero.secondary.to}>
                  {hero.secondary.label}
                </a>
              ) : (
                <Link className="ab-btn ab-btn--line" to={hero.secondary.to}>
                  {hero.secondary.label}
                </Link>
              )}
            </div>
          </div>

          <div className="ab-hero__cards" aria-label="지금 INDEX에서">
            <Link className="ab-float ab-float--seminar" to={nextSeminar ? `/seminars/${nextSeminar.id}` : "/seminars"}>
              <span className="ab-float__kicker">다가오는 세미나</span>
              <strong>{nextSeminar ? nextSeminar.title : "새 세미나를 준비하고 있습니다"}</strong>
              <span className="ab-float__meta">
                {nextSeminar ? `${formatSeminarDate(nextSeminar.date)} · ${nextSeminar.location}` : "세미나 일정 보기"}
              </span>
            </Link>
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

      {/* ── 4. Curriculum (live seminars) ── */}
      <section className="ab-section ab-section--tint" id="curriculum">
        <div className="ab-wrap">
          <Eyebrow>{curriculum.eyebrow}</Eyebrow>
          <h2 className="ab-title">
            {curriculum.title}
            <br />
            <span className="ab-accent">{curriculum.titleAccent}</span>
          </h2>
          <p className="ab-lead">{curriculum.lead}</p>

          <div className="ab-matrix" role="table" aria-label="세미나 과정표">
            <div className="ab-matrix__row ab-matrix__row--head" role="row">
              <div role="columnheader">단계 \ 분야</div>
              {curriculum.topics.map((t) => (
                <div role="columnheader" key={t.key}>
                  {t.label}
                </div>
              ))}
            </div>
            {matrix.map((row) => (
              <div className="ab-matrix__row" role="row" key={row.level}>
                <div role="rowheader" className="ab-matrix__level">
                  <strong>{row.level}</strong>
                  <span>{row.level === "기초" ? "분야별 개념과 실무의 기초" : "프로젝트와 과제 중심의 탐구"}</span>
                </div>
                {row.cells.map((list, i) => (
                  <div role="cell" key={curriculum.topics[i]!.key} className="ab-matrix__cell">
                    {list.length === 0 ? (
                      <span className="ab-matrix__empty">개설 예정</span>
                    ) : (
                      list.slice(0, 2).map((s) => (
                        <Link key={s.id} to={`/seminars/${s.id}`} className={effectiveStatus(s) === "완료" ? "is-done" : ""}>
                          <b>{s.title}</b>
                          <small>
                            {formatSeminarDate(s.date)} · {effectiveStatus(s)}
                          </small>
                        </Link>
                      ))
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="ab-tracks">
            {curriculum.cards.map((c) => (
              <Link className={`ab-track${c.dark ? " ab-track--dark" : ""}`} to="/seminars" key={c.kicker}>
                <span className="ab-track__kicker">{c.kicker}</span>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
                <span className="ab-track__go">
                  {c.link} <Arrow />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <AgentShowcase />

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
          <div className="ab-actions ab-actions--center">
            <Link className="ab-btn ab-btn--dark" to={cta.primary.to}>
              {cta.primary.label} <Arrow />
            </Link>
            <Link className="ab-btn ab-btn--line" to={cta.secondary.to}>
              {cta.secondary.label}
            </Link>
          </div>
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
            <Link to="/seminars">Seminars</Link>
            <Link to="/mypage">My Page</Link>
          </nav>
        </div>
        <div className="ab-wrap ai-foot__bottom">© 2025 주거인테리어 협회. All rights reserved.</div>
      </footer>
      <RepresentativeChatWidget/>
    </main>
  );
}
