import { useMemo, useState } from "react";
import { cases, caseFilters, type CaseFilter } from "../data/cases";
import { CaseCard, CaseRow } from "../components/CaseCard";
import SectionTabs from "../components/SectionTabs";
import Pagination from "../components/Pagination";
import { ChevronDownIcon } from "../components/icons";
import "./Cases.css";

export default function Cases() {
  const [filter, setFilter] = useState<CaseFilter>("전체");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (filter === "전체") return cases;
    return cases.filter((c) => c.group === filter);
  }, [filter]);

  return (
    <div className="cases">
      <section className="cases__hero">
        <div className="cases__inner">
          <h1 className="cases__title">
            현장 하자 사례를
            <br />
            검색하고 분석하세요
          </h1>
          <p className="cases__lead">
            최근 3년 이하의 건물이면, 이 공사 불량인 사례를 바탕으로 분석해드립니다.
            <br />
            INDEX 실제 현장 사례를 수집·분석하여 원인과 해결방법을 정리합니다.
          </p>
        </div>
      </section>

      <section className="cases__inner cases__popular">
        <h2 className="cases__heading">인기 게시글</h2>
        <SectionTabs tabs={caseFilters} active={filter} onChange={setFilter} />

        <div className="cases__grid">
          {filtered.map((item) => (
            <CaseCard key={item.id} item={item} />
          ))}
        </div>

        <div className="cases__more">
          <button type="button" className="cases__more-btn">
            더보기
          </button>
        </div>
      </section>

      <section className="cases__inner cases__list-section">
        <div className="cases__list-head">
          <div>
            <h2 className="cases__heading">더 많은 사례 읽어보기</h2>
            <p className="cases__sub">
              전국 사례 데이터 중 최신 하자 건의 사례를 쉽게 찾아볼 수 있습니다.
            </p>
          </div>
          <button type="button" className="cases__sort">
            정렬 · 최신순 <ChevronDownIcon />
          </button>
        </div>

        <div className="cases__list">
          {cases.map((item) => (
            <CaseRow key={item.id} item={item} />
          ))}
        </div>

        <div className="cases__pagination">
          <Pagination current={page} total={45} onChange={setPage} />
        </div>
      </section>
    </div>
  );
}
