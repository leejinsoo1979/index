import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D, { type ForceGraphMethods, type NodeObject, type LinkObject } from 'react-force-graph-3d';
import { ACESFilmicToneMapping, AdditiveBlending, BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, Group, MathUtils, Mesh, MeshBasicMaterial, Points, PointsMaterial, SphereGeometry, Sprite, SpriteMaterial, Vector2, Vector3 } from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import SpriteText from 'three-spritetext';
import { BookOpen, ChevronRight, Focus, Fullscreen, List, Pause, Play, Plus, Search, Sparkles, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { GraphViewProps } from './GraphView';
import { categoryColor } from './graph-model';

type Star = {id:string; label:string; category:string; kind:'document'|'category'; status:string; color:string; count:number; reviewed:number; degree:number; important:boolean};
type Strand = {id:string; membership:boolean};
type StarNode = NodeObject<Star>;
type StarLink = LinkObject<Star,Strand>;
const NO_COLOR='#b6d5ff';
const normalCategory = (value:string) => value.includes('|') ? '분류 검토' : ({'설계':'설계·디자인','환경':'주거 환경','기술':'디지털·AI','협업':'사업·협업'}[value] ?? (value || '일반'));
function hash(value:string){let n=0;for(const c of value)n=(Math.imul(n,31)+c.charCodeAt(0))>>>0;return n;}
function disposeObject(object:Group|Points){object.traverse(child=>{const renderable=child as Mesh;renderable.geometry?.dispose();const materials=Array.isArray(renderable.material)?renderable.material:[renderable.material];for(const material of materials){if(!material)continue;const map=(material as SpriteMaterial).map;if(map)map.dispose();material.dispose();}});}
function glowTexture(){const canvas=document.createElement('canvas');canvas.width=canvas.height=96;const ctx=canvas.getContext('2d')!;const gradient=ctx.createRadialGradient(48,48,0,48,48,48);gradient.addColorStop(0,'rgba(255,255,255,1)');gradient.addColorStop(.06,'rgba(255,255,255,.95)');gradient.addColorStop(.22,'rgba(190,214,255,.28)');gradient.addColorStop(1,'rgba(160,200,255,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,96,96);return new CanvasTexture(canvas);}
function tooltip(node:StarNode){const element=document.createElement('div');element.className='galaxy-tooltip';element.textContent=node.kind==='category'?`${node.label} · 문서 ${node.count}개 · 검수 완료 ${node.reviewed}개`:node.label;return element as unknown as React.ReactHTMLElement<HTMLElement>;}

export default function GalaxyGraph({nodes,edges,selectedId,onSelect,search='',showLabels=true,onLibrary,onWarroom,onCreate,onAsk,compact=false}:GraphViewProps){
  const container=useRef<HTMLDivElement>(null);
  const graphRef=useRef<ForceGraphMethods<Star,Strand>|undefined>(undefined);
  const [size,setSize]=useState({width:900,height:650});
  const [query,setQuery]=useState('');
  const [category,setCategory]=useState('');
  const [categoryPanel,setCategoryPanel]=useState(false);
  const [listOpen,setListOpen]=useState(false);
  const [rotating,setRotating]=useState(false);
  const [labels,setLabels]=useState(showLabels);
  const [strands,setStrands]=useState(true);
  const [hovered,setHovered]=useState<string|null>(null);
  const hoverRef=useRef<string|null>(null), selectionRef=useRef(selectedId);
  const reducedMotion=useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const combinedQuery=(query || search).trim().normalize('NFC').toLocaleLowerCase();
  const categories=useMemo(()=>[...new Set(nodes.map(n=>normalCategory(n.type)))].sort((a,b)=>a.localeCompare(b,'ko')),[nodes]);
  const visibleDocs=useMemo(()=>nodes.filter(n=>(!category || normalCategory(n.type)===category) && (!combinedQuery || n.label.normalize('NFC').toLocaleLowerCase().includes(combinedQuery))),[nodes,category,combinedQuery]);
  const data=useMemo(()=>{
    const groups=new Map(categories.map((c,i)=>{const angle=(i/categories.length)*Math.PI*2;const center=new Vector3().setFromSphericalCoords(categories.length<3?85:240,Math.PI/2+Math.sin(i*2.4)*.8,angle);return [c,center] as const;}));
    const degrees=new Map(nodes.map(n=>[n.id,0]));
    const links:StarLink[]=[];
    const pairs=new Set<string>();
    for(const edge of edges){if(!degrees.has(edge.sourceNodeId)||!degrees.has(edge.targetNodeId)||edge.sourceNodeId===edge.targetNodeId)continue;const key=[edge.sourceNodeId,edge.targetNodeId].sort().join(':');if(pairs.has(key))continue;pairs.add(key);degrees.set(edge.sourceNodeId,degrees.get(edge.sourceNodeId)!+1);degrees.set(edge.targetNodeId,degrees.get(edge.targetNodeId)!+1);links.push({id:edge.id,source:edge.sourceNodeId,target:edge.targetNodeId,membership:false});}
    const top=new Set(categories.flatMap(c=>nodes.filter(n=>normalCategory(n.type)===c).sort((a,b)=>degrees.get(b.id)!-degrees.get(a.id)!).slice(0,1).map(n=>n.id)));
    const stars:StarNode[]=nodes.map(n=>{const c=normalCategory(n.type),center=groups.get(c)!;const seed=hash(n.id);return {...n,category:c,kind:'document',color:NO_COLOR,count:0,reviewed:0,degree:degrees.get(n.id)!,important:top.has(n.id),x:center.x+(MathUtils.seededRandom(seed)-.5)*90,y:center.y+(MathUtils.seededRandom(seed+1)-.5)*90,z:center.z+(MathUtils.seededRandom(seed+2)-.5)*90};});
    for(const c of categories){const center=groups.get(c)!, members=nodes.filter(n=>normalCategory(n.type)===c);const id='__index_category__:'+c;stars.push({id,label:c,category:c,kind:'category',status:'GROUP',color:categoryColor(c),count:members.length,reviewed:members.filter(n=>n.status==='APPROVED').length,degree:members.length,important:true,x:center.x,y:center.y,z:center.z,fx:center.x,fy:center.y,fz:center.z});for(const n of members)links.push({id:id+':'+n.id,source:id,target:n.id,membership:true});}
    return {nodes:stars,links};
  },[nodes,edges,categories]);
  const objects=useMemo(()=>{
    const texture=glowTexture();const map=new Map<string,Group>();
    for(const node of data.nodes){const group=new Group();const radius=node.kind==='category'?4.5:Math.min(1.7,.8+Math.sqrt(node.degree)*.11);const core=new Mesh(new SphereGeometry(radius,12,10),new MeshBasicMaterial({color:new Color(node.kind==='category'?node.color:'#d0e3ff').multiplyScalar(2.2),transparent:true}));group.add(core);const glow=new Sprite(new SpriteMaterial({map:texture,color:node.color,blending:AdditiveBlending,transparent:true,depthWrite:false,opacity:node.kind==='category'?.8:.46}));glow.scale.setScalar(node.kind==='category'?54:11);group.add(glow);const label=new SpriteText(node.kind==='category'?node.label+'\n'+node.count+'개 지식':(node.label.length>23?node.label.slice(0,22)+'…':node.label),node.kind==='category'?8:4.6,node.kind==='category'?'#eef2ff':'#becbe5');label.fontFace='Pretendard, system-ui, sans-serif';label.fontSize=38;label.backgroundColor='rgba(5,10,25,0.68)';label.padding=[2,5];label.borderRadius=3;label.position.y=node.kind==='category'?-18:-7;label.material.depthWrite=false;group.add(label);group.userData={node,core,glow,label,baseLabelScale:label.scale.clone()};map.set(node.id,group);}
    return {map,texture};
  },[data]);
  useEffect(()=>()=>{for(const object of objects.map.values())disposeObject(object);objects.texture.dispose();},[objects]);
  const paint=useCallback(()=>{
    const camera=graphRef.current?.camera();
    for(const [id,object]of objects.map){const {node,core,glow,label,baseLabelScale}=object.userData as {node:StarNode;core:Mesh<SphereGeometry,MeshBasicMaterial>;glow:Sprite;label:SpriteText;baseLabelScale:Vector3};const matched=(!category||node.category===category)&&(!combinedQuery||node.label.normalize('NFC').toLocaleLowerCase().includes(combinedQuery)||node.kind==='category');const focused=id===hoverRef.current||id===selectionRef.current;core.material.opacity=matched?1:.12;(glow.material as SpriteMaterial).opacity=matched?(focused?1:node.kind==='category'?.8:.46):.04;const distance=camera?camera.position.distanceTo(new Vector3(node.x||0,node.y||0,node.z||0)):1000;label.visible=matched&&(node.kind==='category'||focused||(labels&&node.important));if(node.kind==='document')label.scale.copy(baseLabelScale).multiplyScalar(MathUtils.clamp(distance*.014/4.6,.5,3));label.color=focused?'#ffffff':node.kind==='category'?'#eef2ff':'#bdcbe3';object.scale.setScalar(focused?1.18:1);}
  },[objects,category,combinedQuery,labels,nodes.length]);
  const paintRef=useRef(paint);paintRef.current=paint;
  useEffect(()=>{selectionRef.current=selectedId;paint();},[selectedId,paint]);
  useEffect(()=>{const element=container.current;if(!element)return;const observer=new ResizeObserver(([entry])=>{if(entry)setSize({width:Math.max(200,entry.contentRect.width),height:Math.max(280,entry.contentRect.height)});});observer.observe(element);return()=>observer.disconnect();},[]);
  useEffect(()=>{
    const graph=graphRef.current;if(!graph)return;
    graph.d3Force('center',null);graph.d3Force('charge')?.strength(-18);graph.d3Force('link')?.distance((link:StarLink)=>link.membership?48:115).strength((link:StarLink)=>link.membership?.8:.12);
    const controls=graph.controls() as OrbitControls;controls.enableDamping=true;controls.dampingFactor=.08;controls.autoRotate=false;controls.autoRotateSpeed=.35;
    graph.cameraPosition({x:0,y:110,z:compact?400:630},{x:0,y:0,z:0},0);
    graph.renderer().setPixelRatio(Math.min(window.devicePixelRatio,1.5));
    graph.renderer().toneMapping=ACESFilmicToneMapping;
    const bloom=new UnrealBloomPass(new Vector2(size.width,size.height),.55,.5,1.1);const output=new OutputPass();graph.postProcessingComposer().addPass(bloom);graph.postProcessingComposer().addPass(output);
    // Decorative stars are not knowledge nodes and never participate in picking or statistics.
    const geometry=new BufferGeometry();const positions=new Float32Array(1200*3);for(let i=0;i<positions.length;i++)positions[i]=(MathUtils.seededRandom(i+927)-.5)*2600;geometry.setAttribute('position',new Float32BufferAttribute(positions,3));const stars=new Points(geometry,new PointsMaterial({color:'#8495bd',size:.65,transparent:true,opacity:.45,depthWrite:false}));stars.name='decorative-starfield';graph.scene().add(stars);
    const onChange=()=>paintRef.current();controls.addEventListener('change',onChange);graph.resumeAnimation();graph.d3ReheatSimulation();paint();
    return()=>{controls.removeEventListener('change',onChange);controls.autoRotate=false;graph.scene().remove(stars);disposeObject(stars);graph.pauseAnimation();graph.postProcessingComposer().removePass(bloom);graph.postProcessingComposer().removePass(output);bloom.dispose();output.dispose();};
    // Scene setup is tied to the data instance; viewport sizing is handled by ForceGraph.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[data]);
  useEffect(()=>{const graph=graphRef.current;if(!graph)return;(graph.controls() as OrbitControls).autoRotate=rotating&&!reducedMotion.current;},[rotating]);
  useEffect(()=>{paint();},[paint,hovered]);
  function focus(node:StarNode){const graph=graphRef.current;if(!graph)return;const target={x:node.x||0,y:node.y||0,z:node.z||0};const current=graph.camera().position;const vector=current.clone().sub(new Vector3(target.x,target.y,target.z)).normalize().multiplyScalar(node.kind==='category'?260:150);graph.cameraPosition({x:target.x+vector.x,y:target.y+vector.y,z:target.z+vector.z},target,reducedMotion.current?0:850);if(node.kind==='category'){setCategory(node.category);setCategoryPanel(true);}else onSelect(node.id);}
  const threeObject=useCallback((node:StarNode)=>objects.map.get(node.id)!,[objects]);
  const starById=useMemo(()=>new Map(data.nodes.map(n=>[n.id,n])),[data]);
  const idOf=(end:StarLink['source'])=>typeof end==='object'&&end?String(end.id):String(end);
  const linkColor=useCallback((link:StarLink)=>{const a=starById.get(idOf(link.source)),b=starById.get(idOf(link.target));const focusId=hovered||selectedId;if(focusId)return a?.id===focusId||b?.id===focusId?'#b7d9ffbb':'#27314a12';const match=(!category||(a?.category===category&&b?.category===category));return match?(link.membership?'#ba956542':'#9aaedb66'):'#27314a12';},[starById,category,hovered,selectedId]);
  const reset=()=>{setCategory('');setCategoryPanel(false);setQuery('');graphRef.current?.cameraPosition({x:0,y:110,z:compact?400:630},{x:0,y:0,z:0},reducedMotion.current?0:750);};
  function zoom(factor:number){const graph=graphRef.current;if(!graph)return;const target=(graph.controls() as OrbitControls).target;const position=graph.camera().position.clone().sub(target).multiplyScalar(factor).add(target);graph.cameraPosition(position,target,reducedMotion.current?0:300);}
  return <div ref={container} className={'knowledge-graph knowledge-graph--galaxy'+(compact?' knowledge-graph--compact':'')} data-graph-engine="react-force-graph-3d-threejs-d3" data-document-count={nodes.length}>
    <ForceGraph3D<Star,Strand> ref={graphRef} graphData={data} width={size.width} height={size.height} backgroundColor="#000000" controlType="orbit" showNavInfo={false} nodeThreeObject={threeObject} nodeLabel={tooltip} nodeVal={node=>node.kind==='category'?12:3} linkColor={linkColor} linkWidth={.2} linkOpacity={.42} linkVisibility={link=>strands||!link.membership} enableNodeDrag={false} warmupTicks={45} cooldownTicks={110} d3VelocityDecay={.35} onEngineTick={paint} onNodeHover={node=>{hoverRef.current=node?.id??null;setHovered(node?.id??null);}} onNodeClick={node=>focus(node)} onBackgroundClick={()=>{setCategoryPanel(false);}}/>
    <header className="galaxy-topbar"><button className="galaxy-brand" onClick={reset}><span className="galaxy-brand-star"/><span><strong>INDEX 지식 은하</strong><small>주거 실내건축 · 문서와 근거의 연결</small></span></button><nav className="galaxy-categories" aria-label="그래프 분야"><button aria-pressed={!category} onClick={reset}>전체</button>{categories.map(c=><button key={c} aria-pressed={category===c} onClick={()=>focus(data.nodes.find(n=>n.kind==='category'&&n.category===c)!)}><i style={{background:categoryColor(c)}}/>{c}</button>)}</nav><label className="galaxy-search"><Search size={15}/><input aria-label="그래프 지식 검색" placeholder="지식·문서 검색" value={query} onChange={event=>{setQuery(event.target.value);setListOpen(Boolean(event.target.value));}}/>{query&&<button aria-label="검색 초기화" onClick={()=>setQuery('')}><X size={13}/></button>}</label><button className="galaxy-icon" aria-label="문서 노드 목록" onClick={()=>setListOpen(v=>!v)}><List size={18}/></button>{onWarroom&&<button className="galaxy-top-action" onClick={onWarroom}>현황판</button>}{onLibrary&&<button className="galaxy-top-action" onClick={onLibrary}><BookOpen size={15}/>지식 대장</button>}</header>
    <div className="galaxy-camera"><button aria-label="그래프 확대" title="확대" onClick={()=>zoom(.78)}><ZoomIn size={17}/></button><button aria-label="그래프 축소" title="축소" onClick={()=>zoom(1.25)}><ZoomOut size={17}/></button><button aria-label="전체 그래프 보기" title="전체 보기" onClick={reset}><Focus size={17}/></button><button aria-label="그래프 전체화면" title="전체화면" onClick={()=>{if(document.fullscreenElement)void document.exitFullscreen();else void container.current?.requestFullscreen();}}><Fullscreen size={17}/></button></div>
    <footer className="galaxy-bottom"><div className="galaxy-toggles"><button aria-pressed={strands} onClick={()=>setStrands(v=>!v)}><i/>분야 연결</button><button aria-pressed={labels} onClick={()=>setLabels(v=>!v)}><i/>문서 이름</button><button aria-pressed={rotating} onClick={()=>setRotating(v=>!v)}>{rotating?<Pause size={14}/>:<Play size={14}/>}시네마</button></div><div className="galaxy-counts"><span><i/>실제 저장 지식</span><strong>{categories.length}<small>분야</small></strong><strong>{nodes.length}<small>문서</small></strong><strong>{data.links.filter(l=>!l.membership).length}<small>문서 연결</small></strong></div>{onAsk&&<button className="galaxy-bottom-action" onClick={onAsk}><Sparkles size={15}/>위키에 질문</button>}{onCreate&&<button className="galaxy-bottom-action" onClick={onCreate}><Plus size={15}/>새 문서</button>}</footer>
    <p className="galaxy-help">드래그 회전 · 우클릭 이동 · 휠 확대 · 노드 클릭으로 문서 열기</p>
    {(listOpen||categoryPanel)&&<aside className="galaxy-list"><header><div><span>{categoryPanel?'분야별 지식':'문서 검색'}</span><h2>{category||'모든 지식'}<small>{visibleDocs.length}</small></h2></div><button className="galaxy-icon" aria-label="문서 목록 닫기" onClick={()=>{setListOpen(false);setCategoryPanel(false);}}><X size={18}/></button></header><div>{visibleDocs.length?visibleDocs.map(node=><button className="galaxy-list-item" key={node.id} onClick={()=>focus(data.nodes.find(n=>n.id===node.id)!)}><i style={{background:categoryColor(normalCategory(node.type))}}/><span><strong>{node.label}</strong><small>{normalCategory(node.type)} · {node.status==='APPROVED'?'검수 완료':'검수 전'}</small></span><ChevronRight size={14}/></button>):<p className="galaxy-no-results">일치하는 문서가 없습니다.</p>}</div></aside>}
    {selectedId&&<span className="galaxy-selection-status" aria-live="polite">문서 선택: {nodes.find(n=>n.id===selectedId)?.label}</span>}
  </div>;
}
