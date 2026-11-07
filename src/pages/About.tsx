import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { about, type Maybe } from "../data/about";
import { isAdminEmail } from "../lib/adminStore";
import Placeholder from "./Placeholder";
import "./About.css";

const SECTIONS = [
  { id: "numbers", no: "01", kicker: "숫자로", title: "핵심 수치" },
  { id: "services", no: "02", kicker: "무엇을", title: "서비스 영역" },
  { id: "partners", no: "03", kicker: "함께한", title: "협력 기관" },
  { id: "philosophy", no: "04", kicker: "왜", title: "운영 철학" },
  { id: "people", no: "05", kicker: "사람", title: about.person.section },
  { id: "contact", no: "06", kicker: "찾아오는", title: "연락처" },
] as const;

/** Editorial serif for headings (loaded only when this page is opened). */
function useSerifFont() {
  useEffect(() => {
    const id = "about-serif-font";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600&display=swap";
    document.head.appendChild(link);
  }, []);
}

/** Marks content that hasn't been provided yet (see src/data/about.ts). */
function Todo({ hint }: { hint: string }) {
  return <span className="about-todo">입력 필요 · {hint}</span>;
}

function Value({ value, hint, children }: { value: Maybe<string>; hint: string; children?: ReactNode }) {
  if (value === null) return <Todo hint={hint} />;
  return <>{children ?? value}</>;
}

function SectionHead({ no, kicker, title }: { no: string; kicker: string; title: string }) {
  return (
    <header className="about-section__head">
      <p className="about-section__kicker">
        {no} / {kicker}
      </p>
      <h2>{title}</h2>
    </header>
  );
}

export default function About() {
  const { user, loading } = useAuth();
  useSerifFont();
  const [active, setActive] = useState<string>(SECTIONS[0].id);

  // Highlight the section currently in view in the "on this page" index.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [user]);

  if (loading) return null;
  // Draft page: admins only for now (the footer's "협회 소개" also links here).
  if (!isAdminEmail(user?.email)) return <Placeholder title="협회 소개" />;

  const { stats, services, partners, philosophy, person, contact, footer } = about;
  const firstChar = about.intro.slice(0, 1);

  return (
    <main className="about">
      <div className="about__layout">
        <article className="about__main">
          <nav className="about__breadcrumb" aria-label="현재 위치">
            <Link to="/">← INDEX 홈</Link>
            <span aria-hidden="true">/</span>
            <span>About</span>
          </nav>

          <p className="about__eyebrow">{about.eyebrow}</p>
          <h1 className="about__title">
            {about.title}
            <em>{about.titleAccent}</em>
          </h1>
          <p className="about__tagline">{about.tagline}</p>

          <p className="about__intro">
            <span className="about__dropcap" aria-hidden="true">
              {firstChar}
            </span>
            <span className="sr-only">{firstChar}</span>
            {about.intro.slice(1)}
          </p>

          <section className="about-section" id="numbers">
            <SectionHead {...SECTIONS[0]} />
            <div className="about-stats">
              {stats.items.map((s) => (
                <div className="about-stat" key={s.label}>
                  <strong className="about-stat__value">
                    <Value value={s.value} hint="수치" />
                  </strong>
                  <p className="about-stat__label">{s.label}</p>
                  <p className="about-stat__note">{s.note}</p>
                </div>
              ))}
            </div>
            <div className="about-callout">
              <p className="about-callout__label">{stats.highlight.label}</p>
              <p>
                <Value value={stats.highlight.text} hint="회원·자문 구성 한 줄 소개" />
              </p>
            </div>
          </section>

          <section className="about-section" id="services">
            <SectionHead {...SECTIONS[1]} />
            <p className="about-section__lead">{services.lead}</p>
            <div className="about-services">
              {services.items.map((s) => {
                const body = (
                  <>
                    <span className="about-service__letter">{s.letter}</span>
                    <div>
                      <p className="about-service__kicker">{s.kicker}</p>
                      <h3>{s.title}</h3>
                      <p>{s.body}</p>
                    </div>
                  </>
                );
                return s.to ? (
                  <Link className="about-service" to={s.to} key={s.letter}>
                    {body}
                  </Link>
                ) : (
                  <div className="about-service" key={s.letter}>
                    {body}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="about-section" id="partners">
            <SectionHead {...SECTIONS[2]} />
            <p className="about-section__lead">
              <Value value={partners.lead} hint="협력 기관 소개 한 줄" />
            </p>
            {partners.groups.map((g) => (
              <div className="about-partners" key={g.label}>
                <p className="about-partners__label">{g.label}</p>
                <p className="about-partners__items">
                  {g.items.length ? g.items.join(" · ") : <Todo hint={`${g.label} 목록`} />}
                </p>
              </div>
            ))}
          </section>

          <section className="about-section" id="philosophy">
            <SectionHead {...SECTIONS[3]} />
            <blockquote className="about-quote">
              <p>{philosophy.quote}</p>
              <cite>— {philosophy.by}</cite>
            </blockquote>
            {philosophy.paragraphs.map((p) => (
              <p className="about-prose" key={p.slice(0, 16)}>
                {p}
              </p>
            ))}
            <p className="about-pull">{philosophy.pullQuote}</p>
            <p className="about-prose">{philosophy.closing}</p>
          </section>

          <section className="about-section" id="people">
            <SectionHead {...SECTIONS[4]} />
            <div className="about-person">
              <p className="about-person__name">
                <Value value={person.name} hint="이름" />
              </p>
              <p className="about-person__role">{person.role}</p>
              <ul>
                {person.credentials.length ? (
                  person.credentials.map((c) => <li key={c}>{c}</li>)
                ) : (
                  <li>
                    <Todo hint="주요 약력" />
                  </li>
                )}
              </ul>
            </div>
            <Link className="about-more" to={person.moreLink.to}>
              {person.moreLink.label} →
            </Link>
          </section>

          <section className="about-section" id="contact">
            <SectionHead {...SECTIONS[5]} />
            <dl className="about-contact">
              {contact.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>
                    <Value value={row.value} hint={row.label}>
                      {row.href ? (
                        <a href={row.href} target="_blank" rel="noreferrer">
                          {row.value}
                        </a>
                      ) : (
                        row.value
                      )}
                    </Value>
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <footer className="about__foot">
            <strong>{footer.org}</strong>
            <span>{footer.copyright}</span>
          </footer>
          <nav className="about__pager" aria-label="다른 페이지">
            <Link to="/">← INDEX 홈으로</Link>
            <Link to="/cases">Case Library →</Link>
          </nav>
        </article>

        <aside className="about__toc" aria-label="이 페이지의 목차">
          <p>ON THIS PAGE</p>
          <ol>
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className={active === s.id ? "is-active" : ""}>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </main>
  );
}
