'use client';

import { Component, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ControlsContainer, SigmaContainer, ZoomControl, useRegisterEvents, useSigma } from '@react-sigma/core';
import { DEFAULT_STYLES } from 'sigma';
import type { SigmaOptions } from 'sigma/types';
import ForceAtlas2Worker from 'graphology-layout-forceatlas2/worker';
import { Pause, Play, Search, Settings2, X } from 'lucide-react';
import { applyGraphFocus, buildKnowledgeGraph, categoryColor, graphLayoutSettings,
  type GraphEdgeData, type GraphLayoutParams, type GraphNodeData, type GraphTheme } from './graph-model';
import '@react-sigma/core/lib/style.css';
import './GraphView.css';
export type { GraphEdgeData, GraphNodeData } from './graph-model';

type Props = { nodes: GraphNodeData[]; edges: GraphEdgeData[]; selectedId: string | null; onSelect: (id: string | null) => void;
  params?: Partial<GraphLayoutParams>; search?: string; showLabels?: boolean; theme?: GraphTheme; showSettings?: boolean };
class GraphBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="knowledge-graph__error" role="alert">그래프를 불러오지 못했습니다. 새로고침 후에도 계속되면 브라우저의 WebGL 지원을 확인해 주세요.</div> : this.props.children; }
}
function GraphController({ selectedId, onSelect, search = '', params }: Pick<Props, 'selectedId' | 'onSelect' | 'search' | 'params'>) {
  const sigma = useSigma();
  const registerEvents = useRegisterEvents();
  const [hovered, setHovered] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const workerRef = useRef<ForceAtlas2Worker | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repulsion = params?.repulsion, springLength = params?.springLength, centerStrength = params?.centerStrength;
  function stop() {
    if (timerRef.current) clearTimeout(timerRef.current);
    workerRef.current?.stop(); sigma.setSetting('autoRescale', 'once'); setRunning(false);
  }
  function start() {
    sigma.setSetting('autoRescale', true); workerRef.current?.start(); setRunning(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(stop, 1800);
  }
  useEffect(() => {
    const graph = sigma.getGraph();
    if (graph.order < 2) return;
    const worker = new ForceAtlas2Worker(graph, { settings: graphLayoutSettings(graph, { repulsion, springLength, centerStrength }) });
    workerRef.current = worker;
    sigma.setSetting('autoRescale', true); worker.start(); setRunning(true);
    timerRef.current = setTimeout(() => { worker.stop(); sigma.setSetting('autoRescale', 'once'); setRunning(false); }, 1800);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); worker.kill(); workerRef.current = null; };
  }, [sigma, repulsion, springLength, centerStrength]);
  useEffect(() => {
    registerEvents({ clickNode: ({ node }) => onSelect(node), clickStage: () => onSelect(null),
      enterNode: ({ node }) => setHovered(node), leaveNode: () => setHovered(null),
      downNode: () => { workerRef.current?.stop(); sigma.setSetting('autoRescale', 'once'); setRunning(false); },
    });
  }, [registerEvents, sigma, onSelect]);
  useEffect(() => { sigma.refresh(); applyGraphFocus(sigma.getGraph(), selectedId, hovered, search); }, [sigma, selectedId, hovered, search]);
  return <ControlsContainer position="bottom-left"><ZoomControl labels={{ zoomIn: '확대', zoomOut: '축소', reset: '전체 보기' }} /><div className="react-sigma-control"><button title={running ? '배치 일시정지' : '다시 배치'} aria-label={running ? '배치 일시정지' : '다시 배치'} onClick={() => running ? stop() : start()}>{running ? <Pause size={15} /> : <Play size={15} />}</button></div></ControlsContainer>;
}
export function GraphView({ nodes, edges, selectedId, onSelect, params, search = '', showLabels = true, theme = 'dark', showSettings = true }: Props) {
  const listId = useId();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showOrphans, setShowOrphans] = useState(true);
  const [colorGroups, setColorGroups] = useState(false);
  const [labels, setLabels] = useState(true);
  const [listOpen, setListOpen] = useState(false);
  const [listQuery, setListQuery] = useState('');
  const [nodeScale, setNodeScale] = useState(1);
  const [linkScale, setLinkScale] = useState(1);
  const graph = useMemo(() => buildKnowledgeGraph(nodes, edges, showOrphans), [nodes, edges, showOrphans]);
  const options = useMemo<SigmaOptions>(() => {
    const dark = theme === 'dark';
    return { settings: { enableNodeDrag: true, autoRescale: true, itemSizesReference: 'screen', stagePadding: 80, renderLabels: showLabels && labels, renderEdgeLabels: false,
      labelDensity: 1.2, labelGridCellSize: 100, labelRenderedSizeThreshold: 2, nodePickingPadding: 8, enableCameraRotation: false,
      minCameraRatio: 0.06, maxCameraRatio: 4, allowInvalidContainer: true, nodeLabelEvents: 'extend' },
      styles: { nodes: [DEFAULT_STYLES.nodes, { size: data => Number(data.size) * nodeScale,
        color: (data, state) => data.active || state.isHovered || state.isDragged ? '#b59cf2' : colorGroups ? categoryColor(String(data.category)) : dark ? '#aaabb4' : '#626674',
        opacity: data => data.dimmed ? 0.12 : 1, labelColor: data => data.active ? (dark ? '#ede8ff' : '#302450') : dark ? '#a6a6b0' : '#586072',
        labelSize: 12, labelPosition: 'right', labelFont: 'system-ui, sans-serif',
        labelVisibility: data => !showLabels || !labels || data.dimmed ? 'hidden' : data.active ? 'visible' : 'auto',
        backdropVisibility: 'hidden', cursor: 'pointer' }],
        edges: [DEFAULT_STYLES.edges, { color: data => data.active ? (dark ? '#a18bc6' : '#8870af') : dark ? '#45454e' : '#c7c9d2',
          opacity: data => data.dimmed ? 0.08 : data.active ? 0.9 : 0.65, size: data => (data.active ? 0.95 : 0.55) * linkScale, labelVisibility: 'hidden' }],
      },
    };
  }, [theme, showLabels, labels, colorGroups, nodeScale, linkScale]);
  const listed = useMemo(() => nodes.filter(node => graph.hasNode(node.id) && node.label.toLocaleLowerCase().includes(listQuery.trim().toLocaleLowerCase())).sort((a, b) => a.label.localeCompare(b.label, 'ko')), [nodes, graph, listQuery]);
  return <div className={'knowledge-graph knowledge-graph--' + theme} data-graph-engine="sigma-graphology-forceatlas2">
    <GraphBoundary><SigmaContainer className="knowledge-graph__renderer" graph={graph} options={options}>
      <GraphController selectedId={selectedId} onSelect={onSelect} search={search} params={params} />
    </SigmaContainer></GraphBoundary>
    <div className="knowledge-graph__actions"><button aria-label="문서 노드 목록" aria-expanded={listOpen} aria-controls={listId} title="문서 목록" onClick={() => setListOpen(value => !value)}><Search size={17} /></button>{showSettings && <button aria-label="그래프 설정" aria-expanded={settingsOpen} title="그래프 설정" onClick={() => setSettingsOpen(value => !value)}><Settings2 size={17} /></button>}</div>
    {settingsOpen && <section className="knowledge-graph__settings" aria-label="그래프 표시 설정"><h3>필터</h3><label><input type="checkbox" checked={showOrphans} onChange={event => setShowOrphans(event.target.checked)} />연결 없는 문서 표시</label><h3>그룹</h3><label><input type="checkbox" checked={colorGroups} onChange={event => setColorGroups(event.target.checked)} />분야별 색상</label><h3>표시</h3><label><input type="checkbox" checked={labels} onChange={event => setLabels(event.target.checked)} />문서 이름 표시</label><label>노드 크기<input type="range" aria-label="노드 크기" min="0.5" max="2" step="0.1" value={nodeScale} onChange={event => setNodeScale(Number(event.target.value))} /></label><label>연결선 두께<input type="range" aria-label="연결선 두께" min="0.3" max="2" step="0.1" value={linkScale} onChange={event => setLinkScale(Number(event.target.value))} /></label></section>}
    {search.trim() && !nodes.some(node => node.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) && <p className="knowledge-graph__notice" role="status">일치하는 문서가 없습니다.</p>}
    {listOpen && <section id={listId} className="knowledge-graph__nodes" aria-label="문서 노드 목록"><header><strong>문서 {graph.order}</strong><button aria-label="문서 목록 닫기" onClick={() => setListOpen(false)}><X size={16} /></button></header><input autoFocus aria-label="문서 노드 검색" placeholder="문서 찾기…" value={listQuery} onChange={event => setListQuery(event.target.value)} /><div>{listed.map(node => <button key={node.id} onClick={() => { onSelect(node.id); setListOpen(false); }}>{node.label}</button>)}</div></section>}
  </div>;
}
