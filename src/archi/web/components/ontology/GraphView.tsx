'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_SIM_PARAMS,
  initSimNodes,
  simTick,
  type SimEdge,
  type SimNode,
  type SimParams,
} from '@archi/ontology';

export type GraphNodeData = {
  id: string;
  label: string;
  type: string;
  status: string;
};

export type GraphEdgeData = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationType: string;
  status: string;
};

const W = DEFAULT_SIM_PARAMS.width;
const H = DEFAULT_SIM_PARAMS.height;

type Props = {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** 옵시디언 설정 패널의 '힘' 슬라이더 값 */
  params?: Partial<SimParams>;
  /** 검색 필터: 일치하지 않는 노드는 흐려진다 */
  search?: string;
  /** 라벨 항상 표시 여부 */
  showLabels?: boolean;
};

/**
 * 옵시디언 그래프 뷰 스타일 뷰어:
 * 다크 캔버스 + force-directed 레이아웃 + 노드 드래그 + 휠 줌/배경 팬 + 이웃 하이라이트.
 * 노드 크기는 연결 수에 비례한다.
 */
export function GraphView({
  nodes,
  edges,
  selectedId,
  onSelect,
  params,
  search,
  showLabels = true,
}: Props) {
  const simParams = useMemo<SimParams>(() => ({ ...DEFAULT_SIM_PARAMS, ...params }), [params]);
  const svgRef = useRef<SVGSVGElement>(null);
  const simNodesRef = useRef<SimNode[]>([]);
  const alphaRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const [, setFrame] = useState(0);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const dragRef = useRef<
    | { kind: 'node'; id: string }
    | { kind: 'pan'; startX: number; startY: number; viewX: number; viewY: number }
    | null
  >(null);

  const simEdges = useMemo<SimEdge[]>(
    () => edges.map((e) => ({ sourceId: e.sourceNodeId, targetId: e.targetNodeId })),
    [edges],
  );

  const neighborIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const edge of edges) {
      if (!map.has(edge.sourceNodeId)) map.set(edge.sourceNodeId, new Set());
      if (!map.has(edge.targetNodeId)) map.set(edge.targetNodeId, new Set());
      map.get(edge.sourceNodeId)!.add(edge.targetNodeId);
      map.get(edge.targetNodeId)!.add(edge.sourceNodeId);
    }
    return map;
  }, [edges]);

  // 노드 목록 변경 시 시뮬레이션 초기화 (기존 위치는 유지)
  useEffect(() => {
    const existing = new Map(simNodesRef.current.map((n) => [n.id, n]));
    const fresh = initSimNodes(nodes, simEdges, { width: W, height: H });
    simNodesRef.current = fresh.map((node) => {
      const prev = existing.get(node.id);
      return prev ? { ...node, x: prev.x, y: prev.y } : node;
    });
    alphaRef.current = 1;
  }, [nodes, simEdges]);

  // 물리 루프: alpha가 식을 때까지 rAF로 진행
  useEffect(() => {
    let mounted = true;
    const loop = () => {
      if (!mounted) return;
      if (alphaRef.current > 0.02) {
        simTick(simNodesRef.current, simEdges, alphaRef.current, simParams);
        alphaRef.current *= dragRef.current?.kind === 'node' ? 1 : 0.985;
        setFrame((f) => f + 1);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [simEdges, simParams]);

  // 힘 파라미터가 바뀌면 시뮬레이션을 다시 데운다
  useEffect(() => {
    alphaRef.current = Math.max(alphaRef.current, 0.5);
  }, [simParams]);

  const toGraphCoords = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const sx = ((clientX - rect.left) / rect.width) * W;
      const sy = ((clientY - rect.top) / rect.height) * H;
      return { x: (sx - view.x) / view.k, y: (sy - view.y) / view.k };
    },
    [view],
  );

  function handleWheel(e: React.WheelEvent) {
    const factor = Math.exp(-e.deltaY * 0.0015);
    setView((prev) => {
      const k = Math.min(Math.max(prev.k * factor, 0.25), 4);
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { ...prev, k };
      const sx = ((e.clientX - rect.left) / rect.width) * W;
      const sy = ((e.clientY - rect.top) / rect.height) * H;
      // 커서 위치 고정 줌
      return {
        k,
        x: sx - ((sx - prev.x) / prev.k) * k,
        y: sy - ((sy - prev.y) / prev.k) * k,
      };
    });
  }

  function handlePointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      kind: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      viewX: view.x,
      viewY: view.y,
    };
  }

  function handleNodePointerDown(e: React.PointerEvent, nodeId: string) {
    e.stopPropagation();
    dragRef.current = { kind: 'node', id: nodeId };
    alphaRef.current = Math.max(alphaRef.current, 0.3);
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === 'node') {
      const point = toGraphCoords(e.clientX, e.clientY);
      const node = simNodesRef.current.find((n) => n.id === drag.id);
      if (node) {
        node.fx = point.x;
        node.fy = point.y;
        alphaRef.current = Math.max(alphaRef.current, 0.25);
      }
    } else {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const scaleX = W / rect.width;
      const scaleY = H / rect.height;
      setView((prev) => ({
        ...prev,
        x: drag.viewX + (e.clientX - drag.startX) * scaleX,
        y: drag.viewY + (e.clientY - drag.startY) * scaleY,
      }));
    }
  }

  function handlePointerUp() {
    const drag = dragRef.current;
    if (drag?.kind === 'node') {
      const node = simNodesRef.current.find((n) => n.id === drag.id);
      if (node) {
        node.fx = null;
        node.fy = null;
      }
      alphaRef.current = Math.max(alphaRef.current, 0.15);
    }
    dragRef.current = null;
  }

  const positions = new Map(simNodesRef.current.map((n) => [n.id, n]));
  const searchQuery = search?.trim().toLowerCase() ?? '';
  const searchSet = searchQuery
    ? new Set(nodes.filter((n) => n.label.toLowerCase().includes(searchQuery)).map((n) => n.id))
    : null;
  const highlightSet = hoveredId
    ? new Set([hoveredId, ...(neighborIds.get(hoveredId) ?? [])])
    : searchSet;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="h-full w-full cursor-grab touch-none select-none rounded-xl bg-[#16161f] active:cursor-grabbing"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onClick={() => onSelect(null)}
    >
      <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
        {edges.map((edge) => {
          const from = positions.get(edge.sourceNodeId);
          const to = positions.get(edge.targetNodeId);
          if (!from || !to) return null;
          const inHighlight =
            highlightSet &&
            (edge.sourceNodeId === hoveredId || edge.targetNodeId === hoveredId);
          return (
            <g key={edge.id}>
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={inHighlight ? '#e4e4e7' : '#3f3f46'}
                strokeWidth={inHighlight ? 1.6 / view.k : 1 / view.k}
                strokeOpacity={highlightSet && !inHighlight ? 0.15 : 0.7}
                strokeDasharray={edge.status === 'APPROVED' ? undefined : '3 3'}
              />
              {(inHighlight || view.k > 1.4) && (
                <text
                  x={(from.x + to.x) / 2}
                  y={(from.y + to.y) / 2 - 4 / view.k}
                  textAnchor="middle"
                  fontSize={9 / view.k}
                  fill="#71717a"
                >
                  {edge.relationType}
                </text>
              )}
            </g>
          );
        })}

        {nodes.map((node) => {
          const pos = positions.get(node.id);
          if (!pos) return null;
          const r = (4 + Math.sqrt(pos.degree + 1) * 3.2) / Math.sqrt(view.k);
          const isSelected = selectedId === node.id;
          const isHovered = hoveredId === node.id;
          const dimmed = highlightSet ? !highlightSet.has(node.id) : false;
          const fill = node.status === 'APPROVED' ? '#fafafa' : '#8a8a92';
          return (
            <g
              key={node.id}
              className="cursor-pointer"
              opacity={dimmed ? 0.25 : 1}
              onPointerDown={(e) => handleNodePointerDown(e, node.id)}
              onPointerEnter={() => setHoveredId(node.id)}
              onPointerLeave={() => setHoveredId(null)}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(node.id);
              }}
            >
              {(isSelected || isHovered) && (
                <circle cx={pos.x} cy={pos.y} r={r + 5 / view.k} fill="#fafafa" fillOpacity={0.12} />
              )}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={r}
                fill={fill}
                stroke={isSelected ? '#ffffff' : 'none'}
                strokeWidth={2 / view.k}
              />
              {(showLabels || isHovered || isSelected) && (
                <text
                  x={pos.x}
                  y={pos.y + r + 11 / view.k}
                  textAnchor="middle"
                  fontSize={10 / Math.sqrt(view.k)}
                  fill="#a1a1aa"
                  opacity={isHovered || isSelected || view.k > 0.8 ? 1 : 0.55}
                >
                  {node.label}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
