import { UndirectedGraph } from 'graphology';
import random from 'graphology-layout/random';
import forceAtlas2, { type ForceAtlas2Settings } from 'graphology-layout-forceatlas2';

export type GraphNodeData = { id: string; label: string; type: string; status: string };
export type GraphEdgeData = { id: string; sourceNodeId: string; targetNodeId: string; relationType: string; status: string };
export type GraphLayoutParams = { repulsion: number; springLength: number; centerStrength: number };
export type GraphTheme = 'light' | 'dark';
export type KnowledgeGraph = UndirectedGraph;
const PALETTE = ['#a998e5', '#80b7a3', '#c7a67a', '#91a8cc', '#ba97ad', '#a5b47f'];
export function categoryColor(category: string) {
  let hash = 0;
  for (const letter of category) hash = (hash * 31 + letter.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}
export function buildKnowledgeGraph(nodes: GraphNodeData[], edges: GraphEdgeData[], showOrphans = true) {
  const graph = new UndirectedGraph({ allowSelfLoops: false });
  for (const node of nodes) if (!graph.hasNode(node.id)) graph.addNode(node.id, { label: node.label, category: node.type, status: node.status });
  for (const edge of edges) {
    if (edge.sourceNodeId === edge.targetNodeId || !graph.hasNode(edge.sourceNodeId) || !graph.hasNode(edge.targetNodeId) || graph.hasEdge(edge.sourceNodeId, edge.targetNodeId)) continue;
    graph.addUndirectedEdge(edge.sourceNodeId, edge.targetNodeId, { relation: edge.relationType, size: 0.6, weight: 1 });
  }
  if (!showOrphans) for (const id of graph.nodes()) if (graph.degree(id) === 0) graph.dropNode(id);
  graph.updateEachNodeAttributes((id, data) => ({ ...data, size: Math.min(8, 3.5 + Math.sqrt(graph.degree(id)) * 1.15), active: false, dimmed: false }));
  // Initial placement and every subsequent force step come from Graphology libraries.
  random.assign(graph, { scale: 100 });
  return graph;
}
export function graphLayoutSettings(graph: KnowledgeGraph, params: Partial<GraphLayoutParams> = {}): ForceAtlas2Settings {
  return { ...forceAtlas2.inferSettings(graph), adjustSizes: true, barnesHutOptimize: graph.order > 250,
    scalingRatio: Math.max(1, (params.repulsion ?? 5200) / 5200 * 10 * (params.springLength ?? 110) / 110),
    gravity: Math.max(0.01, (params.centerStrength ?? 0.015) / 0.015), strongGravityMode: true, slowDown: 5,
  };
}
export function applyGraphFocus(graph: KnowledgeGraph, selectedId: string | null, hoveredId: string | null, search: string) {
  const focusedId = hoveredId || selectedId;
  const query = search.trim().normalize('NFC').toLocaleLowerCase();
  const matches = new Set(focusedId && graph.hasNode(focusedId) ? [focusedId] : graph.nodes().filter(id => query && String(graph.getNodeAttribute(id, 'label')).normalize('NFC').toLocaleLowerCase().includes(query)));
  const visible = new Set(matches);
  for (const id of matches) for (const neighbor of graph.neighbors(id)) visible.add(neighbor);
  const filtering = Boolean(focusedId || query);
  graph.updateEachNodeAttributes((id, data) => ({ ...data, active: matches.has(id), dimmed: filtering && !visible.has(id) }));
  graph.updateEachEdgeAttributes((_edge, data, source, target) => ({ ...data, active: filtering && (matches.has(source) || matches.has(target)), dimmed: filtering && !(visible.has(source) && visible.has(target)) }));
}
