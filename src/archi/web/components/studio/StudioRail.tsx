/**
 * Shared 60px icon rail for Agent Studio and the INDEX wiki — one navigation frame for both.
 *
 * Uses the wiki's `.wk-rail` class names (other stylesheets such as korea100/index-adapter.css
 * target them) and adds `.st-rail` for the shared extras (hover labels, readable active state).
 * The wiki can pass `wikiView` + `onWikiView` so its unsaved-draft guard runs before switching views;
 * everywhere else the wiki entries are plain links to /agent-studio/wiki?view=….
 */
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Library,
  MessageSquare,
  Network,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import './StudioRail.css';

export type WikiView = 'warroom' | 'encyclopedia' | 'library' | 'graph';

type Props = {
  /** Current wiki view when rendered by the wiki itself. */
  wikiView?: WikiView | null;
  /** Wiki-provided handler (e.g. to confirm unsaved edits). Return false to cancel. */
  onWikiView?: (view: WikiView) => void;
  /** Brand link target; the wiki uses its context link. */
  brandTo?: string;
  brandLabel?: string;
};

const BASE = '/agent-studio';

const WIKI_ITEMS: { view: WikiView; label: string; icon: ReactNode }[] = [
  { view: 'warroom', label: '지식 현황판', icon: <Activity size={21} /> },
  { view: 'encyclopedia', label: '백과사전', icon: <BookOpen size={21} /> },
  { view: 'library', label: '지식 라이브러리', icon: <Library size={21} /> },
  { view: 'graph', label: '지식 은하', icon: <Network size={21} /> },
];

function activeKey(pathname: string, search: string, wikiView?: WikiView | null): string {
  const rest = pathname.startsWith(BASE) ? pathname.slice(BASE.length).replace(/^\/+/, '') : pathname;
  const head = rest.split('/')[0] ?? '';
  if (head === 'wiki') {
    if (wikiView) return `wiki:${wikiView}`;
    const params = new URLSearchParams(search);
    const view = params.get('view');
    if (view === 'warroom' || view === 'encyclopedia' || view === 'library' || view === 'graph') return `wiki:${view}`;
    if (params.get('page')) return 'wiki:encyclopedia';
    return 'wiki:graph';
  }
  if (head === 'sources' || head === 'knowledge') return 'sources';
  if (head === 'messenger') return 'messenger';
  if (head === 'ontology') return 'wiki:graph'; // ontology was merged into the knowledge galaxy
  if (head === 'settings') return 'settings';
  return 'studio'; // studio home and document editor (/agent-studio/:documentId)
}

export function StudioRail({ wikiView, onWikiView, brandTo = '/ai', brandLabel = 'INDEX AI' }: Props) {
  const { pathname, search } = useLocation();
  const { user } = useAuth();
  const active = activeKey(pathname, search, wikiView);
  const initial = (user?.email || user?.displayName || 'I').slice(0, 1).toUpperCase();

  const linkClass = (key: string) => (active === key ? 'is-active' : undefined);

  return (
    <nav className="wk-rail st-rail" aria-label="스튜디오 바로가기">
      <Link to={brandTo} className="wk-brand" aria-label={brandLabel}>
        i<span>.</span>
      </Link>

      <div className="wk-rail-links">
        {WIKI_ITEMS.map((item) =>
          onWikiView ? (
            <button
              key={item.view}
              type="button"
              className={linkClass(`wiki:${item.view}`)}
              onClick={() => onWikiView(item.view)}
              data-label={item.label}
              aria-label={item.label}
              aria-current={active === `wiki:${item.view}` ? 'page' : undefined}
            >
              {item.icon}
            </button>
          ) : (
            <Link
              key={item.view}
              to={`${BASE}/wiki?view=${item.view}`}
              className={linkClass(`wiki:${item.view}`)}
              data-label={item.label}
              aria-label={item.label}
              aria-current={active === `wiki:${item.view}` ? 'page' : undefined}
            >
              {item.icon}
            </Link>
          ),
        )}

        <span className="st-rail__sep" aria-hidden />

        <Link to={BASE} className={linkClass('studio')} data-label="Agent Studio · 문서" aria-label="Agent Studio 문서">
          <Sparkles size={20} />
        </Link>
        <Link to={`${BASE}/messenger`} className={linkClass('messenger')} data-label="메신저 · 작업" aria-label="메신저">
          <MessageSquare size={20} />
        </Link>
      </div>

      <div className="wk-rail-bottom">
        <Link to={`${BASE}/settings`} className={linkClass('settings')} data-label="설정" aria-label="스튜디오 설정">
          <Settings2 size={19} />
        </Link>
        <Link to="/admin" data-label="관리자 대시보드" aria-label="관리자 대시보드">
          <ArrowLeft size={19} />
        </Link>
        <span className="wk-avatar" title={user?.email ?? ''}>
          {initial}
        </span>
      </div>
    </nav>
  );
}

export default StudioRail;
