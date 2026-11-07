/**
 * 옵시디언 그래프 뷰 스타일의 force-directed 시뮬레이션.
 * 외부 의존성 없이 순수 함수로 구현 (반발력 + 스프링 + 중심 인력 + 감쇠).
 */

export type SimNode = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 드래그 중 고정 좌표 */
  fx: number | null;
  fy: number | null;
  degree: number;
};

export type SimEdge = { sourceId: string; targetId: string };

export type SimParams = {
  width: number;
  height: number;
  /** 노드 간 반발 강도 */
  repulsion: number;
  /** 엣지 스프링 목표 길이 */
  springLength: number;
  springStrength: number;
  centerStrength: number;
  damping: number;
};

export const DEFAULT_SIM_PARAMS: SimParams = {
  width: 900,
  height: 600,
  repulsion: 5200,
  springLength: 110,
  springStrength: 0.04,
  centerStrength: 0.015,
  damping: 0.82,
};

/** 결정적 초기 배치 (id 해시 기반 나선형) — 매 로드마다 동일한 시작 상태 */
export function initSimNodes(
  nodes: { id: string }[],
  edges: SimEdge[],
  params: Pick<SimParams, 'width' | 'height'>,
): SimNode[] {
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.sourceId, (degree.get(edge.sourceId) ?? 0) + 1);
    degree.set(edge.targetId, (degree.get(edge.targetId) ?? 0) + 1);
  }
  const cx = params.width / 2;
  const cy = params.height / 2;
  return nodes.map((node, i) => {
    const hash = hashString(node.id);
    const angle = (hash % 360) * (Math.PI / 180);
    const radius = 40 + (i % 7) * 36 + (hash % 23);
    return {
      id: node.id,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      vx: 0,
      vy: 0,
      fx: null,
      fy: null,
      degree: degree.get(node.id) ?? 0,
    };
  });
}

/** 한 스텝 진행. alpha(0~1)는 힘 크기 배율로, 점차 줄여 안정화한다 */
export function simTick(nodes: SimNode[], edges: SimEdge[], alpha: number, params: SimParams): void {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const cx = params.width / 2;
  const cy = params.height / 2;

  // 반발력 (O(n^2) — 수백 노드까지는 충분)
  for (let i = 0; i < nodes.length; i += 1) {
    const a = nodes[i]!;
    for (let j = i + 1; j < nodes.length; j += 1) {
      const b = nodes[j]!;
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let distSq = dx * dx + dy * dy;
      if (distSq < 1) {
        // 완전히 겹친 경우 결정적으로 밀어낸다
        dx = ((i - j) % 3) + 0.5;
        dy = ((i + j) % 3) - 0.5;
        distSq = dx * dx + dy * dy;
      }
      const force = (params.repulsion * alpha) / distSq;
      const dist = Math.sqrt(distSq);
      const fxv = (dx / dist) * force;
      const fyv = (dy / dist) * force;
      a.vx += fxv;
      a.vy += fyv;
      b.vx -= fxv;
      b.vy -= fyv;
    }
  }

  // 엣지 스프링
  for (const edge of edges) {
    const source = byId.get(edge.sourceId);
    const target = byId.get(edge.targetId);
    if (!source || !target) continue;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const stretch = (dist - params.springLength) * params.springStrength * alpha;
    const fxv = (dx / dist) * stretch;
    const fyv = (dy / dist) * stretch;
    source.vx += fxv;
    source.vy += fyv;
    target.vx -= fxv;
    target.vy -= fyv;
  }

  // 중심 인력 + 적분 + 감쇠
  for (const node of nodes) {
    node.vx += (cx - node.x) * params.centerStrength * alpha;
    node.vy += (cy - node.y) * params.centerStrength * alpha;
    node.vx *= params.damping;
    node.vy *= params.damping;
    if (node.fx != null && node.fy != null) {
      node.x = node.fx;
      node.y = node.fy;
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.x += node.vx;
    node.y += node.vy;
  }
}

function hashString(value: string): number {
  let h = 5381;
  for (let i = 0; i < value.length; i += 1) {
    h = (h * 33) ^ value.charCodeAt(i);
  }
  return Math.abs(h);
}
