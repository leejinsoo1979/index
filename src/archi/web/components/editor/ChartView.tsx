'use client';

import type { ChartContent } from '@archi/editor';

/**
 * 모노톤(화이트&블랙) SVG 차트 렌더러. 외부 차트 라이브러리 없이 렌더링한다.
 */

const W = 560;
const H = 280;
const PAD = { top: 28, right: 16, bottom: 40, left: 44 };

// 그레이스케일 시리즈 색상
const SERIES_SHADES = ['#18181b', '#52525b', '#8a8a92', '#b8b8bf', '#d9d9de'];

export function ChartView({ content }: { content: ChartContent }) {
  const series = content.series.filter((s) => s.values.length > 0);
  if (series.length === 0 || content.labels.length === 0) {
    return <p className="text-sm text-zinc-400">차트 데이터를 입력하세요.</p>;
  }
  return (
    <figure>
      {content.title && (
        <figcaption className="mb-1 text-sm font-semibold text-zinc-800">
          {content.title}
        </figcaption>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded-lg border border-zinc-200 bg-white">
        {content.chartType === 'pie' ? (
          <PieChart content={content} />
        ) : content.chartType === 'line' ? (
          <LineChart content={content} />
        ) : (
          <BarChart content={content} />
        )}
      </svg>
      {series.length > 1 && (
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-zinc-600">
          {series.map((s, i) => (
            <span key={i} className="flex items-center gap-1">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: SERIES_SHADES[i % SERIES_SHADES.length] }}
              />
              {s.name ?? `시리즈 ${i + 1}`}
            </span>
          ))}
        </div>
      )}
    </figure>
  );
}

function chartMax(content: ChartContent): number {
  const all = content.series.flatMap((s) => s.values);
  const max = Math.max(...all, 0);
  return max <= 0 ? 1 : max;
}

function Axes({ max }: { max: number }) {
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <g>
      {ticks.map((t) => {
        const y = PAD.top + (H - PAD.top - PAD.bottom) * (1 - t);
        return (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="#e4e4e7" strokeWidth={1} />
            <text x={PAD.left - 6} y={y + 3} textAnchor="end" fontSize={9} fill="#a1a1aa">
              {formatNumber(max * t)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function XLabels({ labels }: { labels: string[] }) {
  const innerW = W - PAD.left - PAD.right;
  return (
    <g>
      {labels.map((label, i) => {
        const x = PAD.left + (innerW * (i + 0.5)) / labels.length;
        return (
          <text key={i} x={x} y={H - PAD.bottom + 16} textAnchor="middle" fontSize={10} fill="#52525b">
            {label.slice(0, 8)}
          </text>
        );
      })}
    </g>
  );
}

function BarChart({ content }: { content: ChartContent }) {
  const max = chartMax(content);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const groupW = innerW / content.labels.length;
  const barW = Math.min((groupW * 0.7) / content.series.length, 48);

  return (
    <g>
      <Axes max={max} />
      {content.labels.map((_, li) =>
        content.series.map((s, si) => {
          const value = s.values[li] ?? 0;
          const h = (Math.max(value, 0) / max) * innerH;
          const x =
            PAD.left + groupW * li + (groupW - barW * content.series.length) / 2 + barW * si;
          return (
            <rect
              key={`${li}-${si}`}
              x={x}
              y={PAD.top + innerH - h}
              width={barW - 2}
              height={h}
              fill={SERIES_SHADES[si % SERIES_SHADES.length]}
              rx={2}
            />
          );
        }),
      )}
      <XLabels labels={content.labels} />
    </g>
  );
}

function LineChart({ content }: { content: ChartContent }) {
  const max = chartMax(content);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  return (
    <g>
      <Axes max={max} />
      {content.series.map((s, si) => {
        const points = content.labels.map((_, li) => {
          const value = s.values[li] ?? 0;
          const x = PAD.left + (innerW * (li + 0.5)) / content.labels.length;
          const y = PAD.top + innerH - (Math.max(value, 0) / max) * innerH;
          return { x, y };
        });
        const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
        const shade = SERIES_SHADES[si % SERIES_SHADES.length];
        return (
          <g key={si}>
            <path d={d} fill="none" stroke={shade} strokeWidth={2} />
            {points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={3} fill="#ffffff" stroke={shade} strokeWidth={2} />
            ))}
          </g>
        );
      })}
      <XLabels labels={content.labels} />
    </g>
  );
}

function PieChart({ content }: { content: ChartContent }) {
  // 파이는 첫 번째 시리즈만 사용
  const values = content.series[0]?.values ?? [];
  const total = values.reduce((sum, v) => sum + Math.max(v, 0), 0) || 1;
  const cx = W / 2 - 70;
  const cy = H / 2;
  const r = Math.min(W, H) / 2 - 36;

  let angle = -Math.PI / 2;
  const slices = content.labels.map((label, i) => {
    const value = Math.max(values[i] ?? 0, 0);
    const sweep = (value / total) * Math.PI * 2;
    const start = angle;
    angle += sweep;
    return { label, value, start, end: angle };
  });

  return (
    <g>
      {slices.map((slice, i) => {
        const large = slice.end - slice.start > Math.PI ? 1 : 0;
        const x1 = cx + r * Math.cos(slice.start);
        const y1 = cy + r * Math.sin(slice.start);
        const x2 = cx + r * Math.cos(slice.end);
        const y2 = cy + r * Math.sin(slice.end);
        return (
          <path
            key={i}
            d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`}
            fill={SERIES_SHADES[i % SERIES_SHADES.length]}
            stroke="#ffffff"
            strokeWidth={1.5}
          />
        );
      })}
      {slices.map((slice, i) => {
        const pct = Math.round((slice.value / total) * 100);
        const y = 40 + i * 18;
        return (
          <g key={`legend-${i}`}>
            <rect x={W - 170} y={y - 9} width={10} height={10} fill={SERIES_SHADES[i % SERIES_SHADES.length]} rx={2} />
            <text x={W - 154} y={y} fontSize={11} fill="#3f3f46">
              {slice.label.slice(0, 10)} ({pct}%)
            </text>
          </g>
        );
      })}
    </g>
  );
}

function formatNumber(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
