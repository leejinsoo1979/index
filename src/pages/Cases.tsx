import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { cases, caseFilters, type CaseFilter } from "../data/cases";
import { CaseCard } from "../components/CaseCard";
import { FlipReveal, FlipRevealItem } from "@/components/ui/flip-reveal";
import {
  ContainerAnimated,
  ContainerScroll,
  ContainerStagger,
  ContainerSticky,
  GalleryCol,
  GalleryContainer,
  GalleryFadeOverlay,
} from "@/components/blocks/animated-gallery";
import "./Cases.css";

// 16 tiles for the bottom gallery — cycle through the case data (12 items)
const moreItems = Array.from({ length: 16 }, (_, i) => ({
  ...cases[i % cases.length],
  key: `more-${i}`,
}));
const MORE_COL_1 = moreItems.filter((_, i) => i % 3 === 0);
const MORE_COL_2 = moreItems.filter((_, i) => i % 3 === 1);
const MORE_COL_3 = moreItems.filter((_, i) => i % 3 === 2);

export default function Cases() {
  const [filter, setFilter] = useState<CaseFilter>("전체");

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
              현장 하자 사례를 <span className="cases__title-accent">검색</span>하고
            </h1>
          </ContainerAnimated>
          <ContainerAnimated>
            <h1 className="cases__title">분석하세요</h1>
          </ContainerAnimated>
          <ContainerAnimated>
            <p className="cases__lead">
              INDEX 실제 현장 사례를 수집·분석하여 원인과 해결방법을 정리합니다.
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
          {cases.map((item) => (
            <FlipRevealItem flipKey={item.group} key={item.id}>
              <CaseCard item={item} />
            </FlipRevealItem>
          ))}
        </FlipReveal>

        <div className="cases__more">
          <button type="button" className="cases__more-btn">
            더보기
          </button>
        </div>
      </section>

      <section className="cases__list-section">
        <div className="cases__inner cases__list-head">
          <div>
            <h2 className="cases__heading">더 많은 사례 읽어보기</h2>
            <p className="cases__sub">
              전국 사례 데이터 중 최신 하자 건의 사례를 쉽게 찾아볼 수 있습니다.
            </p>
          </div>
        </div>

        <ContainerScroll className="cases__more-scroll">
          <ContainerSticky className="cases__sticky">
            <GalleryContainer className="mx-auto w-[min(1200px,calc(100%-64px))]">
              <GalleryCol yRange={["0px", "-640px"]} className="-mt-2">
                {MORE_COL_1.map((item) => (
                  <Link key={item.key} to={`/cases/${item.id}`} className="cases__gallery-tile">
                    <img className="cases__gallery-img" src={item.image} alt="" />
                    <span>{item.title}</span>
                  </Link>
                ))}
              </GalleryCol>
              {/* Tilted: staggered up by the margin; flattened: yRange end value
                  cancels the margin so the top row isn't clipped. */}
              <GalleryCol className="mt-[-32%]" yRange={["215px", "-320px"]}>
                {MORE_COL_2.map((item) => (
                  <Link key={item.key} to={`/cases/${item.id}`} className="cases__gallery-tile">
                    <img className="cases__gallery-img" src={item.image} alt="" />
                    <span>{item.title}</span>
                  </Link>
                ))}
              </GalleryCol>
              <GalleryCol yRange={["0px", "-640px"]} className="-mt-2">
                {MORE_COL_3.map((item) => (
                  <Link key={item.key} to={`/cases/${item.id}`} className="cases__gallery-tile">
                    <img className="cases__gallery-img" src={item.image} alt="" />
                    <span>{item.title}</span>
                  </Link>
                ))}
              </GalleryCol>
            </GalleryContainer>
            {/* washed-light overlay: sits on top of the tilted tiles,
                fades out as the gallery unfolds (progress 0 → 0.3) */}
            <GalleryFadeOverlay className="cases__hero-glow" aria-hidden="true" />
          </ContainerSticky>
        </ContainerScroll>
      </section>
    </div>
  );
}
