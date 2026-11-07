import { useDeferredValue, useMemo, useState } from 'react';
import { ArrowUpRight, BookOpen, Clock3, Plus, Search, ShieldCheck } from 'lucide-react';
import { WIKI_CATEGORIES, WIKI_STATUS, type WikiDraft, type WikiPage } from '../../../wiki/types';
import { articleLead, encyclopediaArticles, encyclopediaDraft, INDEX_LETTERS, indexLetter, wantedArticles } from '../../../wiki/encyclopedia';
import { searchPages } from '../../../wiki/markdown';

type Props = { pages: WikiPage[]; query: string; onQuery: (query: string) => void; onNavigate: (id: string) => void; onCreate: (draft: WikiDraft) => void; onLibrary: () => void };
export function WikiEncyclopedia({ pages, query, onQuery, onNavigate, onCreate, onLibrary }: Props) {
  const [category, setCategory] = useState('');
  const [letter, setLetter] = useState('전체');
  const [includeUnreviewed, setIncludeUnreviewed] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const allArticles = useMemo(() => encyclopediaArticles(pages, true), [pages]);
  const articles = useMemo(() => encyclopediaArticles(pages, includeUnreviewed), [pages, includeUnreviewed]);
  const matched = useMemo(() => searchPages(articles.filter(page => (!category || page.category === category) && (letter === '전체' || indexLetter(page.title) === letter)), deferredQuery), [articles, category, letter, deferredQuery]);
  const grouped = useMemo(() => INDEX_LETTERS.slice(1).flatMap(key => {
    const entries = matched.filter(page => indexLetter(page.title) === key);
    return entries.length ? [{ key, entries }] : [];
  }), [matched]);
  const categories = useMemo(() => [...new Set([...WIKI_CATEGORIES, ...articles.map(page => page.category)])], [articles]);
  const recent = useMemo(() => [...allArticles].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6), [allArticles]);
  const wanted = useMemo(() => wantedArticles(pages).slice(0, 6), [pages]);
  const publishedCount = allArticles.filter(page => page.status === 'published').length;
  return <div className="wk-encyclopedia">
    <header className="wk-ency-hero"><span className="wk-eyebrow">INDEX ENCYCLOPEDIA</span><h1>주거를 이해하는 지식,<br />함께 쌓는 백과사전.</h1><p>공간과 설계, 자재와 기술, 실무와 협업까지.<br />주거 실내건축 전문가의 지식을 항목으로 연결합니다.</p>
      <label className="wk-ency-search"><Search size={21} /><input aria-label="백과사전 검색" value={query} onChange={event => onQuery(event.target.value)} placeholder="궁금한 개념이나 용어를 찾아보세요" /></label>
      <div className="wk-ency-summary"><span><BookOpen size={16} />백과 항목 <strong>{allArticles.length}</strong></span><span><ShieldCheck size={16} />검수 완료 <strong>{publishedCount}</strong></span><button onClick={() => onCreate(encyclopediaDraft())}><Plus size={16} />새 항목 작성</button></div>
    </header>
    <div className="wk-ency-columns"><main>
      <section className="wk-ency-categories" aria-label="백과사전 분야"><h2>분야별 탐색</h2><div><button aria-pressed={!category} onClick={() => setCategory('')}>전체 분야 <span>{articles.length}</span></button>{categories.map(name => <button key={name} aria-pressed={category === name} onClick={() => setCategory(category === name ? '' : name)}>{name}<span>{articles.filter(page => page.category === name).length}</span></button>)}</div></section>
      <section className="wk-ency-index"><div className="wk-ency-section-title"><div><h2>{query ? '검색 결과' : '가나다순 항목 색인'}</h2><p>{matched.length}개 항목{category ? ' · ' + category : ''}</p></div><label><input type="checkbox" checked={includeUnreviewed} onChange={event => setIncludeUnreviewed(event.target.checked)} />검수 전 항목 포함</label></div>
        <nav className="wk-ency-letters" aria-label="가나다 색인">{INDEX_LETTERS.map(value => <button key={value} aria-pressed={letter === value} onClick={() => setLetter(value)}>{value}</button>)}</nav>
        {includeUnreviewed && <p className="wk-ency-caution">초안과 검토 대기 항목이 포함되어 있습니다. 실무에 적용하기 전에 출처와 전문가 검수를 확인해 주세요.</p>}
        {grouped.length ? grouped.map(group => <div className="wk-ency-group" key={group.key}><h3>{group.key}</h3><div>{group.entries.map(page => <button key={page.id} onClick={() => onNavigate(page.id)}><span className="wk-ency-entry-heading"><strong>{page.title}</strong><span className={'wk-status wk-status--' + page.status}>{WIKI_STATUS[page.status]}</span><ArrowUpRight size={17} /></span><span className="wk-ency-definition">{articleLead(page.content) || '정의와 내용을 작성해 주세요.'}</span><small>{page.category} · 출처 {page.sources.length}개</small></button>)}</div></div>) : <div className="wk-ency-empty"><BookOpen size={30} /><h3>{allArticles.length && !includeUnreviewed && !publishedCount ? '첫 번째 검수 완료 항목을 기다리고 있습니다.' : '조건에 맞는 항목이 없습니다.'}</h3><p>{allArticles.length && !publishedCount ? '저장된 초안은 ‘검수 전 항목 포함’을 켜면 읽고 편집할 수 있습니다.' : '분야·색인·검색 조건을 바꾸거나 새로운 항목을 작성해 주세요.'}</p><button className="wk-button wk-button--primary" onClick={() => onCreate(encyclopediaDraft(query.trim()))}><Plus size={16} />항목 작성</button></div>}
      </section>
    </main><aside className="wk-ency-aside"><section><h2><Clock3 size={17} />최근 바뀐 항목</h2>{recent.length ? recent.map(page => <button key={page.id} onClick={() => onNavigate(page.id)}><strong>{page.title}</strong><small>{new Date(page.updatedAt).toLocaleDateString('ko-KR')} · v{page.version} · {WIKI_STATUS[page.status]}</small></button>) : <p>항목을 작성하면 변경 기록이 나타납니다.</p>}</section>
      <section><h2>작성하면 좋은 항목</h2><p>기존 문서에서 연결했지만 아직 작성되지 않은 항목입니다.</p>{wanted.length ? wanted.map(item => <button key={item.title} onClick={() => onCreate(encyclopediaDraft(item.title))}><strong>{item.title}<Plus size={14} /></strong><small>{item.count}개 문서에서 언급</small></button>) : <p>현재 미작성 연결 항목이 없습니다.</p>}</section>
      <section className="wk-ency-about"><h2>INDEX의 공동 지식 자산</h2><p>원본 자료는 보존하고, 지식은 출처와 함께 정리합니다. 편집할 때마다 이전 버전이 남으며, 검수 전인 항목은 상태를 구분해 표시합니다.</p><button onClick={onLibrary}>원본 요약·업무 기록 함께 보기 <ArrowUpRight size={15} /></button></section>
    </aside></div>
  </div>;
}
