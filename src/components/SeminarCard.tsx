import { Link } from "react-router-dom";
import type { Seminar, PastSeminar } from "../data/seminars";
import { ArrowRightIcon, ChevronRightIcon } from "./icons";
import "./SeminarCard.css";

function Badges({ seminar }: { seminar: Seminar }) {
  return (
    <div className="seminar__badges">
      <span className="badge badge--level">{seminar.level}</span>
      <span
        className={
          "badge " +
          (seminar.status === "접수중" ? "badge--open" : "badge--upcoming")
        }
      >
        {seminar.status}
      </span>
    </div>
  );
}

/** Large featured seminar — image on the right, info on the left. */
export function FeaturedSeminar({ seminar }: { seminar: Seminar }) {
  return (
    <article className="seminar-feature">
      <div className="seminar-feature__info">
        <Badges seminar={seminar} />
        <h3 className="seminar-feature__title">{seminar.title}</h3>
        <dl className="seminar-feature__meta">
          <div>
            <dt>날짜</dt>
            <dd>{seminar.date}</dd>
          </div>
          <div>
            <dt>장소</dt>
            <dd>{seminar.location}</dd>
          </div>
          <div>
            <dt>참가 현황</dt>
            <dd>
              {seminar.enrolled}/{seminar.capacity}
            </dd>
          </div>
        </dl>
        <div className="seminar-feature__actions">
          <Link to={`/seminars/${seminar.id}/apply`} className="btn btn--primary">
            신청하기 <ArrowRightIcon />
          </Link>
          <Link to={`/seminars/${seminar.id}`} className="btn btn--ghost">
            자세히 보기
          </Link>
        </div>
      </div>
      <div className="seminar-feature__media">
        <img src={seminar.image} alt="" loading="lazy" />
      </div>
    </article>
  );
}

/** Grid card for upcoming seminars. */
export function SeminarCard({ seminar }: { seminar: Seminar }) {
  return (
    <article className="seminar-card">
      <div className="seminar-card__media">
        <img src={seminar.image} alt="" loading="lazy" />
      </div>
      <div className="seminar-card__body">
        <Badges seminar={seminar} />
        <h3 className="seminar-card__title">{seminar.title}</h3>
        <div className="seminar-card__meta">
          <span>{seminar.date}</span>
          <span>{seminar.location}</span>
          <span>
            참가 · {seminar.enrolled}/{seminar.capacity}
          </span>
        </div>
        <div className="seminar-card__actions">
          <Link
            to={`/seminars/${seminar.id}/apply`}
            className="btn btn--primary btn--sm"
          >
            신청하기
          </Link>
          <Link to={`/seminars/${seminar.id}`} className="btn btn--ghost btn--sm">
            자세히 보기
          </Link>
        </div>
      </div>
    </article>
  );
}

/** Compact row for past seminars. */
export function PastSeminarRow({ seminar }: { seminar: PastSeminar }) {
  return (
    <article className="seminar-row">
      <div className="seminar-row__thumb">
        <img src={seminar.image} alt="" loading="lazy" />
      </div>
      <div className="seminar-row__body">
        <div className="seminar-row__meta">
          <span className="badge badge--level">{seminar.level}</span>
          <time>{seminar.date}</time>
          <span className="seminar-row__loc">· {seminar.location}</span>
        </div>
        <h3 className="seminar-row__title">{seminar.title}</h3>
      </div>
      <button type="button" className="seminar-row__more">
        자세히 보기 <ChevronRightIcon />
      </button>
    </article>
  );
}
