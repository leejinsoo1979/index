import { Link } from "react-router-dom";
import type { CaseItem } from "../data/cases";
import { ChevronRightIcon, BookmarkIcon } from "./icons";
import "./CaseCard.css";

/** Three small overlapping author avatars (decorative). */
function Avatars() {
  const colors = ["#cbd5f5", "#bfd3c1", "#e3c9b8"];
  return (
    <div className="case-card__avatars" aria-hidden="true">
      {colors.map((c, i) => (
        <span key={i} style={{ background: c }} />
      ))}
    </div>
  );
}

export function CaseCard({ item }: { item: CaseItem }) {
  return (
    <article className="case-card">
      <Link
        to={`/cases/${item.id}`}
        className="case-card__media"
        aria-label={item.title}
      >
        <img src={item.image} alt="" loading="lazy" />
        {item.isNew && <span className="case-card__new">NEW</span>}
      </Link>
      <div className="case-card__body">
        <div className="case-card__meta">
          <span className="case-card__cat">{item.category}</span>
          <time className="case-card__date">{item.date}</time>
        </div>
        <h3 className="case-card__title">
          <Link to={`/cases/${item.id}`}>{item.title}</Link>
        </h3>
        <p className="case-card__excerpt">{item.excerpt}</p>
        <div className="case-card__foot">
          <Avatars />
          <Link to={`/cases/${item.id}`} className="case-card__more">
            자세히 보기 <ChevronRightIcon />
          </Link>
        </div>
      </div>
    </article>
  );
}

/** Horizontal list-row variant used in the "더 많은 사례" section. */
export function CaseRow({ item }: { item: CaseItem }) {
  return (
    <article className="case-row">
      <Link to={`/cases/${item.id}`} className="case-row__thumb" aria-label={item.title}>
        <img src={item.image} alt="" loading="lazy" />
      </Link>
      <div className="case-row__body">
        <div className="case-row__meta">
          <span className="case-row__cat">{item.category}</span>
          <time className="case-row__date">{item.date}</time>
        </div>
        <h3 className="case-row__title">
          <Link to={`/cases/${item.id}`}>{item.title}</Link>
        </h3>
        <p className="case-row__excerpt">{item.excerpt}</p>
      </div>
      <div className="case-row__actions">
        <button type="button" aria-label="저장">
          <BookmarkIcon />
        </button>
        <Link to={`/cases/${item.id}`} aria-label="자세히 보기">
          <ChevronRightIcon />
        </Link>
      </div>
    </article>
  );
}
