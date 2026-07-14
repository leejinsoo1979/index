import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { pastSeminars, upcomingSeminars, type SeminarLevel } from "../data/seminars";
import SeminarApplyModal from "../components/SeminarApplyModal";
import Placeholder from "./Placeholder";
import "./SeminarDetail.css";

const SEMINAR_TIME = "14:00 - 17:00";

interface DetailSeminar {
  id: number;
  level: SeminarLevel;
  status: "예정" | "접수중" | "완료";
  title: string;
  date: string;
  location: string;
  capacity: number;
  enrolled: number;
  image: string;
  isPast: boolean;
}

function findSeminar(id?: string): DetailSeminar | null {
  const upcoming = upcomingSeminars.find((s) => String(s.id) === id);
  if (upcoming) return { ...upcoming, isPast: false };
  const past = pastSeminars.find((s) => String(s.id) === id);
  if (past)
    return { ...past, status: "완료", capacity: 0, enrolled: 0, isPast: true };
  return null;
}

function programFor(title: string): string[] {
  if (/방수|누수/.test(title))
    return [
      "방수 시스템별 설계 기준과 자재 선정 가이드",
      "현장 시공 사례로 보는 누수 원인 진단 프로세스",
      "하자 발생 구간별 보수 공법 비교와 적용 기준",
      "질의응답 및 참가자 현장 사례 공유",
    ];
  if (/타일|마감/.test(title))
    return [
      "타일 시공 불량 유형별 원인 분석",
      "접착제·모르타르 선정과 바탕면 처리 기준",
      "하자 예방을 위한 시공 체크리스트 실습",
      "질의응답 및 참가자 현장 사례 공유",
    ];
  if (/단열|결로/.test(title))
    return [
      "단열재 종류별 성능 비교와 시공 기준",
      "결로 발생 메커니즘과 취약 부위 진단",
      "열교 차단 상세 설계 사례 리뷰",
      "질의응답 및 참가자 현장 사례 공유",
    ];
  if (/구조|균열/.test(title))
    return [
      "균열 유형별 구조적 원인 판독법",
      "비파괴 진단 장비 활용과 판정 기준",
      "보강 공법 선정 사례 스터디",
      "질의응답 및 참가자 현장 사례 공유",
    ];
  return [
    "표준 점검 설계 프로세스와 품질 기준",
    "현장 적용 사례 중심의 실무 노하우 공유",
    "하자 예방 체크리스트 실습",
    "질의응답 및 참가자 현장 사례 공유",
  ];
}

/** "2026.08.04 (화)" → "20260804" (empty string if unparsable) */
function compactDate(date: string) {
  return date.match(/\d{4}\.\d{2}\.\d{2}/)?.[0]?.replace(/\./g, "") ?? "";
}

function googleCalendarUrl(seminar: DetailSeminar) {
  const day = compactDate(seminar.date);
  if (!day) return null;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: seminar.title,
    dates: `${day}T140000/${day}T170000`,
    ctz: "Asia/Seoul",
    location: seminar.location,
    details: "한국실내건축가협회 실무 세미나",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="18" cy="5.5" r="2.6" />
      <circle cx="6" cy="12" r="2.6" />
      <circle cx="18" cy="18.5" r="2.6" />
      <path d="m8.3 10.7 7.4-4M8.3 13.3l7.4 4" />
    </svg>
  );
}

function CalendarPlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="1.5" />
      <path d="M8 3v4M16 3v4M3 10h18M12 13v5M9.5 15.5h5" />
    </svg>
  );
}

function PrintIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 8V3.5h10V8M5 8h14a2 2 0 0 1 2 2v6h-4M3 10v6h4" />
      <rect x="7" y="14" width="10" height="6.5" />
    </svg>
  );
}

export default function SeminarDetail() {
  const { id } = useParams();
  const seminar = findSeminar(id);
  const [applyOpen, setApplyOpen] = useState(false);

  if (!seminar) return <Placeholder title="세미나를 찾을 수 없습니다" />;

  const calendarUrl = googleCalendarUrl(seminar);

  const handleShare = async () => {
    const shareData = {
      title: seminar.title,
      text: `${seminar.title} — ${seminar.date} · ${seminar.location}`,
      url: window.location.href,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        /* user cancelled */
      }
      return;
    }
    await navigator.clipboard.writeText(window.location.href);
    alert("링크가 복사되었습니다.");
  };

  return (
    <main className="seminar-detail">
      <div className="seminar-detail__shell">
        <div className="seminar-detail__top">
          <nav className="seminar-detail__breadcrumb" aria-label="현재 위치">
            <Link to="/">HOME</Link>
            <span>›</span>
            <Link to="/seminars">세미나</Link>
            <span>›</span>
            <strong>{seminar.title}</strong>
          </nav>
          <div className="seminar-detail__actions" aria-label="페이지 도구">
            <button type="button" aria-label="공유하기" onClick={handleShare}>
              <ShareIcon />
            </button>
            {calendarUrl && (
              <a
                href={calendarUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="구글 캘린더에 추가"
              >
                <CalendarPlusIcon />
              </a>
            )}
            <button type="button" aria-label="인쇄하기" onClick={() => window.print()}>
              <PrintIcon />
            </button>
          </div>
        </div>

        <div className="seminar-detail__layout">
          <aside className="seminar-detail__poster">
            <img src={seminar.image} alt={`${seminar.title} 포스터`} />
            <a
              className="seminar-detail__homepage"
              href="https://www.kiaa.or.kr"
              target="_blank"
              rel="noreferrer"
            >
              홈페이지 바로가기 <span aria-hidden="true">↗</span>
            </a>
          </aside>

          <section className="seminar-detail__body">
            <p className="seminar-detail__eyebrow">
              한국실내건축가협회 실무 세미나 · {seminar.level} 과정
            </p>
            <h1 className="seminar-detail__title">{seminar.title}</h1>
            <p className="seminar-detail__date">{seminar.date}</p>

            <div className="seminar-detail__info">
              <div className="seminar-detail__info-block">
                <span className="seminar-detail__label">교육 시간</span>
                <div className="seminar-detail__info-row">
                  <strong>{seminar.date}</strong>
                  <strong>{SEMINAR_TIME}</strong>
                </div>
              </div>
              <div className="seminar-detail__info-block">
                <span className="seminar-detail__label">교육 장소</span>
                <div className="seminar-detail__info-row">
                  <strong>{seminar.location}</strong>
                </div>
                <a className="seminar-detail__sub-link" href="#directions">
                  오시는 길 <span aria-hidden="true">›</span>
                </a>
              </div>
            </div>

            <div className="seminar-detail__section">
              <span className="seminar-detail__label">주요 프로그램</span>
              <ul>
                {programFor(seminar.title).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>

            <div className="seminar-detail__section">
              <span className="seminar-detail__label">주최</span>
              <p>한국실내건축가협회</p>
            </div>
            <div className="seminar-detail__section">
              <span className="seminar-detail__label">주관</span>
              <p>INDEX 세미나 사무국</p>
            </div>
            <div className="seminar-detail__section">
              <span className="seminar-detail__label">모집 현황</span>
              <p>
                {seminar.isPast
                  ? "종료된 세미나입니다."
                  : `정원 ${seminar.capacity}명 중 ${seminar.enrolled}명 신청`}
              </p>
            </div>
          </section>
        </div>

        <div className="seminar-detail__footer">
          <Link className="seminar-detail__list-button" to="/seminars">
            목록보기
          </Link>
          {!seminar.isPast && (
            <button
              type="button"
              className="seminar-detail__apply-button"
              onClick={() => setApplyOpen(true)}
            >
              신청하기
            </button>
          )}
        </div>
      </div>

      {applyOpen && (
        <SeminarApplyModal seminar={seminar} onClose={() => setApplyOpen(false)} />
      )}
    </main>
  );
}
