/* Adapted from Korea100 RegistryCatalog, MIT (c) 2026 Hoseong Seo.
 * Next.js/static catalog data replaced with the existing INDEX wiki repository.
 * See third_party/korea100 for the unchanged upstream source and license. */
import { useDeferredValue, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { CustomSelect } from '@/components/ui/custom-select';
import { registryStatus as verificationMeta, type RegistryRecord as InstitutionSummary } from '../../../../wiki/registry';
import CompareTray from './CompareTray';
import styles from './RegistryCatalog.module.css';
const PAGE_SIZE = 30;
const MAX_COMPARE = 3;
const CATEGORY_COLORS: Record<string, string> = {
  '공간':'#88bfae', '설계·디자인':'#9aaff0', '공법':'#c6ad83', '자재':'#92bb8f',
  '주거 환경':'#89b7ce', '하자':'#d59c90', '법규·기준':'#bdacdc', '디지털·AI':'#8ebfba',
  '사업·협업':'#d1a4bc', '현장 기록':'#a7b6c9', '일반':'#a4acb7',
};
export default function RegistryCatalog({ institutions, categoryOrder, query, onQuery }: {
  institutions: InstitutionSummary[]; categoryOrder: string[]; query: string; onQuery: (value: string) => void;
}) {
  const [activeCategory, setActiveCategory] = useState('전체');
  const [activeType, setActiveType] = useState('전체 유형');
  const [verificationFilter, setVerificationFilter] = useState('all');
  const [sort, setSort] = useState<'priority'|'name'>('priority');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const setQuery = onQuery;
  const deferred = useDeferredValue(query);
  const institutionBySlug = useMemo(() => new Map(institutions.map(item => [item.slug, item])), [institutions]);
  const categoryCounts = useMemo(() => { const counts = new Map<string, number>(); for (const item of institutions) counts.set(item.category, (counts.get(item.category) ?? 0) + 1); return counts; }, [institutions]);
  const types = useMemo(() => [...new Set(institutions.map(item => item.type))], [institutions]);
  const filtered = useMemo(() => {
    const tokens = deferred.trim().normalize('NFC').toLocaleLowerCase('ko').split(/\s+/).filter(Boolean);
    return institutions.filter(item => (activeCategory === '전체' || item.category === activeCategory)
      && (activeType === '전체 유형' || item.type === activeType)
      && (verificationFilter === 'all' || item.status === verificationFilter)
      && tokens.every(token => item.searchText.includes(token)))
      .sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name, 'ko') : a.priority - b.priority);
  }, [institutions, deferred, activeCategory, activeType, verificationFilter, sort]);
  const visibleInstitutions = filtered.slice(0, visibleCount);
  const selectedInstitutions = selectedSlugs.flatMap(slug => {const item = institutionBySlug.get(slug); return item ? [item] : [];});
  const stats = institutions.reduce((total,item) => ({ nodes:total.nodes + item.relationCount, articles:total.articles + item.sourceCount, verified:total.verified + Number(item.status === 'published') }), {nodes:0, articles:0, verified:0});
  function resetVisible() { setVisibleCount(PAGE_SIZE); }
  function toggleCompare(slug: string) { setSelectedSlugs(current => current.includes(slug) ? current.filter(s => s !== slug) : current.length < MAX_COMPARE ? [...current, slug] : current); }
  return (
    <section id="index-knowledge-registry" className={styles.registry + " wk-korea100-catalog"}>
      <div className={styles.statBand}>
        <div className={styles.searchBox}>
          <label htmlFor="registry-search">검색</label>
          <input
            id="registry-search"
            type="search"
            value={query}
            placeholder="항목명 · 본문 · 태그 · 원본 자료"
            onChange={(event) => {
              setQuery(event.target.value);
              resetVisible();
            }}
          />
          {query ? (
            <button
              type="button"
              aria-label="검색어 지우기"
              title="검색어 지우기"
              onClick={() => {
                setQuery("");
                resetVisible();
              }}
            >
              ×
            </button>
          ) : (
            <span>전체 색인 {institutions.length}건</span>
          )}
        </div>
        <div className={styles.stats} aria-label="지식 대장 통계">
          <RegistryStat value={institutions.length} label="지식 항목" />
          <RegistryStat value={stats.nodes / 2} label="문서 연결" />
          <RegistryStat value={stats.articles} label="연결 출처" />
          <RegistryStat value={stats.verified} label="검수 완료" accent />
        </div>
      </div>

      <div className={styles.body}>
        <aside className={styles.rail} aria-label="지식 필터">
          <div className={styles.railHeading}>분야</div>
          <div className={styles.railGroups}>
            {["전체", ...categoryOrder].map((category) => {
              const active = activeCategory === category;
              const color =
                category === "전체" ? "#d0d9df" : CATEGORY_COLORS[category] ?? "#5d6b63";
              return (
                <button
                  key={category}
                  type="button"
                  className={styles.railItem}
                  aria-pressed={active}
                  style={{ "--category-color": color } as CSSProperties}
                  onClick={() => {
                    setActiveCategory(category);
                    resetVisible();
                  }}
                >
                  <span>
                    <i aria-hidden="true" />
                    {category}
                  </span>
                  <strong>
                    {category === "전체"
                      ? institutions.length
                      : (categoryCounts.get(category) ?? 0)}
                  </strong>
                </button>
              );
            })}
          </div>

          <fieldset className={styles.verificationFilter}>
            <legend>검증 상태</legend>
            <FilterRadio
              label="전체"
              count={institutions.length}
              active={verificationFilter === "all"}
              color="#5d6b63"
              onClick={() => {
                setVerificationFilter("all");
                resetVisible();
              }}
            />
            <FilterRadio
              label="검수 완료"
              count={stats.verified}
              active={verificationFilter === "published"}
              color="#0f9f72"
              onClick={() => {
                setVerificationFilter("published");
                resetVisible();
              }}
            />
            <FilterRadio
              label="검토 대기"
              count={institutions.filter((item) => item.status === "review").length}
              active={verificationFilter === "review"}
              color="#c78116"
              onClick={() => {
                setVerificationFilter("review");
                resetVisible();
              }}
            />
            <FilterRadio label="초안" count={institutions.filter(item => item.status === 'draft').length} active={verificationFilter === 'draft'} color="#9aa5b5" onClick={() => { setVerificationFilter('draft'); resetVisible(); }} />
          </fieldset>

          <label className={styles.typeFilter}>
            <span>문서 유형</span>
            <CustomSelect aria-label="문서 유형" value={activeType} options={['전체 유형',...types]} onValueChange={value=>{setActiveType(value);resetVisible();}}/>
          </label>
        </aside>

        <div className={styles.tablePane}>
          <div className={styles.tableToolbar}>
            <p aria-live="polite">
              <strong>{activeCategory === "전체" ? "지식 대장" : activeCategory}</strong>
              <span> · {filtered.length}개 결과</span>
            </p>
            <div className={styles.sortControl} role="group" aria-label="정렬 방식">
              <button
                type="button"
                aria-pressed={sort === "priority"}
                onClick={() => {
                  setSort("priority");
                  resetVisible();
                }}
              >
                최근 수정
              </button>
              <button
                type="button"
                aria-pressed={sort === "name"}
                onClick={() => {
                  setSort("name");
                  resetVisible();
                }}
              >
                가나다
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className={styles.empty}>
              <strong>검색 결과가 없습니다.</strong>
              <span>검색어를 줄이거나 다른 분야를 선택해 보세요.</span>
            </div>
          ) : (
            <>
              <div className={styles.tableScroll}>
                <table className={styles.registryTable}>
                  <thead>
                    <tr>
                      <th scope="col">NO</th>
                      <th scope="col">지식 항목</th>
                      <th scope="col">유형</th>
                      <th scope="col">분야</th>
                      <th scope="col">검수 상태</th>
                      <th scope="col">연결</th>
                      <th scope="col">비교</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleInstitutions.map((institution) => (
                      <RegistryRow
                        key={institution.slug}
                        institution={institution}
                        selected={selectedSlugs.includes(institution.slug)}
                        disabled={
                          selectedSlugs.length >= MAX_COMPARE &&
                          !selectedSlugs.includes(institution.slug)
                        }
                        onToggle={() => toggleCompare(institution.slug)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={styles.mobileList}>
                {visibleInstitutions.map((institution) => (
                  <MobileRegistryRow
                    key={institution.slug}
                    institution={institution}
                    selected={selectedSlugs.includes(institution.slug)}
                    disabled={
                      selectedSlugs.length >= MAX_COMPARE &&
                      !selectedSlugs.includes(institution.slug)
                    }
                    onToggle={() => toggleCompare(institution.slug)}
                  />
                ))}
              </div>
            </>
          )}

          {visibleInstitutions.length < filtered.length && (
            <button
              type="button"
              className={styles.loadMore}
              onClick={() => {
                setVisibleCount((count) => count + PAGE_SIZE);
              }}
            >
              항목 더 보기
              <span>{visibleInstitutions.length}/{filtered.length}</span>
            </button>
          )}
        </div>
      </div>

      <CompareTray
        selected={selectedInstitutions}
        onRemove={(slug) => toggleCompare(slug)}
      />
    </section>
  );
}

function RegistryStat({
  value,
  label,
  accent = false,
}: {
  value: number;
  label: string;
  accent?: boolean;
}) {
  return (
    <div data-accent={accent ? "true" : undefined}>
      <strong>{value.toLocaleString("ko-KR")}</strong>
      <span>{label}</span>
    </div>
  );
}

function FilterRadio({
  label,
  count,
  active,
  color,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}>
      <i style={{ background: color }} aria-hidden="true" />
      <span>{label}</span>
      <strong>{count}</strong>
    </button>
  );
}

function RegistryRow({
  institution,
  selected,
  disabled,
  onToggle,
}: {
  institution: InstitutionSummary;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const verification = verificationMeta(institution);
  const categoryColor = CATEGORY_COLORS[institution.category] ?? "#5d6b63";

  return (
    <tr style={{ "--category-color": categoryColor } as CSSProperties}>
      <td className={styles.numberCell}>
        {institution.priority.toString().padStart(2, "0")}
      </td>
      <td className={styles.nameCell}>
        <Link
          to={'?page=' + encodeURIComponent(institution.slug)}
        >
          <strong>{institution.name}</strong>
          <span>{institution.oneLiner}</span>
        </Link>
      </td>
      <td>{institution.type}</td>
      <td>
        <span className={styles.categoryBadge}>{shortCategory(institution.category)}</span>
      </td>
      <td>
        <span className={styles.verificationLabel} data-tone={verification.tone}>
          <i aria-hidden="true" />
          {verification.label}
        </span>
      </td>
      <td className={styles.nodeCell}>{institution.relationCount}</td>
      <td className={styles.compareCell}>
        <input
          type="checkbox"
          checked={selected}
          disabled={disabled}
          onChange={onToggle}
          aria-label={`${institution.name} 비교 ${selected ? "제외" : "추가"}`}
          title={disabled ? "최대 3개까지 비교할 수 있습니다" : undefined}
        />
      </td>
    </tr>
  );
}

function MobileRegistryRow({
  institution,
  selected,
  disabled,
  onToggle,
}: {
  institution: InstitutionSummary;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const verification = verificationMeta(institution);
  return (
    <article>
      <span className={styles.mobileNumber}>
        {institution.priority.toString().padStart(2, "0")}
      </span>
      <Link to={'?page=' + encodeURIComponent(institution.slug)}>
        <span className={styles.mobileTitleLine}>
          <strong>{institution.name}</strong>
          <i data-tone={verification.tone} aria-label={verification.label} />
        </span>
        <span className={styles.mobileDescription}>{institution.oneLiner}</span>
        <span className={styles.mobileMeta}>
          {institution.type} · 연결 {institution.relationCount} · {verification.label}
        </span>
      </Link>
      <input
        type="checkbox"
        checked={selected}
        disabled={disabled}
        onChange={onToggle}
        aria-label={`${institution.name} 비교 ${selected ? "제외" : "추가"}`}
      />
    </article>
  );
}

function shortCategory(category: string) {
  const short: Record<string, string> = {
    "데이터·디지털·공공서비스": "데이터·디지털",
    "국가 운영과 권력 통제": "권력 통제",
    "민원·권리구제·참여": "권리구제·참여",
    "외교·국방·치안·생활 기반": "외교·국방·치안",
  };
  return short[category] ?? category;
}
