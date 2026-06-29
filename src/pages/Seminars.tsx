import { useMemo, useState } from "react";
import { upcomingSeminars, pastSeminars } from "../data/seminars";
import {
  FeaturedSeminar,
  SeminarCard,
  PastSeminarRow,
} from "../components/SeminarCard";
import SectionTabs from "../components/SectionTabs";
import Pagination from "../components/Pagination";
import { ChevronDownIcon } from "../components/icons";
import "./Seminars.css";

const TABS = ["전체", "예정", "완료"] as const;
type SeminarTab = (typeof TABS)[number];

export default function Seminars() {
  const [tab, setTab] = useState<SeminarTab>("전체");
  const [page, setPage] = useState(1);

  const [featured, ...rest] = upcomingSeminars;

  const visibleUpcoming = useMemo(() => {
    if (tab === "완료") return [];
    return rest;
  }, [tab, rest]);

  const showUpcoming = tab !== "완료";
  const showPast = tab !== "예정";

  return (
    <div className="seminars">
      <section className="seminars__hero">
        <div className="seminars__inner">
          <h1 className="seminars__title">
            산업 표준과 실무 역량 강화를 위한
            <br />
            전문 교육 및 세미나
          </h1>
          <p className="seminars__lead">
            교육 수준 하이라인과 30%는 평균 전문가 그룹 경험이며 사실 초기 통합 전산
            부문에서 시작됩니다. INDEX는 실제 현장 사례를 수집·분석하여 원인과
            해결방법을 정리합니다.
          </p>
        </div>
      </section>

      <section className="seminars__inner">
        <SectionTabs tabs={TABS} active={tab} onChange={setTab} />

        {showUpcoming && (
          <>
            <div className="seminars__feature">
              <FeaturedSeminar seminar={featured} />
            </div>

            <div className="seminars__grid">
              {visibleUpcoming.map((s) => (
                <SeminarCard key={s.id} seminar={s} />
              ))}
            </div>
          </>
        )}
      </section>

      {showPast && (
        <section className="seminars__inner seminars__past">
          <div className="seminars__past-head">
            <h2 className="seminars__heading">이전 세미나</h2>
            <button type="button" className="seminars__sort">
              조회순 <ChevronDownIcon />
            </button>
          </div>

          <div className="seminars__list">
            {pastSeminars.map((s) => (
              <PastSeminarRow key={s.id} seminar={s} />
            ))}
          </div>

          <div className="seminars__pagination">
            <Pagination current={page} total={45} onChange={setPage} />
          </div>
        </section>
      )}
    </div>
  );
}
