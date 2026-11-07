import { useMemo } from 'react';
import { BookOpen, Files, Network, Plus } from 'lucide-react';
import { WIKI_CATEGORIES, type WikiDraft, type WikiPage } from '../../../wiki/types';
import { encyclopediaDraft } from '../../../wiki/encyclopedia';
import { registryRecords } from '../../../wiki/registry';
import RegistryCatalog from './korea100/RegistryCatalog';
import './korea100/index-adapter.css';

type Props = { pages: WikiPage[]; query: string; onQuery: (query: string) => void; onNavigate: (id: string) => void; onCreate: (draft: WikiDraft) => void; onLibrary: () => void; onGraph: () => void; onWarroom: () => void };
export function WikiEncyclopedia({pages,query,onQuery,onCreate,onLibrary,onGraph,onWarroom}:Props) {
  const records = useMemo(()=>registryRecords(pages),[pages]);
  const categories = useMemo(()=>[...new Set([...WIKI_CATEGORIES,...records.map(r=>r.category)])],[records]);
  return <div className="wk-korea100-scope wk-registry-home" data-source-layout="korea100">
    <header className="wk-registry-masthead"><div><h1>INDEX 지식 대장</h1><p>주거 실내건축 전문가의 공동 지식 자산</p></div><nav aria-label="지식 탐색"><button className="kr-command kr-command--primary" aria-current="page"><BookOpen size={14}/>지식 대장</button><button className="kr-command" onClick={onWarroom}>지식 현황판</button><button className="kr-command" onClick={onGraph}><Network size={14}/>지식 그래프</button><button className="kr-command" onClick={onLibrary}><Files size={14}/>자료 라이브러리</button><button className="kr-command" onClick={()=>onCreate(encyclopediaDraft())}><Plus size={14}/>새 항목</button></nav></header>
    <RegistryCatalog institutions={records} categoryOrder={categories} query={query} onQuery={onQuery}/>
    <footer className="kr-adaptation-footer"><span>INDEX WIKI · 문서 · 근거 · 관계 · 편집 이력</span><a href="https://github.com/hosungseo/korea100" target="_blank" rel="noreferrer">Korea100 소스 기반 · © 2026 Hoseong Seo · MIT</a></footer>
  </div>;
}
