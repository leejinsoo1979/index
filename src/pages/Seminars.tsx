import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { pastSeminars } from "../data/seminars";
import { mergedUpcomingSeminars } from "../lib/adminStore";
import "./Seminars.css";

type ViewMode = "list" | "calendar";
type StatusFilter = "전체" | "접수중" | "예정" | "완료";

const statusFilters: StatusFilter[] = ["전체", "접수중", "예정", "완료"];
const topics = [
  "방수/누수",
  "타일/마감",
  "단열/결로",
  "설계/감리",
  "구조/안전",
  "시공/품질",
];

const seminars = [
  ...mergedUpcomingSeminars().map((seminar) => ({ ...seminar, isPast: false })),
  ...pastSeminars.map((seminar) => ({
    ...seminar,
    status: "완료" as const,
    capacity: 0,
    enrolled: 0,
    isPast: true,
  })),
];

function topicFor(title: string) {
  if (/방수|누수/.test(title)) return "방수/누수";
  if (/타일|마감/.test(title)) return "타일/마감";
  if (/단열|결로/.test(title)) return "단열/결로";
  if (/설계|감리/.test(title)) return "설계/감리";
  if (/구조|균열|안전/.test(title)) return "구조/안전";
  return "시공/품질";
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function seminarDateKey(date: string) {
  return date.match(/\d{4}\.\d{2}\.\d{2}/)?.[0]?.replace(/\./g, "-") ?? "";
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function GalleryIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2.75" y="2.75" width="5.75" height="5.75" rx=".6" />
      <rect x="11.5" y="2.75" width="5.75" height="5.75" rx=".6" />
      <rect x="2.75" y="11.5" width="5.75" height="5.75" rx=".6" />
      <rect x="11.5" y="11.5" width="5.75" height="5.75" rx=".6" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2.5" y="4" width="15" height="13" rx="1" />
      <path d="M6 2.5v3M14 2.5v3M2.5 8h15" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 2.5v10M6.5 9 10 12.5 13.5 9M4 15v2h12v-2" />
    </svg>
  );
}

export default function Seminars() {
  const [view, setView] = useState<ViewMode>("list");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("전체");
  const [level, setLevel] = useState<"전체" | "기초" | "심화">("전체");
  const [startDate, setStartDate] = useState("2026-01-01");
  const [endDate, setEndDate] = useState("2026-12-31");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(2026, 7, 1));

  const filteredSeminars = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return seminars.filter((seminar) => {
      const searchable = `${seminar.title} ${seminar.location} ${seminar.level} ${seminar.status}`.toLowerCase();
      const date = seminarDateKey(seminar.date);
      return (
        (!keyword || searchable.includes(keyword)) &&
        (status === "전체" || seminar.status === status) &&
        (level === "전체" || seminar.level === level) &&
        (selectedTopics.length === 0 || selectedTopics.includes(topicFor(seminar.title))) &&
        (!startDate || !date || date >= startDate) &&
        (!endDate || !date || date <= endDate)
      );
    });
  }, [query, status, level, startDate, endDate, selectedTopics]);

  const pageSize = 9;
  const totalPages = Math.max(1, Math.ceil(filteredSeminars.length / pageSize));
  const visibleSeminars = filteredSeminars.slice((page - 1) * pageSize, page * pageSize);

  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(year, month, index - firstWeekday + 1);
      const key = dateKey(date);
      return {
        date,
        key,
        relation: date.getMonth() < month || date.getFullYear() < year
          ? "past"
          : date.getMonth() > month || date.getFullYear() > year
            ? "future"
            : "current",
        events: filteredSeminars.filter((seminar) => seminarDateKey(seminar.date) === key),
      };
    });
  }, [calendarMonth, filteredSeminars]);

  const moveCalendar = (offset: number) => {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  useEffect(() => setPage(1), [query, status, level, startDate, endDate, selectedTopics]);

  const resetFilters = () => {
    setQuery("");
    setStatus("전체");
    setLevel("전체");
    setStartDate("2026-01-01");
    setEndDate("2026-12-31");
    setSelectedTopics([]);
  };

  const toggleTopic = (topic: string) => {
    setSelectedTopics((current) =>
      current.includes(topic)
        ? current.filter((item) => item !== topic)
        : [...current, topic],
    );
  };

  return (
    <main className="seminar-schedule">
      <div className="seminar-schedule__shell">
        <nav className="seminar-schedule__breadcrumb" aria-label="현재 위치">
          <Link to="/">HOME</Link><span>›</span><span>세미나</span><span>›</span><strong>세미나 일정</strong>
        </nav>

        <h1 className="seminar-schedule__title">세미나 일정</h1>

        <div className="seminar-schedule__toolbar">
          <div className="seminar-schedule__view-switch" aria-label="보기 방식">
            <button className={view === "list" ? "is-active" : ""} onClick={() => setView("list")} type="button">
              <GalleryIcon /> 갤러리형
            </button>
            <button className={view === "calendar" ? "is-active" : ""} onClick={() => setView("calendar")} type="button">
              <CalendarIcon /> 캘린더형
            </button>
          </div>
          <button className="seminar-schedule__download" type="button" onClick={() => window.print()}>
            일정 다운로드 <DownloadIcon />
          </button>
        </div>

        <button className="seminar-schedule__mobile-filter" type="button" onClick={() => setFiltersOpen((open) => !open)}>
          검색 및 필터 {filtersOpen ? "닫기" : "열기"}
        </button>

        <div className="seminar-schedule__layout">
          <aside className={`seminar-filter${filtersOpen ? " is-open" : ""}`}>
            <form onSubmit={(event) => event.preventDefault()}>
              <label className="seminar-filter__search">
                <span className="sr-only">세미나 검색</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" />
                <SearchIcon />
              </label>

              <div className="seminar-filter__panel">
                <div className="seminar-filter__head">
                  <strong>상세 검색</strong>
                  <button type="button" onClick={resetFilters}>초기화</button>
                </div>

                <fieldset>
                  <legend>진행 상태</legend>
                  <div className="seminar-filter__stack">
                    {statusFilters.map((item) => (
                      <button key={item} type="button" className={status === item ? "is-selected" : ""} onClick={() => setStatus(item)}>{item}</button>
                    ))}
                  </div>
                </fieldset>

                <fieldset>
                  <legend>교육 난이도</legend>
                  <div className="seminar-filter__periods">
                    {(["전체", "기초", "심화"] as const).map((item) => (
                      <button key={item} type="button" className={level === item ? "is-selected" : ""} onClick={() => setLevel(item)}>{item}</button>
                    ))}
                  </div>
                </fieldset>

                <fieldset>
                  <legend>기간</legend>
                  <div className="seminar-filter__dates">
                    <input type="date" aria-label="시작일" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                    <span>–</span>
                    <input type="date" aria-label="종료일" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                  </div>
                </fieldset>

                <fieldset>
                  <legend>교육 분야</legend>
                  <div className="seminar-filter__topics">
                    {topics.map((topic) => (
                      <button key={topic} type="button" aria-pressed={selectedTopics.includes(topic)} onClick={() => toggleTopic(topic)}>{topic}</button>
                    ))}
                  </div>
                </fieldset>

                <button className="seminar-filter__submit" type="button" onClick={() => setFiltersOpen(false)}>
                  {filteredSeminars.length}개 세미나 보기
                </button>
              </div>
            </form>
          </aside>

          <section className="seminar-results" aria-live="polite">
            <p className="seminar-results__notice">
              총 <strong>{filteredSeminars.length}</strong>개의 세미나가 있습니다. 일정과 장소는 운영 상황에 따라 변경될 수 있습니다.
            </p>

            {filteredSeminars.length === 0 ? (
              <div className="seminar-results__empty">조건에 맞는 세미나가 없습니다.<button type="button" onClick={resetFilters}>검색 조건 초기화</button></div>
            ) : view === "list" ? (
              <div className="seminar-results__grid">
                {visibleSeminars.map((seminar, index) => {
                  const featured = page === 1 && index === 0;
                  return (
                    <Link className={`schedule-card${featured ? " schedule-card--featured" : ""}`} to={`/seminars/${seminar.id}`} key={`${seminar.isPast ? "past" : "upcoming"}-${seminar.id}`}>
                      {featured && <div className="schedule-card__image"><img src={seminar.image} alt="" /><span>추천</span></div>}
                      <div className="schedule-card__content">
                        <p className={`schedule-card__type schedule-card__type--${seminar.status === "완료" ? "closed" : seminar.level === "심화" ? "advanced" : "basic"}`}>
                          <span /> {seminar.status} · {seminar.level}
                        </p>
                        <h2>{seminar.title}</h2>
                        <div className="schedule-card__meta">
                          <time>{seminar.date}</time>
                          <span>{seminar.location}</span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="seminar-calendar">
                <div className="seminar-calendar__header">
                  <strong>{calendarMonth.getFullYear()}.{String(calendarMonth.getMonth() + 1).padStart(2, "0")}</strong>
                  <div>
                    <button type="button" aria-label="이전 달" onClick={() => moveCalendar(-1)}>‹</button>
                    <button type="button" aria-label="다음 달" onClick={() => moveCalendar(1)}>›</button>
                  </div>
                </div>

                <div className="seminar-calendar__legend" aria-label="일정 상태 안내">
                  <span className="is-open">접수중</span>
                  <span className="is-upcoming">예정</span>
                  <span className="is-closed">완료</span>
                </div>

                <div className="seminar-calendar__box">
                  <div className="seminar-calendar__weekdays" aria-hidden="true">
                    {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day) => <span key={day}>{day}</span>)}
                  </div>
                  <div className="seminar-calendar__days">
                    {calendarCells.map((cell) => (
                      <article className={`seminar-calendar__day is-${cell.relation}`} key={cell.key}>
                        <time dateTime={cell.key}>{cell.date.getDate()}</time>
                        <div>
                          {cell.events.map((seminar) => (
                            <Link className={`is-${seminar.status === "접수중" ? "open" : seminar.status === "예정" ? "upcoming" : "closed"}`} to={`/seminars/${seminar.id}`} key={`${cell.key}-${seminar.id}`}>
                              {seminar.title}
                            </Link>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {view === "list" && filteredSeminars.length > pageSize && (
              <nav className="seminar-results__paging" aria-label="세미나 페이지">
                <button type="button" aria-label="이전 페이지" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>‹</button>
                {Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => (
                  <button type="button" className={page === number ? "is-current" : ""} aria-current={page === number ? "page" : undefined} onClick={() => setPage(number)} key={number}>{number}</button>
                ))}
                <button type="button" aria-label="다음 페이지" disabled={page === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>›</button>
              </nav>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
