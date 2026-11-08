import { useEffect, useMemo, useRef, useState } from 'react';
import type { WikiPage } from '../../../wiki/types';
import { buildGalaxy, type GalaxyTool } from './galaxyData';
import './KnowledgeGalaxy.css';

/**
 * INDEX 지식 은하 — full-screen 3D knowledge map (Second Brain OS map, MIT, ported in
 * galaxyEngine.ts). The engine owns the DOM below the root; React only renders the shell once.
 */
export type GalaxyNavKey = 'encyclopedia' | 'warroom' | 'library' | 'studio' | 'chat';
type Props = {
  pages: WikiPage[];
  onOpenPage: (id: string) => void;
  onOpenTool: (id: string) => void;
  onNav: (key: GalaxyNavKey) => void;
  /** a person's own galaxy (개인 지식 은하): their name replaces INDEX in the title */
  owner?: string;
  /** top-right links; defaults to the studio views */
  links?: { key: GalaxyNavKey; label: string }[];
};
const STUDIO_LINKS: Props['links'] = [{ key: 'encyclopedia', label: '백과사전' }, { key: 'warroom', label: '현황판' }, { key: 'studio', label: '스튜디오' }];

let toolCache: GalaxyTool[] | null = null;

export default function KnowledgeGalaxy({ pages, onOpenPage, onOpenTool, onNav, owner, links = STUDIO_LINKS }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const host = useRef({ onOpenPage, onOpenTool, onNav });
  host.current = { onOpenPage, onOpenTool, onNav };
  const [tools, setTools] = useState<GalaxyTool[] | null>(toolCache);

  useEffect(() => {
    if (toolCache) return;
    fetch('/api/tools')
      .then((r) => (r.ok ? r.json() : { tools: [] }))
      .then((d: { tools?: GalaxyTool[] }) => { toolCache = d.tools ?? []; setTools(toolCache); })
      .catch(() => { toolCache = []; setTools([]); });
  }, []);

  // Rebuild only when the set of documents actually changes.
  const signature = useMemo(() => pages.filter((p) => p.status !== 'archived').map((p) => p.id + ':' + p.version).join('|'), [pages]);
  const data = useMemo(() => (tools ? buildGalaxy(pages, tools, owner) : null), [signature, tools, owner]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = root.current;
    if (!el || !data) return;
    try { el.dataset.theme = JSON.parse(localStorage.getItem('index-galaxy:theme') || '"dark"') === 'light' ? 'light' : 'dark'; } catch { el.dataset.theme = 'dark'; }
    let destroy: (() => void) | null = null;
    let cancelled = false;
    void import('./galaxyEngine').then(({ mountGalaxy }) => {
      if (cancelled) return;
      destroy = mountGalaxy(el, data.graph, data.pages, {
        openPage: (id) => host.current.onOpenPage(id),
        openTool: (id) => host.current.onOpenTool(id),
        nav: (key) => host.current.onNav(key as GalaxyNavKey),
        owner,
      });
    });
    return () => {
      cancelled = true;
      destroy?.();
      el.classList.remove('m-overview', 'm-focus', 'm-read', 'c-open');
      el.classList.add('booting');
      const labels = el.querySelector('#gx-labels');
      if (labels) labels.innerHTML = '';
      const stage = el.querySelector('#gx-stage');
      if (stage) stage.innerHTML = '';
    };
  }, [data, owner]);

  return (
    <div ref={root} className="sbos booting" data-theme="dark">
      <div id="gx-stage" aria-hidden="true" />
      <div id="gx-labels" aria-hidden="true" />
      <div id="gx-ring" aria-hidden="true"><i /></div>
      <div id="gx-veil" aria-hidden="true" />

      <header className="top">
        <a className="brand" id="gx-brand" href="#/" title="전체 지도로"><b className="logo">index</b>{owner && <em>{owner}</em>}<span>지식 은하</span></a>
        <button className="tbtn" id="gx-btn-contents" aria-controls="gx-contents" aria-expanded="false"><span className="ico">&#8801;</span><span className="lbl">목차</span></button>
        <div className="search" role="search">
          <input id="gx-q" type="search" placeholder="문서, 용어, 도구 찾기" autoComplete="off" spellCheck={false} aria-label="지식 은하 검색" />
          <kbd>/</kbd>
          <div className="hits" id="gx-hits" role="listbox" />
        </div>
        <button className="tbtn tico" id="gx-theme" aria-label="밝은·어두운 화면 전환" aria-pressed="true">&#9790;</button>
        <nav className="links">
          {links!.map((l) => <a key={l.key} href="#" data-nav={l.key}>{l.label}</a>)}
        </nav>
      </header>

      <section id="gx-hero" aria-labelledby="gx-hero-h">
        <p className="kick">{owner ? `${owner}의 지식 전체를 하나의 그래프로` : 'INDEX 지식 전체를 하나의 그래프로'}</p>
        <h1 id="gx-hero-h">{owner ? `${owner}의 지식 은하` : '주거 실내건축 전문가의 지식 은하'}</h1>
        <p className="lede">{owner ? `${owner}이(가) 직접 올리고 다듬어 온 자료와 문서, 용어의 연결입니다. 개인 AI는 이 지식을 근거로 답합니다.` : '설계·공간, 시공·자재, 법규·하자, 현장·협업의 문서와 용어, 그리고 INDEX AI 도구까지. 협회가 검수하며 쌓아 가는 지식입니다.'}</p>
        <p className="lede2">문서, 용어, 도구가 하나하나 버블입니다. 선은 문서 사이의 실제 연결입니다. 하나를 누르면 무엇에 기대고 있는지 보입니다.</p>
        <div className="paths" id="gx-paths" />
        <div className="stats" id="gx-stats" />
        <p className="hint"><span>드래그</span> 회전 <span>스크롤</span> 확대 <span>클릭</span> 열기 <span>esc</span> 뒤로</p>
        <p className="by">{owner ? `${owner} · INDEX 개인 지식 공간` : 'INDEX · 한국실내건축가협회'}</p>
      </section>

      <aside id="gx-info" aria-live="polite" aria-label="선택한 항목" />

      <aside id="gx-reader" aria-label="문서 읽기">
        <div className="rbar">
          <button className="rback" id="gx-r-graph" title="그래프로 (Esc)">&larr; <span>그래프</span></button>
          <div className="rcrumb" id="gx-r-crumb" />
          <button className="rx" id="gx-r-close" title="닫기 (Esc)" aria-label="문서 닫기">&times;</button>
        </div>
        <div className="rscroll" id="gx-r-scroll"><article className="prose" id="gx-r-body" /></div>
      </aside>

      <aside id="gx-contents" aria-label="목차"><div className="cin" id="gx-c-body" /></aside>

      <div className="dock">
        <div className="layers" id="gx-layers" role="group" aria-label="레이어 보이기·숨기기" />
        <div className="ctl">
          <button className="tbtn" id="gx-spin" title="회전 멈추기" aria-pressed="true">&#10227;</button>
          <button className="tbtn" id="gx-home" title="전체 지도">&#8962;</button>
        </div>
      </div>

      <div id="gx-boot"><div><b><span className="logo">index</span> {owner ? `${owner} ` : ''}지식 은하</b><i>지도를 그리는 중…</i></div></div>
    </div>
  );
}
