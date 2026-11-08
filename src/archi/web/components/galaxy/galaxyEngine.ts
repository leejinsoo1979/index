// @ts-nocheck — kept close to the original vanilla JS so upstream changes stay easy to follow.
/**
 * INDEX 지식 은하 — the knowledge map engine.
 *
 * Ported from Second Brain OS "the map" (https://github.com/undefined-ui/second-brain-os,
 * assets/site/app.js, MIT License, Copyright (c) 2026 undefined-ui). Changes: npm imports,
 * scoped to one root element (no globals, full teardown), Korean copy, INDEX layers
 * (설계·공간 / 시공·자재 / 법규·하자 / 현장·협업 / 용어 / AI 도구), and host callbacks for
 * opening a wiki document, an Apps tool, or other studio views.
 */
import * as THREE from 'three';
import ForceGraph3D from '3d-force-graph';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import type { GalaxyGraph, GalaxyPages } from './galaxyData';

export type GalaxyHost = {
  openPage: (id: string) => void;
  openTool: (id: string) => void;
  nav: (key: string) => void;
};

export function mountGalaxy(rootEl: HTMLElement, G: GalaxyGraph, PAGES: GalaxyPages, host: GalaxyHost): () => void {
  const off = new AbortController();
  const sig = { signal: off.signal };
  let rafId = 0;
  let disposed = false;

  const $ = (s, el = rootEl) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clip = (s, n) => (s = String(s || '')).length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const store = {
    get(k, d) { try { const v = localStorage.getItem('index-galaxy:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('index-galaxy:' + k, JSON.stringify(v)); } catch { } },
  };
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = () => innerWidth <= 760;
  // the map fills its root (beside the studio rail), not the whole window
  const W = () => rootEl.clientWidth || innerWidth;
  const H = () => rootEl.clientHeight || innerHeight;
  const fmt = v => Number(v || 0).toLocaleString('ko-KR');

  // ------------------------------------------------------------------ palette
  const tok = n => getComputedStyle(rootEl).getPropertyValue(n).trim();
  const COLOR = { root: '', design: '', build: '', law: '', field: '', term: '', tool: '' };
  const PAPER = new THREE.Color('#0F1513');
  function readColors() {
    for (const k of Object.keys(COLOR)) COLOR[k] = tok('--c-' + k);
    PAPER.set(tok('--paper') || '#0F1513');
  }
  readColors();
  const LAYERS = [
    { key: 'design', label: '설계·공간' },
    { key: 'build', label: '시공·자재' },
    { key: 'law', label: '법규·하자' },
    { key: 'field', label: '현장·협업' },
    { key: 'term', label: '용어' },
    { key: 'tool', label: 'AI 도구' },
  ];
  const PATHS = ['design', 'build', 'law', 'field'];
  const TYPE = { root: '홈', collection: '분야 묶음', section: '분야', page: '문서', term: '용어', app: 'AI 도구' };

  // ------------------------------------------------------------------ data
  const nodes = G.nodes.map(n => ({ ...n }));
  const byId = new Map(nodes.map(n => [n.id, n]));
  const links = G.edges.filter(e => byId.has(e.s) && byId.has(e.t)).map(e => ({ source: e.s, target: e.t, s: e.s, t: e.t, kind: e.k, w: 1, hidden: !!e.h }));
  const nbr = new Map(nodes.map(n => [n.id, new Set()]));
  const linksOf = new Map(nodes.map(n => [n.id, []]));
  for (const l of links) {
    nbr.get(l.s).add(l.t); nbr.get(l.t).add(l.s);
    linksOf.get(l.s).push(l); linksOf.get(l.t).push(l);
  }
  const FLAT = G.order.flatMap(s => byId.get(s).pages);
  const sectionsOf = col => G.order.filter(s => byId.get(s).group === col);
  const dotOf = n => COLOR[n.group] || COLOR.root;
  const cssDot = n => `var(--c-${COLOR[n.group] !== undefined && n.group !== 'root' ? n.group : 'root'})`;

  const layerOn = Object.assign(Object.fromEntries(LAYERS.map(l => [l.key, !l.off])), store.get('layers', {}));
  const visible = n => n.group === 'root' || !!layerOn[n.group];

  // ------------------------------------------------------------------ state
  const S = { mode: 'boot', sel: null, preview: null, previewSrc: null, focus: null, spin: store.get('spin', !REDUCED), t0: performance.now() };
  const setMode = m => {
    rootEl.classList.remove('m-overview', 'm-focus', 'm-read', 'booting');
    rootEl.classList.add('m-' + m);
  };

  // ------------------------------------------------------------------ graph
  const stage = $('#gx-stage');
  let graph;
  try {
    graph = ForceGraph3D({ controlType: 'orbit', rendererConfig: { antialias: true, alpha: true, powerPreference: 'high-performance' } })(stage);
  } catch (err) {
    failed(err);
    return () => off.abort();
  }
  const scene = graph.scene();
  const camera = graph.camera();
  const controls = graph.controls();
  const renderer = graph.renderer();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  // where each layer settles: a loose continent per collection around the centre
  const R = 230;
  const ANCHOR = {
    law: [-1, .05, .25], design: [.8, .32, -.42], build: [.78, -.36, .5],
    term: [-.08, .62, -.55], tool: [-.28, -.92, -.28], field: [.25, .95, .55],
  };
  for (const n of nodes) {
    const a = ANCHOR[n.group] || [0, 0, 0];
    const j = () => (Math.random() - .5) * 30;
    n.x = a[0] * R * .25 + j(); n.y = a[1] * R * .25 + j(); n.z = a[2] * R * .25 + j();
    n._o = 0; n._ot = 0; n._s = 1; n._st = 1;
    n._appear = ({ root: 0, collection: 250, section: 550, page: 850, term: 1150, app: 1300 }[n.type] ?? 900)
      + (n.type === 'page' || n.type === 'term' ? Math.random() * 700 : Math.random() * 200);
  }
  const home = byId.get('root');
  home.fx = 0; home.fy = 0; home.fz = 0;

  const GEO = {
    sphere: new THREE.SphereGeometry(1, 32, 22),
    gem: new THREE.IcosahedronGeometry(1, 0),
    oct: new THREE.OctahedronGeometry(1, 0),
    shell: new THREE.SphereGeometry(1, 40, 28),
  };
  const TOOLISH = new Set(['app']);
  const SHELLED = new Set(['root', 'collection', 'section']);

  // a soft rim, brighter at the edge than the middle: the "bubble" around hubs
  const rimMaterial = color => new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 color; uniform float opacity; varying vec3 vN; varying vec3 vV;
      void main(){ float f = 1. - abs(dot(normalize(vN), normalize(vV))); float a = pow(f, 2.4) * .9 + .04; gl_FragColor = vec4(color, a * opacity); }`,
    transparent: true, depthWrite: false,
  });

  function makeNode(n) {
    const g = new THREE.Group();
    const r = Math.cbrt(n.val) * 3.1;
    const geo = n.type === 'term' ? GEO.gem : TOOLISH.has(n.type) ? GEO.oct : GEO.sphere;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(dotOf(n)), roughness: .55, metalness: 0,
      transparent: true, opacity: n._o, flatShading: geo !== GEO.sphere,
    });
    const core = new THREE.Mesh(geo, mat);
    core.scale.setScalar(geo === GEO.sphere ? r : r * 1.25);
    g.add(core);
    n._core = core; n._r = r; n._shell = null;
    if (SHELLED.has(n.type)) {
      const shell = new THREE.Mesh(GEO.shell, rimMaterial(dotOf(n)));
      shell.scale.setScalar(r * (n.type === 'root' ? 1.9 : 1.7));
      shell.renderOrder = 2;
      g.add(shell);
      n._shell = shell;
    }
    return g;
  }

  const tooltip = n => {
    const sec = n.sec ? byId.get(n.sec) : null;
    const ctx = sec ? ` · ${sec.badge} ${sec.label}` : '';
    return `<span class="tt-k" style="--dot:${cssDot(n)}">${TYPE[n.type]}${esc(ctx)}</span>` +
      `<span class="tt-t">${esc(n.label)}</span>` +
      (n.desc && n.type !== 'root' ? `<span class="tt-d">${esc(clip(n.desc, 120))}</span>` : '');
  };

  graph
    .backgroundColor('rgba(0,0,0,0)')
    .showNavInfo(false)
    .nodeId('id')
    .nodeVal('val')
    .nodeThreeObject(makeNode)
    .nodeLabel(n => isMobile() ? '' : tooltip(n))
    .linkVisibility(false)
    .enableNodeDrag(false)
    .warmupTicks(110)
    .cooldownTicks(320)
    .d3AlphaDecay(.016)
    .d3VelocityDecay(.34)
    .onNodeHover(n => { setPreview(n && n._o > .05 ? n : null, 'graph'); })
    .onNodeClick(n => onPick(n))
    .onBackgroundClick(() => { if (S.mode === 'focus') go('root'); })
    .onEngineTick(() => updateLinkPositions())
    .graphData({ nodes, links });

  // forces: structure pulls tight, cross-references loose, every layer to its continent
  const CONTAINS = { root: 175, collection: 62, section: 21 };
  const DIST = { link: 72, mentions: 88, uses: 80, follows: 13, related: 70 };
  const STR = { link: .07, mentions: .035, uses: .04, follows: .7, related: .03 };
  const CHARGE = { root: -650, collection: -280, section: -120, page: -38, term: -46, app: -24 };
  graph.d3Force('link')
    .distance(l => l.kind === 'contains' ? (l.hidden ? 130 : CONTAINS[byId.get(l.s).type] || 30) : DIST[l.kind] || 60)
    .strength(l => {
      if (l.kind === 'contains') return l.hidden ? .012 : byId.get(l.s).type === 'root' ? .35 : .85;
      if (l.kind === 'link' && byId.get(l.s).sec === byId.get(l.t).sec) return .22;
      return STR[l.kind] ?? .05;
    });
  graph.d3Force('charge').strength(n => CHARGE[n.type] ?? -20).distanceMax(360);
  graph.d3Force('anchor', (() => {
    let ns = [];
    const f = alpha => {
      for (const n of ns) {
        const a = ANCHOR[n.group]; if (!a) continue;
        const k = (n.type === 'collection' ? .14 : n.type === 'section' ? .03 : .011) * alpha;
        n.vx += (a[0] * R - n.x) * k; n.vy += (a[1] * R - n.y) * k; n.vz += (a[2] * R - n.z) * k;
      }
    };
    f.initialize = x => { ns = x; };
    return f;
  })());

  // lights travel with the camera, so a bubble always reads as round
  graph.lights([new THREE.AmbientLight(0xffffff, .75), new THREE.HemisphereLight(0xffffff, 0x9AA79F, .55)]);
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-.6, 1, .8);
  camera.add(key);
  scene.add(camera);
  scene.fog = new THREE.Fog(PAPER, 400, 1600);

  controls.enableDamping = true;
  controls.dampingFactor = .085;
  controls.rotateSpeed = .55;
  controls.zoomSpeed = .9;
  controls.minDistance = 18;
  controls.maxDistance = 2600;
  controls.autoRotateSpeed = .45;

  // ------------------------------------------------------------------ edges
  const VL = links.filter(l => !l.hidden);
  for (const l of VL) { l._S = byId.get(l.s); l._T = byId.get(l.t); l._a = 0; l._at = 0; }
  const KIND_A = { contains: .3, link: .42, mentions: .17, uses: .3, follows: .3, related: .2 };
  const lpos = new Float32Array(VL.length * 6);
  const lcol = new Float32Array(VL.length * 8);
  VL.forEach((l, i) => {
    const a = new THREE.Color(dotOf(l._S)), b = new THREE.Color(dotOf(l._T));
    lcol.set([a.r, a.g, a.b, 0, b.r, b.g, b.b, 0], i * 8);
  });
  const lgeo = new THREE.BufferGeometry();
  lgeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3).setUsage(THREE.DynamicDrawUsage));
  lgeo.setAttribute('color', new THREE.BufferAttribute(lcol, 4).setUsage(THREE.DynamicDrawUsage));
  const lineMesh = new THREE.LineSegments(lgeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: true }));
  lineMesh.frustumCulled = false;
  lineMesh.renderOrder = -1;
  scene.add(lineMesh);

  function updateLinkPositions() {
    for (let i = 0; i < VL.length; i++) {
      const S_ = VL[i]._S, T_ = VL[i]._T, o = i * 6;
      lpos[o] = S_.x; lpos[o + 1] = S_.y; lpos[o + 2] = S_.z;
      lpos[o + 3] = T_.x; lpos[o + 4] = T_.y; lpos[o + 5] = T_.z;
    }
    lgeo.attributes.position.needsUpdate = true;
    if (hl.list.length) updateHL();
  }

  const hl = {
    list: [], o: 0, ot: 0,
    mat: new LineMaterial({ linewidth: 2.4, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, worldUnits: false }),
  };
  hl.mesh = new LineSegments2(new LineSegmentsGeometry(), hl.mat);
  hl.mesh.frustumCulled = false;
  hl.mesh.renderOrder = 1;
  scene.add(hl.mesh);

  function buildHL(list) {
    hl.list = list;
    const geo = new LineSegmentsGeometry();
    const pos = new Float32Array(Math.max(list.length, 1) * 6), col = new Float32Array(Math.max(list.length, 1) * 6);
    list.forEach((l, i) => {
      const a = new THREE.Color(dotOf(l._S)), b = new THREE.Color(dotOf(l._T));
      col.set([a.r, a.g, a.b, b.r, b.g, b.b], i * 6);
    });
    geo.setPositions(pos); geo.setColors(col);
    hl.mesh.geometry.dispose();
    hl.mesh.geometry = geo;
    hl.mesh.visible = list.length > 0;
    updateHL();
    buildParticles();
  }
  function updateHL() {
    const buf = hl.mesh.geometry.attributes.instanceStart.data, arr = buf.array;
    hl.list.forEach((l, i) => {
      const o = i * 6;
      arr[o] = l._S.x; arr[o + 1] = l._S.y; arr[o + 2] = l._S.z;
      arr[o + 3] = l._T.x; arr[o + 4] = l._T.y; arr[o + 5] = l._T.z;
    });
    buf.needsUpdate = true;
  }

  // signal dots running outwards from the selection along its edges
  const PMAX = 900;
  const ppos = new Float32Array(PMAX * 3), pcol = new Float32Array(PMAX * 3);
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3).setUsage(THREE.DynamicDrawUsage));
  pgeo.setAttribute('color', new THREE.BufferAttribute(pcol, 3));
  pgeo.setDrawRange(0, 0);
  const dotTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.45, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const pmat = new THREE.PointsMaterial({ size: 5.5, sizeAttenuation: false, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, opacity: 0 });
  const points = new THREE.Points(pgeo, pmat);
  points.frustumCulled = false;
  points.renderOrder = 3;
  scene.add(points);
  let particles = [];
  function buildParticles() {
    particles = [];
    if (REDUCED || !S.sel) { pgeo.setDrawRange(0, 0); return; }
    for (const l of hl.list) {
      const out = l._S === S.sel;
      const far = out ? l._T : l._S;
      const c = new THREE.Color(dotOf(far)).lerp(new THREE.Color('#ffffff'), .12);
      const k = l.kind === 'contains' || l.kind === 'follows' ? 1 : 2;
      for (let j = 0; j < k && particles.length < PMAX; j++) {
        particles.push({ l, out, ph: j / k + Math.random() * .25, sp: .28 + Math.random() * .14 });
        pcol.set([c.r, c.g, c.b], (particles.length - 1) * 3);
      }
    }
    pgeo.attributes.color.needsUpdate = true;
    pgeo.setDrawRange(0, particles.length);
  }
  function updateParticles(t) {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i], a = p.out ? p.l._S : p.l._T, b = p.out ? p.l._T : p.l._S;
      const k = (t * .001 * p.sp + p.ph) % 1, e = k * k * (3 - 2 * k);
      ppos[i * 3] = lerp(a.x, b.x, e); ppos[i * 3 + 1] = lerp(a.y, b.y, e); ppos[i * 3 + 2] = lerp(a.z, b.z, e);
    }
    pgeo.attributes.position.needsUpdate = true;
  }

  // ------------------------------------------------------------------ highlight
  function focusSetOf(n) {
    const s = new Set([n.id]);
    for (const id of nbr.get(n.id)) if (visible(byId.get(id))) s.add(id);
    return s;
  }
  function retarget() {
    const now = performance.now() - S.t0;
    const F = S.focus, P = S.preview && S.preview !== S.sel ? S.preview : null;
    const PN = P ? nbr.get(P.id) : null;
    for (const n of nodes) {
      let o = visible(n) && now >= n._appear ? 1 : 0;
      if (o && F && !F.has(n.id)) o = P && (n === P || PN.has(n.id)) ? .55 : .12;
      n._ot = o;
      n._st = n === S.sel ? 1.45 : n === P ? 1.3 : 1;
    }
    for (const l of VL) {
      const on = l._S._ot > 0 && l._T._ot > 0 && visible(l._S) && visible(l._T);
      let a = on ? KIND_A[l.kind] : 0;
      if (on && F) a = l._S === S.sel || l._T === S.sel ? .55 : F.has(l.s) && F.has(l.t) ? .16 : .025;
      if (on && P && (l._S === P || l._T === P)) a = Math.max(a, .7);
      l._at = a;
    }
  }

  // ------------------------------------------------------------------ labels
  const labelBox = $('#gx-labels');
  const labels = new Map();
  function labelSet() {
    const want = new Set();
    for (const n of nodes) {
      if (!visible(n)) continue;
      if (n.type === 'root' || n.type === 'collection' || n.type === 'section') want.add(n);
    }
    if (S.focus) [...S.focus].map(id => byId.get(id)).sort((a, b) => b.val - a.val).slice(0, 70).forEach(n => want.add(n));
    if (S.preview && visible(S.preview)) want.add(S.preview);
    return want;
  }
  function labelHTML(n) {
    if (n.type === 'section') return `<b>${esc(n.badge)}</b>${esc(n.label)}`;
    if (n.type === 'root') return 'INDEX <span style="color:var(--accent)">지식</span> 은하';
    return esc(clip(n.label, n === S.sel ? 64 : 40));
  }
  function refreshLabels() {
    const want = labelSet();
    for (const [id, el] of labels) if (!want.has(byId.get(id))) { el.remove(); labels.delete(id); }
    for (const n of want) {
      let el = labels.get(n.id);
      if (!el) {
        el = document.createElement('div');
        el.className = `lb t-${TOOLISH.has(n.type) ? 'tool' : n.type}`;
        el.style.setProperty('--dot', cssDot(n));
        el.dataset.id = n.id;
        el.style.opacity = '0';
        labelBox.appendChild(el);
        labels.set(n.id, el);
        el._n = n;
      }
      el.innerHTML = labelHTML(n);
      el.classList.toggle('sel', n === S.sel);
      el._p = prio(n);
    }
    for (const [, el] of labels) { el._w = el.offsetWidth; el._h = el.offsetHeight; }
  }
  labelBox.addEventListener('click', e => { const el = e.target.closest('.lb'); if (el) onPick(byId.get(el.dataset.id)); });
  labelBox.addEventListener('mouseover', e => { const el = e.target.closest('.lb'); if (el) setPreview(byId.get(el.dataset.id), 'label'); });
  labelBox.addEventListener('mouseout', e => { if (e.target.closest('.lb')) setPreview(null, 'label'); });

  const ring = $('#gx-ring');
  const V = new THREE.Vector3();
  function project(n) {
    V.set(n.x, n.y, n.z).project(camera);
    return { x: (V.x + 1) / 2 * W(), y: (1 - V.y) / 2 * H(), front: V.z < 1 && V.z > -1 };
  }
  function pxRadius(n, dist) {
    return n._r * n._s * (H() / 2) / (dist * Math.tan(camera.fov * Math.PI / 360));
  }
  // runs inside the renderer, after the controls moved the camera: no lag
  const placed = [];
  const PRIO = { root: 6, collection: 5, section: 4, term: 2, page: 2 };
  function prio(n) { return n === S.sel ? 9 : n === S.preview ? 8 : (PRIO[n.type] || 1) + (S.focus && S.focus.has(n.id) ? 2 : 0); }
  scene.onBeforeRender = () => {
    const cam = camera.position;
    placed.length = 0;
    const order = [...labels.values()].sort((a, b) => b._p - a._p);
    for (const el of order) {
      const n = el._n;
      const p = project(n);
      const d = cam.distanceTo(V.set(n.x, n.y, n.z));
      const depth = clamp(1 - (d - scene.fog.near) / (scene.fog.far - scene.fog.near), .12, 1);
      let o = n._o * (p.front ? 1 : 0) * (n === S.sel ? 1 : depth);
      if (n.type === 'page' || n.type === 'term' || TOOLISH.has(n.type)) o *= S.focus ? 1 : .9;
      const offY = pxRadius(n, d) + (n.type === 'root' ? 10 : 4);
      const x0 = p.x - el._w / 2, y0 = p.y + offY;
      if (o > .05) {
        const hit = placed.some(r => x0 < r[2] && x0 + el._w > r[0] && y0 < r[3] && y0 + el._h > r[1]);
        if (hit) o *= el._p >= 8 ? 1 : .12;
        else placed.push([x0 - 4, y0 - 1, x0 + el._w + 4, y0 + el._h + 1]);
      }
      el.style.opacity = o.toFixed(3);
      el.style.visibility = o < .03 ? 'hidden' : 'visible';
      el.style.transform = `translate3d(${p.x.toFixed(1)}px,${(p.y + offY).toFixed(1)}px,0) translateX(-50%)`;
      el.style.zIndex = n === S.sel ? 5 : n.type === 'section' || n.type === 'collection' ? 3 : 1;
    }
    if (S.sel && S.mode !== 'overview') {
      const p = project(S.sel), d = cam.distanceTo(V.set(S.sel.x, S.sel.y, S.sel.z));
      const size = pxRadius(S.sel, d) * 2 + 14;
      ring.style.transform = `translate3d(${p.x}px,${p.y}px,0)`;
      ring.style.width = ring.style.height = size + 'px';
      ring.style.setProperty('--dot', cssDot(S.sel));
      ring.classList.toggle('on', p.front);
    } else ring.classList.remove('on');
  };

  // ------------------------------------------------------------------ camera
  const view = { x: 0, y: 0, tx: 0, ty: 0, w: 0, h: 0 };
  const panel = { info: 0, reader: 0, hero: 0 };
  function measure() {
    panel.info = $('#gx-info').offsetWidth; panel.reader = $('#gx-reader').offsetWidth; panel.hero = $('#gx-hero').offsetWidth;
  }
  function targetOffset() {
    if (isMobile()) return { x: 0, y: S.mode === 'focus' ? H() * .25 : S.mode === 'overview' ? H() * .2 : 0 };
    if (S.mode === 'read') return { x: panel.reader / 2, y: 0 };
    if (S.mode === 'focus') return { x: (panel.info + 16) / 2, y: 0 };
    return { x: -(panel.hero + 28) / 2 * .85, y: 0 };
  }
  function applyView(force) {
    if (!force && Math.abs(view.x - view.tx) < .3 && Math.abs(view.y - view.ty) < .3 && view.w === W() && view.h === H()) return;
    view.x = Math.abs(view.x - view.tx) < .3 ? view.tx : lerp(view.x, view.tx, .08);
    view.y = Math.abs(view.y - view.ty) < .3 ? view.ty : lerp(view.y, view.ty, .08);
    view.w = W(); view.h = H();
    camera.setViewOffset(W(), H(), view.x, view.y, W(), H());
  }

  let flight = null;
  const SPH = new THREE.Spherical();
  function fly(target, dist, { ms = 1800, spin = 1.05, phi = null } = {}) {
    if (REDUCED) { ms = 350; spin = 0; }
    const live = typeof dist === 'function' ? dist : null;
    if (live) dist = live();
    if (!isFinite(dist)) dist = 600;
    const o = camera.position.clone().sub(controls.target);
    const from = new THREE.Spherical().setFromVector3(o);
    const to = new THREE.Spherical(dist, phi ?? clamp(lerp(from.phi, 1.18, .55), .45, 2.4), from.theta + spin);
    flight = { t0: performance.now(), ms, from, to, target, start: controls.target.clone(), bump: Math.min(from.radius, dist) * .32 + Math.abs(from.radius - dist) * .1, live };
    controls.autoRotate = false;
  }
  const nodeVec = n => new THREE.Vector3(n.x || 0, n.y || 0, n.z || 0);
  function stepFlight(now) {
    if (!flight) return;
    const f = flight, k = clamp((now - f.t0) / f.ms, 0, 1), e = ease(k);
    if (f.live) { const d = f.live(); if (isFinite(d)) f.to.radius = d; }
    const tgt = typeof f.target === 'function' ? f.target() : f.target.isVector3 ? f.target : nodeVec(f.target);
    const look = f.start.clone().lerp(tgt, e);
    SPH.set(lerp(f.from.radius, f.to.radius, e) + Math.sin(Math.PI * e) * f.bump, lerp(f.from.phi, f.to.phi, e), lerp(f.from.theta, f.to.theta, e));
    camera.position.setFromSpherical(SPH).add(look);
    camera.lookAt(look);
    controls.target.copy(look);
    if (k >= 1) { flight = null; resumeSpin(); }
  }
  function fitDistance(r) {
    let w = W(), h = H();
    if (isMobile()) h *= S.mode === 'focus' ? .46 : S.mode === 'overview' ? .5 : 1;
    else w -= S.mode === 'focus' ? panel.info + 32 : S.mode === 'read' ? panel.reader : (panel.hero + 40) * .6;
    return r * H() / (Math.tan(camera.fov * Math.PI / 360) * Math.max(160, Math.min(w, h)));
  }
  function homeCenter() {
    const vis = nodes.filter(n => visible(n) && n.x !== undefined);
    const c = new THREE.Vector3();
    for (const n of vis) c.add(V.set(n.x, n.y, n.z));
    return c.divideScalar(vis.length || 1);
  }
  function homeDistance() {
    const c = homeCenter();
    const d = nodes.filter(n => visible(n) && n.x !== undefined).map(n => Math.hypot(n.x - c.x, n.y - c.y, n.z - c.z)).sort((a, b) => a - b);
    return clamp(fitDistance(d[Math.floor(d.length * .92)] || 300) * .92, 300, 2400);
  }
  function focusDistance(n) {
    const d = [...(S.focus || [])].filter(id => id !== n.id).map(id => { const m = byId.get(id); return Math.hypot(m.x - n.x, m.y - n.y, m.z - n.z); }).sort((a, b) => a - b);
    const r = d.length ? Math.min(d[Math.floor((d.length - 1) * .85)], d[Math.floor((d.length - 1) / 2)] * 2.2) : n._r * 6;
    return clamp(fitDistance(r) * 1.1, n._r * 9, 1600);
  }
  let spinTimer = 0;
  function resumeSpin() {
    clearTimeout(spinTimer);
    controls.autoRotate = S.spin && !flight && S.mode !== 'read';
    controls.autoRotateSpeed = S.mode === 'overview' ? .45 : .22;
  }
  controls.addEventListener('start', () => { flight = null; controls.autoRotate = false; clearTimeout(spinTimer); });
  controls.addEventListener('end', () => { clearTimeout(spinTimer); spinTimer = setTimeout(resumeSpin, 5000); });

  // ------------------------------------------------------------------ frame loop
  let lastLinks = 0, lastIntro = 0;
  let booted = false;
  function frame(now) {
    if (disposed) return;
    rafId = requestAnimationFrame(frame);
    if (!booted) {
      if (!home._core) return;
      booted = true; S.t0 = now; retarget(); refreshLabels(); route();
    }
    stepFlight(now);
    const t = now - S.t0;
    if (t < 2600 && now - lastIntro > 80) { retarget(); lastIntro = now; }
    for (const n of nodes) {
      if (!n._core) continue;
      if (Math.abs(n._o - n._ot) > .004 || Math.abs(n._s - n._st) > .004) {
        n._o = lerp(n._o, n._ot, .11); n._s = lerp(n._s, n._st, .16);
        if (Math.abs(n._o - n._ot) <= .004) n._o = n._ot;
      }
      const show = n._o > .01;
      n._core.material.opacity = n._o;
      n._core.layers.set(show ? 0 : 1);
      n._core.scale.setScalar((n._core.geometry === GEO.sphere ? n._r : n._r * 1.25) * n._s);
      if (n._shell) {
        n._shell.material.uniforms.opacity.value = n._o * (n === S.sel ? 1 : .75);
        n._shell.layers.set(show ? 0 : 1);
        n._shell.scale.setScalar(n._r * (n.type === 'root' ? 1.9 : 1.7) * n._s);
      }
    }
    let lchg = false;
    for (let i = 0; i < VL.length; i++) {
      const l = VL[i];
      if (Math.abs(l._a - l._at) > .002) {
        l._a = lerp(l._a, l._at, .09);
        lcol[i * 8 + 3] = lcol[i * 8 + 7] = l._a;
        lchg = true;
      }
    }
    if (lchg) lgeo.attributes.color.needsUpdate = true;
    hl.o = lerp(hl.o, hl.ot, .07); hl.mat.opacity = hl.o; pmat.opacity = hl.o;
    if (now - lastLinks > 32 || flight) { updateLinkPositions(); lastLinks = now; }
    if (particles.length) updateParticles(now);
    const dist = camera.position.distanceTo(controls.target);
    scene.fog.near = dist * .95; scene.fog.far = dist * 3.4;
    const to = targetOffset(); view.tx = to.x; view.ty = to.y;
    applyView(false);
  }
  rafId = requestAnimationFrame(frame);

  // ------------------------------------------------------------------ selection
  function setPreview(n, src) {
    if (S.preview === n) return;
    if (!n && S.previewSrc && S.previewSrc !== src) return;
    S.preview = n; S.previewSrc = n ? src : null;
    retarget(); refreshLabels();
    rootEl.querySelectorAll('.li.hot,.chip.hot').forEach(el => el.classList.remove('hot'));
    if (n) rootEl.querySelectorAll(`[data-go="${CSS.escape(n.id)}"]`).forEach(el => el.classList.add('hot'));
  }
  function onPick(n) {
    if (!n) return;
    if (n.type === 'root') return go('root');
    if (S.mode === 'read' && n.type === 'page') return read(n.id);
    go(n.id);
  }
  function select(n) {
    S.sel = n;
    S.focus = n ? focusSetOf(n) : null;
    S.preview = null; S.previewSrc = null;
    retarget();
    buildHL(n ? VL.filter(l => (l._S === n || l._T === n) && visible(l._S) && visible(l._T)) : []);
    hl.ot = n ? 1 : 0;
    refreshLabels();
  }

  // ------------------------------------------------------------------ routing
  function go(id) { const h = id === 'root' ? '#/' : '#/n/' + encodeURIComponent(id); if (location.hash !== h) location.hash = h; else route(); }
  function read(id) { const h = '#/read/' + encodeURIComponent(id); if (location.hash !== h) location.hash = h; else route(); }
  function parse() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (!h || h === '/') return { mode: 'overview' };
    if (h.startsWith('/read/')) return { mode: 'read', id: h.slice(6) };
    if (h.startsWith('/n/')) return { mode: 'focus', id: h.slice(3) };
    return { mode: 'overview' };
  }
  function route() {
    if (disposed) return;
    const r = parse();
    let n = r.id ? byId.get(r.id) : null;
    if (r.id && (!n || n.type === 'root')) { r.mode = 'overview'; n = null; }
    if (r.mode === 'read' && n.type !== 'page') r.mode = 'focus';
    if (n && !visible(n)) { layerOn[n.group] = true; store.set('layers', layerOn); renderLayers(); }
    const prev = S.sel, prevMode = S.mode;
    S.mode = r.mode;
    setMode(r.mode);
    closeContents();
    if (r.mode === 'overview') {
      select(null);
      fly(homeCenter, homeDistance, { ms: prevMode === 'boot' ? 3200 : 1900, spin: prevMode === 'boot' ? 1.7 : .9, phi: 1.2 });
      return;
    }
    if (n !== prev) select(n);
    if (r.mode === 'focus') renderInfo(n);
    if (r.mode === 'read') renderReader(n);
    if (n !== prev || prevMode === 'boot') fly(n, () => focusDistance(n), { ms: prevMode === 'boot' ? 2600 : 1800, spin: prevMode === 'boot' ? 1.6 : 1.05 });
    else resumeSpin();
  }
  addEventListener('hashchange', route, sig);

  // ------------------------------------------------------------------ info panel
  const info = $('#gx-info');
  const li = (id, meta = '', extra = '') => {
    const n = byId.get(id); if (!n) return '';
    return `<button class="li${extra}" data-go="${esc(id)}" style="--dot:${cssDot(n)}"><span class="d"></span><span>${esc(n.label)}</span>${meta ? `<span class="m">${meta}</span>` : ''}</button>`;
  };
  const chip = id => { const n = byId.get(id); return n ? `<button class="chip${n.type === 'term' ? ' term' : ''}" data-go="${esc(id)}" style="--dot:${cssDot(n)}"><span class="d"></span>${esc(n.label)}</button>` : ''; };
  const group = (title, body, count) => body ? `<div class="grp"><h3>${title}${count != null ? `<span>${count}</span>` : ''}</h3>${body}</div>` : '';
  const listOf = (ids, meta, max = 14) => {
    if (!ids.length) return '';
    const head = ids.slice(0, max).map(id => li(id, meta ? meta(id) : '')).join('');
    const rest = ids.slice(max);
    return head + (rest.length ? `<div class="restwrap" hidden>${rest.map(id => li(id, meta ? meta(id) : '')).join('')}</div><button class="more" data-more>+ ${rest.length}개 더 보기</button>` : '');
  };
  const edgeIds = (n, kind, dir) => linksOf.get(n.id).filter(l => l.kind === kind && (dir === 'out' ? l.s === n.id : dir === 'in' ? l.t === n.id : true)).map(l => l.s === n.id ? l.t : l.s);
  const mins = w => Math.max(1, Math.round(w / 500));
  const kicker = (n, ctx) => `<div class="ik" style="--dot:${cssDot(n)}"><span class="sw"></span>${TYPE[n.type]}${ctx ? `<i>· ${ctx}</i>` : ''}</div>`;
  const badgeOf = id => byId.get(id).sec ? esc(byId.get(byId.get(id).sec).badge) : '';

  function renderInfo(n) {
    let h = `<button class="x" data-close aria-label="전체 지도로">&times;</button>`;
    const T = n.type;
    if (T === 'page') {
      const sec = byId.get(n.sec), P = PAGES[n.id];
      const out = edgeIds(n, 'link', 'out'), inn = edgeIds(n, 'link', 'in');
      const tools = edgeIds(n, 'uses', 'out');
      const i = sec.pages.indexOf(n.id), prev = sec.pages[i - 1], next = sec.pages[i + 1];
      h += kicker(n, `${esc(sec.badge)} ${esc(sec.label)} · ${n.pos}/${n.of}`) +
        `<h2>${esc(n.label)}</h2><p class="desc">${esc(n.desc)}</p>` +
        `<div class="meta"><span><b>${fmt(n.words)}</b>자</span><span>약 ${mins(n.words)}분</span><span>연결 <b>${out.length}</b></span><span>인용됨 <b>${inn.length}</b></span></div>` +
        `<div class="acts"><button class="btn primary" data-read="${esc(n.id)}">문서 읽기 &rarr;</button><button class="btn" data-open="${esc(n.id)}">위키에서 열기 &#8599;</button></div>` +
        group('이 문서의 목차', P && P.heads.length ? P.heads.map((x, k) => `<button class="li" data-read="${esc(n.id)}" data-anchor="${esc(x.id)}" style="--dot:var(--rule)"><span class="n">${String(k + 1).padStart(2, '0')}</span><span>${esc(x.t)}</span></button>`).join('') : '') +
        group('이 문서가 연결한 문서', listOf(out, badgeOf), out.length) +
        group('이 문서를 인용한 문서', listOf(inn, badgeOf), inn.length) +
        group('이 문서의 용어', (n.terms || []).length ? `<div class="chips">${n.terms.slice(0, 16).map(chip).join('')}</div>` : '', (n.terms || []).length) +
        group('함께 쓰는 AI 도구', listOf(tools), tools.length) +
        `<div class="sibs">${prev ? `<button data-go="${esc(prev)}"><span>&larr; 이전</span>${esc(byId.get(prev).label)}</button>` : '<span></span>'}${next ? `<button data-go="${esc(next)}"><span>다음 &rarr;</span>${esc(byId.get(next).label)}</button>` : '<span></span>'}</div>`;
    } else if (T === 'section') {
      const col = byId.get('col:' + n.group);
      const w = n.pages.reduce((a, id) => a + (byId.get(id).words || 0), 0);
      const lean = {}, leanedBy = {};
      for (const pid of n.pages) for (const l of linksOf.get(pid)) {
        if (l.kind !== 'link') continue;
        const other = byId.get(l.s === pid ? l.t : l.s), os = other.sec || (other.type === 'section' ? other.id : null);
        if (!os || os === n.id) continue;
        (l.s === pid ? lean : leanedBy)[os] = ((l.s === pid ? lean : leanedBy)[os] || 0) + 1;
      }
      const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 6);
      const bars = o => top(o).map(([id, c]) => li(id, `${c}`, '')).join('');
      h += kicker(n, `${esc(col.label)} · ${esc(n.badge)}`) + `<h2>${esc(n.label)}</h2><p class="desc">${esc(n.desc)}</p>` +
        `<div class="meta"><span>문서 <b>${n.pages.length}</b></span><span><b>${fmt(w)}</b>자</span><span>약 ${mins(w)}분</span></div>` +
        `<div class="acts"><button class="btn primary" data-read="${esc(n.pages[0])}">처음부터 읽기 &rarr;</button></div>` +
        group('문서', n.pages.map((id, k) => `<button class="li" data-go="${esc(id)}" style="--dot:${cssDot(n)}"><span class="n">${k + 1}</span><span>${esc(byId.get(id).label)}</span><span class="m">${mins(byId.get(id).words || 0)}분</span></button>`).join(''), n.pages.length) +
        group('기대는 분야', bars(lean)) + group('기대 오는 분야', bars(leanedBy));
    } else if (T === 'collection') {
      const members = edgeIds(n, 'contains', 'out');
      const cid = n.id.slice(4);
      if (PATHS.includes(cid)) {
        const secs = sectionsOf(cid);
        h += kicker(n) + `<h2>${esc(n.label)}</h2><p class="desc">${esc(n.desc)}</p>` +
          `<div class="meta"><span>문서 <b>${secs.reduce((a, s) => a + byId.get(s).pages.length, 0)}</b></span><span>분야 <b>${secs.length}</b></span></div>` +
          (secs.length ? `<div class="acts"><button class="btn primary" data-read="${esc(byId.get(secs[0]).pages[0])}">처음부터 읽기 &rarr;</button></div>` : '') +
          group('분야', secs.map(id => li(id, `문서 ${byId.get(id).pages.length}`)).join(''), secs.length);
      } else if (cid === 'term') {
        const terms = members.sort((a, b) => byId.get(b).inpages.length - byId.get(a).inpages.length);
        h += kicker(n) + `<h2>${esc(n.label)}</h2><p class="desc">${esc(n.desc)}</p>` +
          group('많이 다루는 순', listOf(terms, id => `문서 ${byId.get(id).inpages.length}`, 60), terms.length);
      } else {
        h += kicker(n) + `<h2>${esc(n.label)}</h2><p class="desc">${esc(n.desc)}</p>` +
          group('도구', listOf(members, null, 30), members.length);
      }
    } else if (T === 'term') {
      const byCount = [...n.inpages].sort((a, b) => b[1] - a[1]);
      const mx = byCount[0]?.[1] || 1;
      const co = {};
      const mine = new Set(n.inpages.map(x => x[0]));
      for (const t of nodes) if (t.type === 'term' && t !== n) {
        const c = t.inpages.filter(x => mine.has(x[0])).length;
        if (c) co[t.id] = c / Math.sqrt(t.inpages.length * n.inpages.length);
      }
      const rel = Object.entries(co).sort((a, b) => b[1] - a[1]).slice(0, 8).map(x => x[0]);
      const pagesHtml = byCount.slice(0, 14).map(([id, c]) => {
        const p = byId.get(id);
        return `<button class="li" data-go="${esc(id)}" style="--dot:${cssDot(p)}"><span class="d"></span><span>${esc(p.label)}</span><span class="bar" style="width:${Math.max(6, c / mx * 54)}px"></span><span class="m">${c}</span></button>`;
      }).join('');
      const rest = byCount.slice(14).map(x => x[0]);
      h += kicker(n) + `<h2>${esc(n.label)}</h2><p class="desc">${esc(n.desc)}</p>` +
        `<div class="meta"><span>문서 <b>${n.inpages.length}</b></span><span>언급 <b>${n.total}</b></span></div>` +
        `<div class="acts"><button class="btn primary" data-read="${esc(n.inpages[0][0])}">가장 많이 다룬 문서 읽기 &rarr;</button></div>` +
        group('가장 많이 기대는 문서', pagesHtml + (rest.length ? `<div class="restwrap" hidden>${rest.map(id => li(id)).join('')}</div><button class="more" data-more>+ ${rest.length}개 더 보기</button>` : ''), n.inpages.length) +
        group('자주 함께 나오는 용어', rel.length ? `<div class="chips">${rel.map(chip).join('')}</div>` : '');
    } else {
      // INDEX AI tool
      const used = (n.inpages || []).map(x => x[0]);
      const rel = edgeIds(n, 'related');
      h += kicker(n, 'INDEX Apps') + `<h2>${esc(n.label)}</h2><p class="desc">${esc(n.desc)}</p>` +
        `<div class="acts"><button class="btn primary" data-tool="${esc(n.url)}">도구 열기 &#8599;</button></div>` +
        group('관련 용어', rel.length ? `<div class="chips">${rel.map(chip).join('')}</div>` : '') +
        group('관련 문서', listOf(used), used.length);
    }
    info.innerHTML = h;
    info.scrollTop = 0;
  }
  info.addEventListener('click', e => {
    const t = e.target.closest('[data-go],[data-read],[data-close],[data-more],[data-open],[data-tool]');
    if (!t) return;
    if (t.dataset.more !== undefined) { const r = t.previousElementSibling; r.hidden = false; t.remove(); return; }
    if (t.dataset.close !== undefined) return go('root');
    if (t.dataset.open) return host.openPage(t.dataset.open);
    if (t.dataset.tool) return host.openTool(t.dataset.tool);
    if (t.dataset.read) { pendingAnchor = t.dataset.anchor || null; return read(t.dataset.read); }
    go(t.dataset.go);
  });
  for (const box of [info, $('#gx-hero'), $('#gx-contents'), $('#gx-reader')]) {
    box.addEventListener('mouseover', e => { const t = e.target.closest('[data-go],[data-node]'); if (t) setPreview(byId.get(t.dataset.go || t.dataset.node), 'list'); });
    box.addEventListener('mouseout', e => { const t = e.target.closest('[data-go],[data-node]'); if (t && !t.contains(e.relatedTarget)) setPreview(null, 'list'); });
  }

  // ------------------------------------------------------------------ reader
  const rBody = $('#gx-r-body'), rScroll = $('#gx-r-scroll'), rCrumb = $('#gx-r-crumb'), reader = $('#gx-reader');
  let pendingAnchor = null;
  function renderReader(n) {
    const P = PAGES[n.id], sec = byId.get(n.sec);
    const i = FLAT.indexOf(n.id), prev = FLAT[i - 1], next = FLAT[i + 1];
    rCrumb.innerHTML = `<b style="color:${cssDot(n)}">${esc(sec.badge)}</b><button data-go="${esc(sec.id)}">${esc(sec.label)}</button> · ${n.of}개 중 ${n.pos}번째`;
    rBody.innerHTML = !P ? '<p>문서를 불러오지 못했습니다. 새로고침해 주세요.</p>' :
      `<h1>${esc(n.label)}</h1>${P.html}` +
      ((n.terms || []).length ? `<div class="rterms"><h4>이 문서의 용어</h4><div class="chips">${n.terms.slice(0, 18).map(chip).join('')}</div></div>` : '') +
      `<nav class="pager">${prev ? `<a href="#/read/${encodeURIComponent(prev)}" data-node="${esc(prev)}"><span class="lbl">&larr; 이전</span>${esc(byId.get(prev).label)}</a>` : '<span></span>'}` +
      `${next ? `<a href="#/read/${encodeURIComponent(next)}" data-node="${esc(next)}" style="text-align:right"><span class="lbl">다음 &rarr;</span>${esc(byId.get(next).label)}</a>` : '<span></span>'}</nav>` +
      `<div class="src">원문 문서: <button class="srcbtn" data-open="${esc(n.id)}">INDEX 위키에서 열기 &#8599;</button></div>`;
    rScroll.style.scrollBehavior = 'auto';
    rScroll.scrollTop = 0;
    if (pendingAnchor) { const el = rBody.querySelector('#' + CSS.escape(pendingAnchor)); if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 450); pendingAnchor = null; }
    rScroll.style.scrollBehavior = '';
  }
  reader.addEventListener('click', e => {
    const o = e.target.closest('[data-open]');
    if (o) { e.preventDefault(); return host.openPage(o.dataset.open); }
    const g = e.target.closest('[data-go]');
    if (g) { e.preventDefault(); const n = byId.get(g.dataset.go); if (!n) return; return n.type === 'page' ? read(n.id) : go(n.id); }
  });
  $('#gx-r-close').onclick = () => go(S.sel ? S.sel.id : 'root');
  $('#gx-r-graph').onclick = () => go(S.sel ? S.sel.id : 'root');

  // ------------------------------------------------------------------ hero
  $('#gx-paths').innerHTML = PATHS.map(k => {
    const col = byId.get('col:' + k); if (!col) return '';
    const secs = sectionsOf(k);
    const pages = secs.reduce((a, s) => a + byId.get(s).pages.length, 0);
    const badge = secs.length ? `${byId.get(secs[0]).badge}–${byId.get(secs[secs.length - 1]).badge}` : '';
    return `<button class="path" data-go="col:${k}" style="--dot:var(--c-${k})"><span class="pk">${badge}</span><b>${esc(col.label)}</b><span class="pn">문서 ${pages}</span><p>${esc(col.desc)}</p></button>`;
  }).join('');
  $('#gx-paths').addEventListener('click', e => { const t = e.target.closest('[data-go]'); if (t) go(t.dataset.go); });
  const st = G.stats;
  $('#gx-stats').innerHTML = [[fmt(st.pages), '문서'], [(st.words / 10000).toFixed(st.words >= 100000 ? 0 : 1) + '만', '글자'], [st.terms, '용어'], [st.tools, 'AI 도구'], [fmt(st.edges), '연결']]
    .map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('');

  // ------------------------------------------------------------------ layers
  const layersBox = $('#gx-layers');
  function renderLayers() {
    layersBox.innerHTML = LAYERS.map(L => {
      const c = nodes.filter(n => n.group === L.key && n.type !== 'collection' && n.type !== 'section').length;
      return `<button class="lyr" data-layer="${L.key}" aria-pressed="${!!layerOn[L.key]}" style="--dot:var(--c-${L.key})" title="보이기·숨기기: ${L.label}"><span class="d"></span>${L.label}<span class="n">${c}</span></button>`;
    }).join('');
  }
  renderLayers();
  layersBox.addEventListener('click', e => {
    const b = e.target.closest('[data-layer]'); if (!b) return;
    const k = b.dataset.layer;
    layerOn[k] = !layerOn[k];
    if (S.sel && !visible(S.sel)) { layerOn[k] = true; return; }
    store.set('layers', layerOn);
    renderLayers();
    if (S.sel) { S.focus = focusSetOf(S.sel); buildHL(VL.filter(l => (l._S === S.sel || l._T === S.sel) && visible(l._S) && visible(l._T))); if (S.mode === 'focus') renderInfo(S.sel); }
    retarget(); refreshLabels();
  });
  layersBox.addEventListener('mouseover', e => { const b = e.target.closest('[data-layer]'); if (b) setPreview(byId.get('col:' + b.dataset.layer), 'list'); });
  layersBox.addEventListener('mouseout', () => setPreview(null, 'list'));

  const spinBtn = $('#gx-spin');
  const paintSpin = () => { spinBtn.setAttribute('aria-pressed', S.spin); spinBtn.title = S.spin ? '회전 멈추기' : '회전 다시 시작'; };
  paintSpin();
  spinBtn.onclick = () => { S.spin = !S.spin; store.set('spin', S.spin); paintSpin(); resumeSpin(); };
  $('#gx-home').onclick = () => go('root');
  $('#gx-brand').onclick = e => { e.preventDefault(); go('root'); };
  rootEl.querySelectorAll('[data-nav]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); host.nav(a.dataset.nav); }));

  // ------------------------------------------------------------------ contents
  const contents = $('#gx-contents'), cBtn = $('#gx-btn-contents');
  function renderContents() {
    const cur = S.sel?.id;
    const block = col => `<div class="cg" style="--dot:var(--c-${col})"><h4><span class="d"></span>${esc(byId.get('col:' + col)?.label || col)}</h4>` +
      sectionsOf(col).map(sid => {
        const s = byId.get(sid), open = cur && (cur === sid || s.pages.includes(cur));
        return `<div class="cs${open ? ' open' : ''}" style="--dot:var(--c-${col})"><button data-sec="${esc(sid)}"><span class="k">${esc(s.badge)}</span>${esc(s.label)}<span class="n">${s.pages.length}</span></button><ol>` +
          s.pages.map(pid => `<li><button data-page="${esc(pid)}" data-node="${esc(pid)}" class="${pid === cur ? 'cur' : ''}">${esc(byId.get(pid).label)}</button></li>`).join('') + '</ol></div>';
      }).join('') + '</div>';
    $('#gx-c-body').innerHTML = PATHS.map(block).join('');
  }
  function openContents() { renderContents(); rootEl.classList.add('c-open'); cBtn.setAttribute('aria-expanded', 'true'); }
  function closeContents() { rootEl.classList.remove('c-open'); cBtn.setAttribute('aria-expanded', 'false'); }
  cBtn.onclick = () => rootEl.classList.contains('c-open') ? closeContents() : openContents();
  contents.addEventListener('click', e => {
    const s = e.target.closest('[data-sec]'), p = e.target.closest('[data-page]');
    if (p) return read(p.dataset.page);
    if (s) { const box = s.parentElement; box.classList.toggle('open'); setPreview(byId.get(s.dataset.sec), 'list'); }
  });

  // ------------------------------------------------------------------ search
  const q = $('#gx-q'), hits = $('#gx-hits');
  let hitIdx = 0, hitList = [];
  function search(v) {
    v = v.trim().toLowerCase(); if (v.length < 1) return [];
    const out = [];
    for (const n of nodes) {
      if (n.type === 'root') continue;
      const l = n.label.toLowerCase();
      let sc = l === v ? 120 : l.startsWith(v) ? 70 : l.includes(v) ? 45 : 0;
      let snip = '';
      if (n.type === 'page') {
        const t = PAGES[n.id]?.text || '', tl = t.toLowerCase();
        const at = tl.indexOf(v);
        if (at >= 0) {
          sc += 10 + Math.min(tl.split(v).length - 1, 8) * 2;
          if (!l.includes(v)) snip = (at > 40 ? '…' : '') + esc(t.slice(Math.max(0, at - 40), at)) + '<mark>' + esc(t.slice(at, at + v.length)) + '</mark>' + esc(t.slice(at + v.length, at + v.length + 70)) + '…';
        }
      } else if (sc === 0 && (n.desc || '').toLowerCase().includes(v)) sc = 8;
      if (!sc) continue;
      sc += { section: 8, term: 7, page: 4, collection: 6, app: 3 }[n.type] || 0;
      out.push({ n, sc, snip });
    }
    return out.sort((a, b) => b.sc - a.sc).slice(0, 12);
  }
  function paintHits() {
    hits.innerHTML = hitList.length ? hitList.map((h, i) => {
      const n = h.n, sec = n.sec ? byId.get(n.sec) : null;
      const ctx = sec ? `${sec.badge} ${sec.label}` : '';
      return `<button class="hit${i === hitIdx ? ' on' : ''}" data-i="${i}" style="--dot:${cssDot(n)}"><span class="d"></span><span><b>${esc(n.label)}</b><i>${TYPE[n.type]}${ctx ? ' · ' + esc(ctx) : ''}</i>${h.snip ? `<em>${h.snip}</em>` : ''}</span></button>`;
    }).join('') : '<div class="none">맞는 문서가 없습니다</div>';
    hits.classList.add('open');
  }
  function pickHit(i) {
    const h = hitList[i]; if (!h) return;
    q.value = ''; hits.classList.remove('open'); q.blur();
    h.n.type === 'page' ? read(h.n.id) : go(h.n.id);
  }
  q.addEventListener('input', () => {
    hitList = search(q.value); hitIdx = 0;
    if (q.value.trim().length < 1) { hits.classList.remove('open'); setPreview(null, 'list'); return; }
    paintHits();
    setPreview(hitList[0]?.n || null, 'list');
  });
  q.addEventListener('keydown', e => {
    if (e.isComposing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!hitList.length) return;
      hitIdx = (hitIdx + (e.key === 'ArrowDown' ? 1 : -1) + hitList.length) % hitList.length;
      paintHits(); setPreview(hitList[hitIdx].n, 'list');
    } else if (e.key === 'Enter') { e.preventDefault(); pickHit(hitIdx); }
    else if (e.key === 'Escape') { q.value = ''; hits.classList.remove('open'); setPreview(null, 'list'); q.blur(); e.stopPropagation(); }
  });
  hits.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) pickHit(+b.dataset.i); });
  hits.addEventListener('mouseover', e => { const b = e.target.closest('[data-i]'); if (b) setPreview(hitList[+b.dataset.i].n, 'list'); });
  document.addEventListener('click', e => { if (!e.target.closest('.search')) hits.classList.remove('open'); }, sig);

  // ------------------------------------------------------------------ keys
  document.addEventListener('keydown', e => {
    if (e.target instanceof Element && e.target.matches('input,textarea,[contenteditable="true"]')) return;
    if (e.key === '/') { e.preventDefault(); q.focus(); return; }
    if (e.key === 'Escape') {
      if (rootEl.classList.contains('c-open')) return closeContents();
      if (S.mode === 'read') return go(S.sel.id);
      if (S.mode === 'focus') return go('root');
    }
    if (S.mode === 'read' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      const i = FLAT.indexOf(S.sel.id), t = FLAT[i + (e.key === 'ArrowRight' ? 1 : -1)];
      if (t) read(t);
    }
  }, sig);

  // ------------------------------------------------------------------ theme
  const themeBtn = $('#gx-theme');
  const isDark = () => (rootEl.dataset.theme || 'dark') === 'dark';
  function paintThemeBtn() {
    const d = isDark();
    themeBtn.textContent = d ? '☀' : '☾';
    themeBtn.title = d ? '밝은 화면' : '어두운 화면';
    themeBtn.setAttribute('aria-pressed', String(d));
  }
  function recolor() {
    readColors();
    scene.fog.color.copy(PAPER);
    for (const n of nodes) {
      if (!n._core) continue;
      n._core.material.color.set(dotOf(n));
      if (n._shell) n._shell.material.uniforms.color.value.set(dotOf(n));
    }
    VL.forEach((l, i) => {
      const a = new THREE.Color(dotOf(l._S)), b = new THREE.Color(dotOf(l._T)), o = i * 8;
      lcol[o] = a.r; lcol[o + 1] = a.g; lcol[o + 2] = a.b;
      lcol[o + 4] = b.r; lcol[o + 5] = b.g; lcol[o + 6] = b.b;
    });
    lgeo.attributes.color.needsUpdate = true;
    if (hl.list.length) buildHL(hl.list);
  }
  themeBtn.onclick = () => {
    rootEl.dataset.theme = isDark() ? 'light' : 'dark';
    store.set('theme', rootEl.dataset.theme);
    paintThemeBtn(); recolor();
  };
  paintThemeBtn();

  // ------------------------------------------------------------------ resize
  addEventListener('resize', () => {
    graph.width(W()).height(H());
    hl.mat.resolution.set(W(), H());
    measure();
    applyView(true);
  }, sig);
  measure();
  graph.width(W()).height(H());
  hl.mat.resolution.set(W(), H());

  camera.position.set(0, 120, 2200);
  controls.target.set(0, 0, 0);

  function failed(err) {
    console.error(err);
    rootEl.classList.remove('booting');
    const d = document.createElement('div');
    d.className = 'fail';
    d.innerHTML = '<div><p>3D 지도를 그리려면 WebGL이 필요합니다. 다른 브라우저에서 열어 주세요.</p></div>';
    rootEl.appendChild(d);
  }

  return () => {
    disposed = true;
    off.abort();
    cancelAnimationFrame(rafId);
    clearTimeout(spinTimer);
    try { graph.pauseAnimation(); } catch { }
    try { graph._destructor(); } catch { }
    labels.forEach(el => el.remove());
    for (const g of Object.values(GEO)) g.dispose();
    dotTex.dispose();
  };
}
