import { lazy, Suspense, Component, type ReactNode } from 'react';
import type { GraphEdgeData, GraphLayoutParams, GraphNodeData, GraphTheme } from './graph-model';
import './GraphView.css';
export type { GraphEdgeData, GraphNodeData } from './graph-model';
export type GraphViewProps = { nodes: GraphNodeData[]; edges: GraphEdgeData[]; selectedId: string | null; onSelect: (id: string | null) => void; params?: Partial<GraphLayoutParams>; search?: string; showLabels?: boolean; theme?: GraphTheme; showSettings?: boolean; onLibrary?: () => void; onWarroom?: () => void; onCreate?: () => void; onAsk?: () => void; compact?: boolean };
const GalaxyGraph = lazy(() => import('./GalaxyGraph'));
class GraphBoundary extends Component<{children:ReactNode}, {failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed ? <div className="knowledge-graph__error" role="alert">3D 그래프를 열지 못했습니다. 페이지를 새로고침하거나 WebGL을 지원하는 브라우저에서 열어 주세요.</div> : this.props.children;}
}
export function GraphView(props:GraphViewProps){return <GraphBoundary><Suspense fallback={<div className="knowledge-graph__loading">지식 은하를 불러오는 중…</div>}><GalaxyGraph {...props}/></Suspense></GraphBoundary>;}
