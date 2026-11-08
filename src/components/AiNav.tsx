/**
 * Top navigation of the INDEX AI pages (/ai and the experts directory) — one header for both.
 * Section links scroll within /ai; from other pages they open /ai at that section.
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import "../pages/About.css";

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
  { id: "showcase", label: "에이전트" },
] as const;

export default function AiNav() {
  const { pathname } = useLocation();
  const onAi = pathname === "/ai";
  const sectionHref = (id: string) => (onAi ? `#${id}` : `/ai#${id}`);
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
      <header className="ai-nav">
        <div className="ai-nav__inner">
          <a className="ai-nav__brand" href={onAi ? "#top" : "/ai"} onClick={() => setOpen(false)}>
            index<span>AI</span>
          </a>
          <nav className="ai-nav__links" aria-label="AI 페이지 메뉴">
            {NAV_SECTIONS.map((s) => (
              <a key={s.id} href={sectionHref(s.id)} className={onAi && active === s.id ? "is-active" : ""} onClick={() => setOpen(false)}>
                {s.label}
              </a>
            ))}
            <Link to="/experts" className={pathname.startsWith("/experts") ? "is-active" : ""} onClick={() => setOpen(false)}>
              전문가
            </Link>
          </nav>
          <div className="ai-nav__actions">
            <Link className="ai-nav__association" to="/" onClick={() => setOpen(false)}>
              협회 사이트 <Arrow />
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
