import { useEffect, useMemo, useRef, useState } from "react";
import { caseFilters, type CaseFilter } from "../data/cases";
import { toCaseItem, usePosts } from "@/lib/posts";
import { CaseCard, CaseRow } from "../components/CaseCard";
import Pagination from "../components/Pagination";
import { FlipReveal, FlipRevealItem } from "@/components/ui/flip-reveal";
import { ContainerAnimated, ContainerStagger } from "@/components/blocks/animated-gallery";
import "./Cases.css";

// 관리자에서 비노출 처리한 사례는 목록에서 제외 (게시판 관리와 연동)

type SortKey = "latest" | "views" | "title";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "latest", label: "최신순" },
  { key: "views", label: "조회순" },
  { key: "title", label: "제목순" },
];
const PAGE_SIZE = 8;

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

export default function Cases() {
  // 게시판 글 (관리자 > 게시판 관리). Hidden posts never reach the public list.
  const { data: posts } = usePosts();
  const visibleCases = useMemo(() => posts.map(toCaseItem), [posts]);
  const [filter, setFilter] = useState<CaseFilter>("전체");
  const libraryRef = useRef<HTMLElement>(null);

  // Library (도서관): search + category + sort + paging over every case, no repeats.
  const [query, setQuery] = useState("");
  const [libraryFilter, setLibraryFilter] = useState<CaseFilter>("전체");
  const [sort, setSort] = useState<SortKey>("latest");
  const [page, setPage] = useState(1);

  const libraryItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = visibleCases.filter(
      (item) =>
        (libraryFilter === "전체" || item.group === libraryFilter) &&
        (!q || `${item.title} ${item.excerpt} ${item.category}`.toLowerCase().includes(q)),
    );
    return [...rows].sort((a, b) => {
      if (sort === "views") return (b.views ?? 0) - (a.views ?? 0) || b.date.localeCompare(a.date);
      if (sort === "title") return a.title.localeCompare(b.title, "ko");
      return b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id), undefined, { numeric: true });
    });
  }, [visibleCases, query, libraryFilter, sort]);

  useEffect(() => setPage(1), [query, libraryFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(libraryItems.length / PAGE_SIZE));
  const pageItems = libraryItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const goToPage = (next: number) => {
    setPage(Math.min(Math.max(1, next), totalPages));
    libraryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const flipKeys = useMemo(
    () => [filter === "전체" ? "all" : filter],
    [filter],
  );

  return (
    <div className="cases">
      <section className="cases__hero">
        <ContainerStagger className="cases__inner cases__hero-stagger">
          <ContainerAnimated>
            <span className="cases__eyebrow">Case Library</span>
          </ContainerAnimated>
          <ContainerAnimated>
            <h1 className="cases__title">
              현장 하자 사례를 <span className="cases__title-accent">검색</span>하고 분석하세요
            </h1>
          </ContainerAnimated>
          <ContainerAnimated>
            <p className="cases__lead">
              CASE LIBRARY는 실내건축 현장에서 축적된 다양한 사례와 프로젝트
              경험을 체계적으로 기록하고 <br />
              공유하는 지식 아카이브입니다. 원인 분석부터 해결 과정, 재발 방지
              방안까지 실제 사례를 기반으로 <br />
              정리하여 실무에 필요한 인사이트와 전문적인 기준을 제공합니다.
            </p>
          </ContainerAnimated>
        </ContainerStagger>

      </section>

      <section className="cases__inner cases__popular">
        <div className="cases__filters" role="tablist" aria-label="사례 분류">
          {caseFilters.map((item) => (
            <button
              key={item}
              type="button"
              className={`cases__filter${filter === item ? " is-active" : ""}`}
              aria-pressed={filter === item}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <FlipReveal
          className="cases__grid"
          keys={flipKeys}
          showClass="block"
          hideClass="hidden"
        >
          {visibleCases.map((item) => (
            <FlipRevealItem flipKey={item.group} key={item.id}>
              <CaseCard item={item} />
            </FlipRevealItem>
          ))}
        </FlipReveal>

        <div className="cases__more">
          <button
            type="button"
            className="cases__more-btn"
            onClick={() => libraryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            전체 사례 보기
          </button>
        </div>
      </section>

      <section className="cases__list-section" ref={libraryRef} aria-labelledby="case-library-heading">
        <div className="cases__inner">
          <div className="cases__list-head">
            <div>
              <h2 className="cases__heading" id="case-library-heading">
                다양한 사례들을 확인하는 도서관
              </h2>
              <p className="cases__sub">
                INDEX는 국내 주택 하자의 실제 현장 사례를
                <br />
                수집·분석하여 원인과 해결방법을 정리했습니다.
              </p>
            </div>
          </div>

          <div className="cases__library-toolbar">
            <label className="cases__library-search">
              <span className="sr-only">사례 검색</span>
              <SearchIcon />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="하자 유형, 부위, 키워드로 검색 (예: 누수, 결로, 타일)"
              />
            </label>
            <div className="cases__library-chips" role="group" aria-label="사례 분류">
              {caseFilters.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`cases__filter${libraryFilter === item ? " is-active" : ""}`}
                  aria-pressed={libraryFilter === item}
                  onClick={() => setLibraryFilter(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="cases__library-bar">
            <p>
              총 <strong>{libraryItems.length}</strong>건의 사례
            </p>
            <div className="cases__library-sort" role="group" aria-label="정렬">
              {SORTS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={sort === item.key ? "is-active" : ""}
                  aria-pressed={sort === item.key}
                  onClick={() => setSort(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {pageItems.length > 0 ? (
            <div className="cases__list">
              {pageItems.map((item) => (
                <CaseRow key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <div className="cases__library-empty">
              <p>조건에 맞는 사례가 없습니다.</p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setLibraryFilter("전체");
                }}
              >
                검색 조건 초기화
              </button>
            </div>
          )}

          {totalPages > 1 && (
            <div className="cases__pagination">
              <Pagination current={page} total={totalPages} onChange={goToPage} />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
