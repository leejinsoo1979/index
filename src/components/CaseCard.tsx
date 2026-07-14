import { Link } from "react-router-dom";
import type { CaseItem } from "../data/cases";
import { ArrowRightIcon, ChevronRightIcon, BookmarkIcon } from "./icons";
import "./CaseCard.css";

export function CaseCard({ item }: { item: CaseItem }) {
  return (
    <article className="case-card">
      <Link to={`/cases/${item.id}`} className="case-card__link">
        <img className="case-card__bg" src={item.image} alt="" loading="lazy" />
        <span className="case-card__badge">
          {item.isNew && <i aria-hidden="true">✦</i>}
          {item.category}
        </span>
        <div className="case-card__overlay">
          <h3 className="case-card__title">{item.title}</h3>
          <span className="case-card__arrow" aria-hidden="true">
            <ArrowRightIcon />
          </span>
        </div>
      </Link>
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
