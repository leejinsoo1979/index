/** 요소 패널의 가구·소품·조명 이미지: 대분류와 세부 분류로 나눠 고르고, 누르면 페이지에 놓입니다. */
import { useMemo, useState } from "react";
import { BOOK_ELEMENT_GROUPS, BOOK_ELEMENT_ITEMS, type BookElementItem } from "../../../data/book-element-library";
import "./BookElementLibrary.css";

const PREVIEW_COUNT = 9;
const ALL = "전체";

export const searchBookElements = (query: string): BookElementItem[] =>
  BOOK_ELEMENT_ITEMS.filter((item) => `${item.group} ${item.sub} ${item.name} ${item.brand} ${item.variant} ${item.tags}`.toLowerCase().includes(query));

function Chips({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <div className="bel-chips" role="tablist" aria-label={label}>
      {[ALL, ...options].map((option) => (
        <button type="button" role="tab" key={option} aria-selected={value === option} onClick={() => onChange(option)}>{option}</button>
      ))}
    </div>
  );
}

export default function BookElementLibrary({ query, onPick }: { query: string; onPick: (url: string, width: number, height: number) => void }) {
  const [group, setGroup] = useState(ALL);
  const [sub, setSub] = useState(ALL);
  const [expanded, setExpanded] = useState(false);

  const subs = useMemo(() => [...new Set(BOOK_ELEMENT_ITEMS.filter((item) => item.group === group).map((item) => item.sub))], [group]);
  const items = useMemo(
    () => (query ? searchBookElements(query) : BOOK_ELEMENT_ITEMS.filter((item) => (group === ALL || item.group === group) && (sub === ALL || item.sub === sub))),
    [query, group, sub],
  );
  if (query && items.length === 0) return null;
  const shown = query || expanded ? items : items.slice(0, PREVIEW_COUNT);

  return (
    <section className="bel">
      <h4>가구·소품·조명 <small>{items.length}</small></h4>
      {!query && (
        <>
          <Chips label="대분류" options={BOOK_ELEMENT_GROUPS} value={group} onChange={(value) => { setGroup(value); setSub(ALL); setExpanded(false); }} />
          {group !== ALL && subs.length > 1 && <Chips label="세부 분류" options={subs} value={sub} onChange={(value) => { setSub(value); setExpanded(false); }} />}
        </>
      )}
      <div className="bel-grid">
        {shown.map((item) => {
          const label = `${item.name}${item.variant ? ` ${item.variant}` : ""} · ${item.brand}`;
          return (
            <button type="button" key={item.file} title={label} aria-label={`${label} 페이지에 넣기`} onClick={() => onPick(`/book-elements/${item.file}`, item.width, item.height)}>
              <img src={`/book-elements/${item.file}`} alt="" loading="lazy" draggable={false} />
            </button>
          );
        })}
      </div>
      {!query && items.length > PREVIEW_COUNT && (
        <button type="button" className="bel-more" onClick={() => setExpanded((value) => !value)}>{expanded ? "접기" : `${items.length}개 모두 보기`}</button>
      )}
    </section>
  );
}
