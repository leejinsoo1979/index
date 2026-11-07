/**
 * 그래프 뷰어용 간단 radial 레이아웃.
 * 타입별로 각도 영역을 나누고, 같은 타입의 노드를 인접 배치한다.
 */

export type LayoutNode = {
  id: string;
  type: string;
};

export type NodePosition = {
  x: number;
  y: number;
};

export function computeRadialLayout(
  nodes: LayoutNode[],
  options?: { width?: number; height?: number; radiusRatio?: number },
): Map<string, NodePosition> {
  const width = options?.width ?? 800;
  const height = options?.height ?? 600;
  const cx = width / 2;
  const cy = height / 2;
  const radius = (Math.min(width, height) / 2) * (options?.radiusRatio ?? 0.78);

  const positions = new Map<string, NodePosition>();
  if (nodes.length === 0) return positions;
  if (nodes.length === 1) {
    positions.set(nodes[0]!.id, { x: cx, y: cy });
    return positions;
  }

  // 타입별 정렬로 같은 타입이 인접 호(arc)에 모이게 한다
  const sorted = [...nodes].sort((a, b) =>
    a.type === b.type ? a.id.localeCompare(b.id) : a.type.localeCompare(b.type),
  );

  sorted.forEach((node, index) => {
    const angle = (2 * Math.PI * index) / sorted.length - Math.PI / 2;
    // 안쪽/바깥쪽 교차 배치로 라벨 겹침을 줄인다
    const r = sorted.length > 12 && index % 2 === 1 ? radius * 0.62 : radius;
    positions.set(node.id, {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  });

  return positions;
}
