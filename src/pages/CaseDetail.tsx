import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { cases, caseArticle } from "../data/cases";
import { CaseCard } from "../components/CaseCard";
import {
  ShareIcon,
  DownloadIcon,
  BookmarkIcon,
  ChevronRightIcon,
} from "../components/icons";
import Placeholder from "./Placeholder";
import "./CaseDetail.css";

export default function CaseDetail() {
  const { id } = useParams();
  const item = useMemo(
    () => cases.find((c) => String(c.id) === id),
    [id]
  );

  const [progress, setProgress] = useState(0);
  const articleRef = useRef<HTMLElement>(null);

  // Reading-progress bar for the sticky TOC.
  useEffect(() => {
    function onScroll() {
      const el = articleRef.current;
      if (!el) return;
      const start = el.offsetTop;
      const total = el.offsetHeight - window.innerHeight;
      const scrolled = window.scrollY - start;
      const pct = Math.min(100, Math.max(0, (scrolled / total) * 100));
      setProgress(pct);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!item) return <Placeholder title="게시글을 찾을 수 없습니다" />;

  const related = cases.filter((c) => c.id !== item.id).slice(0, 3);
  const nextPost = cases[(cases.indexOf(item) + 1) % cases.length];

  function scrollToSection(sectionId: string) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="detail">
      {/* Title block */}
      <header className="detail__head">
        <div className="detail__col">
          <span className="detail__cat">{item.category}</span>
          <h1 className="detail__title">{item.title}</h1>
          <div className="detail__meta">
            <time>{item.date}</time>
            <span className="detail__dot">·</span>
            <span>조회 {item.views ?? 0}</span>
          </div>
        </div>
      </header>

      {/* Hero image */}
      <div className="detail__col">
        <div className="detail__hero">
          <img src={item.image} alt="" />
        </div>
      </div>

      {/* Sticky table of contents */}
      <nav className="detail-toc" aria-label="목차">
        <div className="detail__col detail-toc__inner">
          <span className="detail-toc__label">목차</span>
          <ul className="detail-toc__list">
            {caseArticle.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => scrollToSection(s.id)}>
                  {s.heading}
                </button>
              </li>
            ))}
          </ul>
          <div className="detail-toc__progress">
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
      </nav>

      {/* Article body */}
      <article className="detail__col detail__article" ref={articleRef}>
        {caseArticle.map((section) => (
          <section key={section.id} id={section.id} className="detail__section">
            <h2 className="detail__section-title">{section.heading}</h2>
            {section.blocks.map((block, i) => {
              if (block.type === "paragraph")
                return <p key={i} className="detail__para">{block.text}</p>;
              if (block.type === "callout")
                return (
                  <div key={i} className="detail__callout">{block.text}</div>
                );
              return (
                <div key={i} className="detail__table-wrap">
                  <table className="detail__table">
                    <thead>
                      <tr>
                        {block.headers.map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {block.rows.map((row, r) => (
                        <tr key={r}>
                          {row.map((cell, c) => (
                            <td key={c}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </section>
        ))}

        {/* Action bar */}
        <div className="detail__actions">
          <button type="button" className="detail__icon-btn" aria-label="공유">
            <ShareIcon />
          </button>
          <button type="button" className="detail__pdf">
            <DownloadIcon /> PDF 다운로드
          </button>
          <button type="button" className="detail__icon-btn" aria-label="저장">
            <BookmarkIcon />
          </button>
        </div>

        {/* Next post */}
        <Link to={`/cases/${nextPost.id}`} className="detail__next">
          다음 게시물 <ChevronRightIcon />
        </Link>
      </article>

      {/* Related cases */}
      <section className="detail__col detail__related">
        <h2 className="detail__related-title">관련 하자 사례</h2>
        <div className="detail__related-grid">
          {related.map((c) => (
            <Link key={c.id} to={`/cases/${c.id}`} className="detail__related-link">
              <CaseCard item={c} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
