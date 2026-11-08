/**
 * 지식 흐름 — the knowledge connection view of a wiki entry (no 업무구조도 needed):
 * documents that reference this entry (left) → this entry (centre) → documents it links to (right).
 *
 * Compact cards, smooth bezier links measured from the real card positions, and a light pulse
 * travelling along every link in its direction. Hovering a card lights its path; clicking opens it.
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { WikiPage } from '../../../../wiki/types';
import './KnowledgeFlow.css';

type Props = {
  page: WikiPage;
  incoming: WikiPage[];
  outgoing: WikiPage[];
  onNavigate: (id: string) => void;
};

type Path = { id: string; d: string; side: 'in' | 'out' };

const MAX_PER_SIDE = 10;

export default function KnowledgeFlow({ page, incoming, outgoing, onNavigate }: Props) {
  // A page that both references and is referenced shows once, on the outgoing side.
  const left = useMemo(() => incoming.filter((p) => !outgoing.some((o) => o.id === p.id)), [incoming, outgoing]);
  const right = outgoing;
  const [expanded, setExpanded] = useState(false);
  const shownLeft = useMemo(() => (expanded ? left : left.slice(0, MAX_PER_SIDE)), [expanded, left]);
  const shownRight = useMemo(() => (expanded ? right : right.slice(0, MAX_PER_SIDE)), [expanded, right]);
  const hidden = left.length - shownLeft.length + (right.length - shownRight.length);

  const wrap = useRef<HTMLDivElement>(null);
  const center = useRef<HTMLButtonElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const [paths, setPaths] = useState<Path[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<string | null>(null);

  useLayoutEffect(() => {
    const host = wrap.current;
    if (!host) return;
    const measure = () => {
      const box = host.getBoundingClientRect();
      const c = center.current?.getBoundingClientRect();
      if (!c) return;
      const cy = c.top + c.height / 2 - box.top;
      const next: Path[] = [];
      const spread = (i: number, n: number) => (n <= 1 ? 0 : (i / (n - 1) - 0.5) * Math.min(c.height - 24, 8 * n));
      shownLeft.forEach((p, i) => {
        const el = cards.current.get('in:' + p.id);
        if (!el) return;
        const r = el.getBoundingClientRect();
        const x1 = r.right - box.left, y1 = r.top + r.height / 2 - box.top;
        const x2 = c.left - box.left, y2 = cy + spread(i, shownLeft.length);
        const k = Math.max(40, (x2 - x1) * 0.55);
        next.push({ id: p.id, side: 'in', d: `M${x1},${y1} C${x1 + k},${y1} ${x2 - k},${y2} ${x2},${y2}` });
      });
      shownRight.forEach((p, i) => {
        const el = cards.current.get('out:' + p.id);
        if (!el) return;
        const r = el.getBoundingClientRect();
        const x1 = c.right - box.left, y1 = cy + spread(i, shownRight.length);
        const x2 = r.left - box.left, y2 = r.top + r.height / 2 - box.top;
        const k = Math.max(40, (x2 - x1) * 0.55);
        next.push({ id: p.id, side: 'out', d: `M${x1},${y1} C${x1 + k},${y1} ${x2 - k},${y2} ${x2},${y2}` });
      });
      setPaths(next);
      setSize({ w: box.width, h: box.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, [shownLeft, shownRight]);

  const card = (p: WikiPage, side: 'in' | 'out') => (
    <button
      key={p.id}
      ref={(el) => {
        if (el) cards.current.set(side + ':' + p.id, el);
        else cards.current.delete(side + ':' + p.id);
      }}
      type="button"
      className={'kf-card' + (hover === p.id ? ' is-hot' : '')}
      onMouseEnter={() => setHover(p.id)}
      onMouseLeave={() => setHover(null)}
      onFocus={() => setHover(p.id)}
      onBlur={() => setHover(null)}
      onClick={() => onNavigate(p.id)}
      title={p.title}
    >
      <span className="kf-card__title">{p.title}</span>
      <span className="kf-card__meta">{p.category}</span>
      <ArrowUpRight size={13} className="kf-card__go" aria-hidden />
    </button>
  );

  return (
    <div className={'kf' + (hover ? ' has-hover' : '')}>
      <div className="kf-head">
        <span>참조하는 문서 <b>{left.length}</b></span>
        <span>현재 항목</span>
        <span>연결한 문서 <b>{right.length}</b></span>
      </div>
      <div className="kf-stage" ref={wrap}>
        <svg className="kf-links" width={size.w} height={size.h} aria-hidden>
          <defs>
            <linearGradient id="kf-grad-in" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="var(--wk-text-4)" stopOpacity="0.25" />
              <stop offset="1" stopColor="var(--wk-accent)" stopOpacity="0.75" />
            </linearGradient>
            <linearGradient id="kf-grad-out" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="var(--wk-accent)" stopOpacity="0.75" />
              <stop offset="1" stopColor="var(--wk-ok)" stopOpacity="0.35" />
            </linearGradient>
          </defs>
          {paths.map((p, i) => (
            <g key={p.side + p.id} className={'kf-link' + (hover === p.id ? ' is-hot' : '')}>
              <path d={p.d} className="kf-link__base" stroke={`url(#kf-grad-${p.side})`} />
              <path d={p.d} className="kf-link__pulse" style={{ animationDelay: `${(i % 7) * -0.45}s` }} />
            </g>
          ))}
        </svg>

        <div className="kf-col kf-col--in">
          {shownLeft.length ? shownLeft.map((p) => card(p, 'in')) : <p className="kf-empty">이 항목을 참조하는 문서가 없습니다.</p>}
        </div>

        <div className="kf-col kf-col--center">
          <button type="button" ref={center} className="kf-core" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <span className="kf-core__eyebrow">현재 항목</span>
            <strong>{page.title}</strong>
            <span className="kf-core__meta">
              {page.category} · v{page.version}
            </span>
            <span className="kf-core__counts">
              <i>← {left.length}</i>
              <i>{right.length} →</i>
            </span>
          </button>
        </div>

        <div className="kf-col kf-col--out">
          {shownRight.length ? shownRight.map((p) => card(p, 'out')) : <p className="kf-empty">이 항목에서 연결한 문서가 없습니다.</p>}
        </div>
      </div>
      {hidden > 0 && (
        <button type="button" className="kf-more" onClick={() => setExpanded(true)}>
          연결 문서 {hidden}개 더 보기
        </button>
      )}
    </div>
  );
}
