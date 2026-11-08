/* 3D wall for the INDEX 지식 현황판, ported from hosungseo/korea100 warroom (web/public/warroom/index.html),
   MIT (c) 2026 Hoseong Seo — see third_party/korea100/LICENSE and NOTICE.
   Kept from the original: towers on an arc (one per gate), stacked labelled panels with instanced
   status tiles and additive glow, the gold route tube with glowing nodes, hover outline, floor grid,
   dust, boot light-up and the drifting camera rig with gate focus.
   INDEX mapping: gate = 분야, panel = 검수 단계 (초안 → 출처 없음 → 검토 대기 → 검수 완료, bottom to top),
   tile = one wiki document, route = the document's wiki links (흐름). */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export type StageStatus = 'published' | 'ready' | 'unsourced' | 'broken' | 'draft';
export type StageDoc = { id: string; title: string; status: StageStatus; links: string[] };
export type StagePanel = { key: string; label: string; docs: StageDoc[] };
export type StageGate = { key: string; label: string; panels: StagePanel[] };

export const STAGE_STATUS: Record<StageStatus, { label: string; en: string; color: number; css: string; pulse: number }> = {
  published: { label: '검수 완료', en: 'DONE', color: 0x2ee6a8, css: '#2ee6a8', pulse: 0 },
  broken: { label: '깨진 링크', en: 'FIX', color: 0xffb020, css: '#ffb020', pulse: 2.6 },
  ready: { label: '검토 대기', en: 'REVIEW', color: 0x38c6f4, css: '#38c6f4', pulse: 1.3 },
  unsourced: { label: '출처 없음', en: 'NO SRC', color: 0x9d86f5, css: '#9d86f5', pulse: 0.7 },
  draft: { label: '초안', en: 'DRAFT', color: 0x2f6390, css: '#35618a', pulse: 0 },
};

type Props = {
  gates: StageGate[];
  focusedGate: string | null;
  selectedDoc: string | null;
  /** Default flow lines when nothing is selected: [fromDocId, toDocId][] */
  overviewRoute: string[][];
  onFocusGate: (key: string | null) => void;
  onSelectDoc: (id: string | null) => void;
};

const COLS = 6;
const PITCH = 0.29;
const TILE = 0.26;
const PANEL_W = COLS * PITCH + 0.5;
const LABEL_H = 0.52;
const PANEL_PAD = 0.16;
const PANEL_GAP = 0.22;
const GATE_STEP = PANEL_W + 0.8;
const R = 30;
const BASE_Y = 0.35;
const BOOT_DUR = 2600;
const FONT_KO = "'Apple SD Gothic Neo', Pretendard, 'Noto Sans KR', sans-serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, monospace";

function panelTexture(panel: StagePanel, dominant: StageStatus, wPx: number, hPx: number, labelFrac: number) {
  const c = document.createElement('canvas');
  c.width = wPx;
  c.height = hPx;
  const x = c.getContext('2d')!;
  const s = STAGE_STATUS[dominant];
  x.fillStyle = 'rgba(8,16,26,0.94)';
  x.fillRect(0, 0, wPx, hPx);
  const grad = x.createLinearGradient(0, 0, 0, hPx);
  grad.addColorStop(0, 'rgba(56,198,244,0.10)');
  grad.addColorStop(0.25, 'rgba(56,198,244,0)');
  x.fillStyle = grad;
  x.fillRect(0, 0, wPx, hPx);
  x.strokeStyle = 'rgba(56,198,244,0.35)';
  x.lineWidth = 2;
  x.strokeRect(1, 1, wPx - 2, hPx - 2);
  x.strokeStyle = s.css;
  x.lineWidth = 4;
  const k = 26;
  x.beginPath();
  x.moveTo(1, k);
  x.lineTo(1, 1);
  x.lineTo(k, 1);
  x.moveTo(wPx - k, hPx - 1);
  x.lineTo(wPx - 1, hPx - 1);
  x.lineTo(wPx - 1, hPx - k);
  x.stroke();
  const lh = hPx * labelFrac;
  x.fillStyle = 'rgba(56,198,244,0.07)';
  x.fillRect(2, 2, wPx - 4, lh - 6);
  x.font = `600 24px ${FONT_MONO}`;
  x.fillStyle = s.css;
  x.fillText(s.en, 20, lh * 0.62);
  x.font = `700 27px ${FONT_KO}`;
  x.fillStyle = '#d7e6f2';
  x.fillText(panel.label, 150, lh * 0.62);
  x.font = `700 30px ${FONT_MONO}`;
  x.textAlign = 'right';
  x.fillStyle = '#ffb020';
  x.fillText(String(panel.docs.length), wPx - 20, lh * 0.63);
  x.textAlign = 'left';
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function headerTexture(index: number, gate: StageGate) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 148;
  const x = c.getContext('2d')!;
  x.fillStyle = 'rgba(10,20,32,0.96)';
  x.fillRect(0, 0, 1024, 148);
  x.fillStyle = 'rgba(255,176,32,0.9)';
  x.fillRect(0, 138, 1024, 10);
  x.font = `700 64px ${FONT_MONO}`;
  x.fillStyle = '#ffb020';
  x.fillText(String(index + 1).padStart(2, '0'), 26, 92);
  x.font = `800 58px ${FONT_KO}`;
  x.fillStyle = '#e8f4fd';
  x.fillText(gate.label, 128, 92);
  const total = gate.panels.reduce((n, p) => n + p.docs.length, 0);
  x.font = `600 34px ${FONT_MONO}`;
  x.textAlign = 'right';
  x.fillStyle = '#38c6f4';
  x.fillText(`${total} DOC`, 1000, 90);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  rg.addColorStop(0, 'rgba(255,255,255,0.9)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Hold the latest callbacks/selection without rebuilding the scene. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export default function WarroomStage({ gates, focusedGate, selectedDoc, overviewRoute, onFocusGate, onSelectDoc }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const api = useRef<{ focus: (key: string | null) => void; route: (doc: string | null) => void } | null>(null);
  const cb = useLatest({ onFocusGate, onSelectDoc, overviewRoute });

  // Build (or rebuild when the wiki changes) the whole scene.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || gates.length === 0) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const size = () => ({ w: host.clientWidth || 1, h: host.clientHeight || 1 });
    renderer.setSize(size().w, size().h);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04070c);
    scene.fog = new THREE.Fog(0x04070c, 30, 115);
    const camera = new THREE.PerspectiveCamera(50, size().w / size().h, 0.1, 200);
    const disposables: { dispose: () => void }[] = [];
    const track = <T extends { dispose: () => void }>(o: T) => (disposables.push(o), o);

    const docs: { doc: StageDoc; gate: number }[] = [];
    gates.forEach((g, gi) => g.panels.forEach((p) => p.docs.forEach((doc) => docs.push({ doc, gate: gi }))));
    const TOTAL = Math.max(1, docs.length);

    const tileGeo = track(new THREE.PlaneGeometry(TILE, TILE));
    const tileMat = track(new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide }));
    const tiles = new THREE.InstancedMesh(tileGeo, tileMat, TOTAL);
    tiles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TOTAL * 3), 3);
    scene.add(tiles);

    const glowTex = track(glowTexture());
    const glowGeo = track(new THREE.PlaneGeometry(TILE * 2.2, TILE * 2.2));
    const glowMat = track(new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    const glows = new THREE.InstancedMesh(glowGeo, glowMat, TOTAL);
    glows.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TOTAL * 3), 3);
    scene.add(glows);

    const inst: { st: StageStatus; phase: number; boot: number; id: string; gate: number }[] = [];
    const tilePos = new Map<string, THREE.Vector3>();
    const tileNormal = new Map<string, THREE.Vector3>();
    const panels: THREE.Mesh[] = [];
    const gateInfo: { key: string; focusPos: THREE.Vector3; focusTgt: THREE.Vector3 }[] = [];
    let maxTop = 0;
    const dummy = new THREE.Object3D();
    let idx = 0;

    gates.forEach((g, gi) => {
      const ang = (gi - (gates.length - 1) / 2) * (GATE_STEP / R);
      const grp = new THREE.Group();
      grp.position.set(Math.sin(ang) * R, 0, -Math.cos(ang) * R);
      grp.rotation.y = -ang;
      scene.add(grp);
      grp.updateMatrixWorld(true);
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(grp.quaternion);

      let y = BASE_Y;
      g.panels.forEach((p) => {
        const count = Math.max(1, p.docs.length);
        const rows = Math.ceil(count / COLS);
        const ph = LABEL_H + rows * PITCH + PANEL_PAD * 2;
        const wPx = 1024;
        const hPx = Math.max(96, Math.round((ph / PANEL_W) * 1024));
        const tally = new Map<StageStatus, number>();
        p.docs.forEach((d) => tally.set(d.status, (tally.get(d.status) ?? 0) + 1));
        const dominant = ([...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'draft') as StageStatus;
        const tex = track(panelTexture(p, dominant, wPx, hPx, LABEL_H / ph));
        const mat = track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
        const geo = track(new THREE.PlaneGeometry(PANEL_W, ph));
        const panel = new THREE.Mesh(geo, mat);
        panel.position.set(0, y + ph / 2, 0);
        panel.userData = { gate: gi };
        grp.add(panel);
        panels.push(panel);

        const yTop = y + ph - LABEL_H - PANEL_PAD - PITCH / 2;
        p.docs.forEach((d, i) => {
          const r = Math.floor(i / COLS);
          const c = i % COLS;
          const rowCount = r === rows - 1 ? p.docs.length - r * COLS : COLS;
          const rx0 = -(rowCount - 1) * PITCH / 2;
          dummy.position.set(rx0 + c * PITCH, yTop - r * PITCH, 0.012);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          dummy.matrix.premultiply(grp.matrixWorld);
          tiles.setMatrixAt(idx, dummy.matrix);
          glows.setMatrixAt(idx, dummy.matrix);
          tilePos.set(d.id, new THREE.Vector3().setFromMatrixPosition(dummy.matrix));
          tileNormal.set(d.id, normal);
          inst.push({ st: d.status, phase: Math.random() * Math.PI * 2, boot: idx, id: d.id, gate: gi });
          idx++;
        });
        y += ph + PANEL_GAP;
      });

      const headerTex = track(headerTexture(gi, g));
      const headerMat = track(new THREE.MeshBasicMaterial({ map: headerTex, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
      const headerGeo = track(new THREE.PlaneGeometry(PANEL_W, (PANEL_W * 148) / 1024));
      const header = new THREE.Mesh(headerGeo, headerMat);
      header.position.set(0, y + 0.36, 0);
      header.userData = { gate: gi, header: true };
      grp.add(header);
      panels.push(header);

      maxTop = Math.max(maxTop, y + 0.9);
      const center = new THREE.Vector3(Math.sin(ang) * R, y * 0.48, -Math.cos(ang) * R);
      const fd = Math.max(10, (y + 4) / 0.72);
      gateInfo.push({
        key: g.key,
        focusPos: new THREE.Vector3(Math.sin(ang) * (R - fd), y * 0.48 + 0.6, -Math.cos(ang) * (R - fd)),
        focusTgt: center,
      });

      const poolGeo = track(new THREE.PlaneGeometry(PANEL_W * 1.5, 3.4));
      const poolMat = track(new THREE.MeshBasicMaterial({ map: glowTex, color: 0x11405e, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      const pool = new THREE.Mesh(poolGeo, poolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(Math.sin(ang) * (R - 1.2), 0.01, -Math.cos(ang) * (R - 1.2));
      scene.add(pool);
    });

    // hover outline (panels) + tile marker
    const hoverGeo = track(new THREE.PlaneGeometry(1, 1));
    const hoverMat = track(new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    const hover = new THREE.Mesh(hoverGeo, hoverMat);
    scene.add(hover);

    // floor grid
    {
      const c = document.createElement('canvas');
      c.width = c.height = 512;
      const x = c.getContext('2d')!;
      x.fillStyle = '#04070c';
      x.fillRect(0, 0, 512, 512);
      x.strokeStyle = 'rgba(56,198,244,0.10)';
      x.lineWidth = 1;
      for (let i = 0; i <= 512; i += 32) {
        x.beginPath();
        x.moveTo(i, 0);
        x.lineTo(i, 512);
        x.stroke();
        x.beginPath();
        x.moveTo(0, i);
        x.lineTo(512, i);
        x.stroke();
      }
      const t = track(new THREE.CanvasTexture(c));
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(30, 30);
      const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(240, 240)), track(new THREE.MeshBasicMaterial({ map: t })));
      floor.rotation.x = -Math.PI / 2;
      scene.add(floor);
    }

    // dust
    {
      const n = 700;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 70;
        pos[i * 3 + 1] = Math.random() * 16;
        pos[i * 3 + 2] = -Math.random() * 40 + 6;
      }
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      scene.add(new THREE.Points(geo, track(new THREE.PointsMaterial({ color: 0x38c6f4, size: 0.045, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }))));
    }

    // ── route (흐름): thin gold/cyan lines between linked documents, with pulses travelling along them ──
    const routeObjs: THREE.Object3D[] = [];
    const pulses: { sprite: THREE.Sprite; curve: THREE.Curve<THREE.Vector3>; offset: number; speed: number }[] = [];
    const streams: { map: THREE.Texture; speed: number }[] = [];
    // Bright streaks on a dim track: scrolled along each line so the data visibly moves source → target.
    const streakCanvas = document.createElement('canvas');
    streakCanvas.width = 256;
    streakCanvas.height = 4;
    {
      const g = streakCanvas.getContext('2d')!;
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fillRect(0, 0, 256, 4);
      for (const [x, w] of [[0, 70], [128, 46]] as const) {
        const grad = g.createLinearGradient(x, 0, x + w, 0);
        grad.addColorStop(0, 'rgba(255,255,255,0.22)');
        grad.addColorStop(0.85, 'rgba(255,255,255,1)');
        grad.addColorStop(1, 'rgba(255,255,255,0.22)');
        g.fillStyle = grad;
        g.fillRect(x, 0, w, 4);
      }
    }
    const streakTex = track(new THREE.CanvasTexture(streakCanvas));
    streakTex.wrapS = THREE.RepeatWrapping;
    const clearRoute = () => {
      routeObjs.forEach((o) => {
        scene.remove(o);
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose();
      });
      routeObjs.length = 0;
      pulses.length = 0;
      streams.forEach((st) => st.map.dispose());
      streams.length = 0;
    };
    const anchor = (id: string) => {
      const p = tilePos.get(id);
      const n = tileNormal.get(id);
      return p && n ? { p: p.clone().add(n.clone().multiplyScalar(0.03)), n } : null;
    };
    /** Same tower: leave the wall, run in front of it, come back in (no loops over the tiles).
        Different towers: rise off the wall and arc over to the other tower. */
    const flowCurve = (a: { p: THREE.Vector3; n: THREE.Vector3 }, b: { p: THREE.Vector3; n: THREE.Vector3 }, sameGate: boolean) => {
      if (sameGate) {
        const out = 0.35 + a.p.distanceTo(b.p) * 0.12;
        return new THREE.CatmullRomCurve3([a.p, a.p.clone().add(a.n.clone().multiplyScalar(out)), b.p.clone().add(b.n.clone().multiplyScalar(out)), b.p], false, 'centripetal');
      }
      const lift = 0.6 + a.p.distanceTo(b.p) * 0.05;
      const up = new THREE.Vector3(0, lift, 0);
      const a1 = a.p.clone().add(a.n.clone().multiplyScalar(0.9)).add(up.clone().multiplyScalar(0.5));
      const b1 = b.p.clone().add(b.n.clone().multiplyScalar(0.9)).add(up.clone().multiplyScalar(0.5));
      const mid = a1.clone().lerp(b1, 0.5).add(up);
      return new THREE.CatmullRomCurve3([a.p, a1, mid, b1, b.p], false, 'centripetal');
    };
    const line = (curve: THREE.Curve<THREE.Vector3>, color: number, opacity: number, radius: number, speed = 0.5) => {
      const map = streakTex.clone();
      map.needsUpdate = true;
      map.repeat.set(Math.max(1, curve.getLength() / 2.2), 1);
      map.offset.x = Math.random();
      streams.push({ map, speed: reduceMotion ? 0 : speed });
      const mesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 96, radius, 5, false),
        new THREE.MeshBasicMaterial({ color, map, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      );
      scene.add(mesh);
      routeObjs.push(mesh);
    };
    const dot = (at: THREE.Vector3, color: number, scale: number, opacity = 1) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.position.copy(at);
      s.scale.setScalar(scale);
      scene.add(s);
      routeObjs.push(s);
      return s;
    };
    /** Three data packets per line, evenly spaced, riding from source to target. */
    const pulse = (curve: THREE.Curve<THREE.Vector3>, color: number, speed: number) => {
      if (reduceMotion) return;
      const base = Math.random();
      for (let k = 0; k < 3; k++) {
        const sprite = dot(curve.getPoint(0), color, 0.24, 0.9);
        pulses.push({ sprite, curve, offset: base + k / 3, speed });
      }
    };
    // selection ring around the chosen tile
    const ring = (at: { p: THREE.Vector3; n: THREE.Vector3 }) => {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(TILE * 0.62, TILE * 0.78, 32),
        new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
      );
      mesh.position.copy(at.p).add(at.n.clone().multiplyScalar(0.01));
      mesh.lookAt(at.p.clone().add(at.n));
      scene.add(mesh);
      routeObjs.push(mesh);
    };
    const gateOf = new Map(inst.map((d) => [d.id, d.gate]));
    const byId = new Map(docs.map((d) => [d.doc.id, d.doc]));
    const drawRoute = (selected: string | null) => {
      clearRoute();
      if (selected && byId.has(selected)) {
        const from = anchor(selected);
        if (!from) return;
        ring(from);
        byId.get(selected)!.links.forEach((target) => {
          const to = anchor(target);
          if (!to) return;
          const curve = flowCurve(from, to, gateOf.get(selected) === gateOf.get(target));
          line(curve, 0xffc94d, 1, 0.02, 0.7);
          dot(to.p, 0xffd76a, 0.32);
          pulse(curve, 0xfff1c4, 0.22);
        });
        docs
          .filter((d) => d.doc.links.includes(selected))
          .forEach((d) => {
            const src = anchor(d.doc.id);
            if (!src) return;
            const curve = flowCurve(src, from, gateOf.get(d.doc.id) === gateOf.get(selected));
            line(curve, 0x38c6f4, 0.85, 0.015, 0.55);
            dot(src.p, 0x38c6f4, 0.26);
            pulse(curve, 0xc9f1ff, 0.18);
          });
        return;
      }
      cb.current.overviewRoute.forEach(([a, b]) => {
        const from = anchor(a!);
        const to = anchor(b!);
        if (!from || !to) return;
        const curve = flowCurve(from, to, gateOf.get(a!) === gateOf.get(b!));
        line(curve, 0xffc94d, 0.8, 0.016, 0.4);
        dot(from.p, 0xffd76a, 0.3, 0.8);
        dot(to.p, 0xffd76a, 0.3, 0.8);
        pulse(curve, 0xfff1c4, 0.12);
      });
    };
    drawRoute(null);

    // ── camera rig ──
    const overview = { pos: new THREE.Vector3(0, 8.5, 26), tgt: new THREE.Vector3(0, 6.6, -R) };
    // Fit every tower: the arc width and the tallest tower, with room for the HUD around it.
    const fitOverview = () => {
      const { w, h } = size();
      const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
      const hHalf = Math.atan(Math.tan(vHalf) * (w / h));
      const arc = gates.length * GATE_STEP;
      // the HUD rail (left) and detail panel (right) leave about 60% of the width for the wall
      const dW = arc / (1.2 * Math.tan(hHalf));
      const dH = (maxTop * 0.85) / Math.tan(vHalf);
      const d = Math.max(14, dW, dH);
      overview.tgt.set(0, maxTop * 0.42, -R);
      overview.pos.set(0, maxTop * 0.62 + 1, -R + d);
    };
    fitOverview();
    // Free 360° look-around (drag = orbit, wheel = zoom, right-drag = pan); clicks on a tower or
    // tile fly the camera there, and any drag hands control straight back to the user.
    camera.position.copy(overview.pos);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(overview.tgt);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.6;
    controls.minDistance = 3;
    controls.maxDistance = 140;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.update();
    const wantPos = overview.pos.clone();
    const wantTgt = overview.tgt.clone();
    let flying = false;
    let focused = -1;
    const mouse = { x: 0, y: 0 };
    controls.addEventListener('start', () => {
      flying = false;
    });
    const focus = (key: string | null) => {
      focused = key ? gateInfo.findIndex((g) => g.key === key) : -1;
      if (focused < 0) {
        wantPos.copy(overview.pos);
        wantTgt.copy(overview.tgt);
      } else {
        wantPos.copy(gateInfo[focused]!.focusPos);
        wantTgt.copy(gateInfo[focused]!.focusTgt);
      }
      flying = true;
    };
    api.current = { focus, route: drawRoute };

    // ── picking ──
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let hoveredPanel: THREE.Mesh | null = null;
    let hoveredTile = -1;
    const pick = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      ndc.set(mouse.x, -mouse.y);
      ray.setFromCamera(ndc, camera);
      const tileHit = ray.intersectObject(tiles, false)[0];
      hoveredTile = tileHit?.instanceId ?? -1;
      const panelHit = ray.intersectObjects(panels, false)[0];
      hoveredPanel = (panelHit?.object as THREE.Mesh) ?? null;
      renderer.domElement.style.cursor = hoveredTile >= 0 || hoveredPanel ? 'pointer' : 'crosshair';
    };
    let downAt: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY };
    };
    const onClick = (e: MouseEvent) => {
      // a drag that rotated the view is not a click
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return;
      if (hoveredTile >= 0) {
        const d = inst[hoveredTile]!;
        cb.current.onFocusGate(gates[d.gate]!.key);
        cb.current.onSelectDoc(d.id);
        return;
      }
      if (hoveredPanel) {
        const g = gates[hoveredPanel.userData.gate as number]!;
        cb.current.onSelectDoc(null);
        cb.current.onFocusGate(focused >= 0 && gateInfo[focused]!.key === g.key && hoveredPanel.userData.header ? null : g.key);
        return;
      }
      cb.current.onSelectDoc(null);
    };
    renderer.domElement.addEventListener('pointermove', pick);
    renderer.domElement.addEventListener('pointerdown', onDown);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') focus(null);
    };
    window.addEventListener('keydown', onKey);
    renderer.domElement.addEventListener('click', onClick);

    // ── animate ──
    const clock = new THREE.Clock();
    const tmp = new THREE.Color();
    const white = new THREE.Color(0xffffff);
    const bootT0 = performance.now();
    let frame = 0;
    let lastT = 0;
    const setTile = (i: number, c: THREE.Color, g: number) => {
      tiles.instanceColor!.setXYZ(i, c.r, c.g, c.b);
      glows.instanceColor!.setXYZ(i, c.r * g, c.g * g, c.b * g);
    };
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      const bootP = reduceMotion ? 1 : Math.min(1, (performance.now() - bootT0) / BOOT_DUR);
      const lit = Math.floor(bootP * TOTAL);
      for (let i = 0; i < inst.length; i++) {
        const d = inst[i]!;
        const s = STAGE_STATUS[d.st];
        if (d.boot >= lit) {
          tmp.setScalar(0.012);
          setTile(i, tmp, 0);
          continue;
        }
        tmp.setHex(s.color);
        let g = 0.8;
        if (s.pulse > 0 && !reduceMotion) {
          const w = 0.72 + 0.38 * Math.sin(t * s.pulse + d.phase);
          tmp.multiplyScalar(w);
          g = 0.95 * w;
        } else if (d.st === 'draft') {
          tmp.multiplyScalar(0.85 + (reduceMotion ? 0 : 0.15 * Math.sin(t * 0.4 + d.phase)));
          g = 0.45;
        }
        if (i === hoveredTile) {
          tmp.lerp(white, 0.6);
          g = 1.4;
        }
        if (d.boot > lit - 30 && bootP < 1) tmp.lerp(white, 0.7);
        setTile(i, tmp, g);
      }
      tiles.instanceColor!.needsUpdate = true;
      glows.instanceColor!.needsUpdate = true;

      if (hoveredPanel && hoveredTile < 0) {
        hover.position.copy(hoveredPanel.getWorldPosition(new THREE.Vector3()));
        hover.quaternion.copy(hoveredPanel.getWorldQuaternion(new THREE.Quaternion()));
        hover.position.add(new THREE.Vector3(0, 0, 0.02).applyQuaternion(hover.quaternion));
        const p = (hoveredPanel.geometry as THREE.PlaneGeometry).parameters;
        hover.scale.set(p.width * 1.015, p.height * 1.03, 1);
        hoverMat.opacity = Math.min(0.16, hoverMat.opacity + 0.02);
      } else {
        hoverMat.opacity = Math.max(0, hoverMat.opacity - 0.03);
      }

      const dt = Math.min(0.1, t - lastT);
      lastT = t;
      for (const st of streams) st.map.offset.x -= dt * st.speed;
      for (const p of pulses) {
        const u = (t * p.speed + p.offset) % 1;
        p.sprite.position.copy(p.curve.getPoint(u));
        (p.sprite.material as THREE.SpriteMaterial).opacity = Math.sin(u * Math.PI) * 0.95;
      }

      if (flying) {
        const k = reduceMotion ? 1 : 0.06;
        camera.position.lerp(wantPos, k);
        controls.target.lerp(wantTgt, k);
        if (camera.position.distanceTo(wantPos) < 0.03 && controls.target.distanceTo(wantTgt) < 0.03) flying = false;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const ro = new ResizeObserver(() => {
      const { w, h } = size();
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      fitOverview();
    });
    ro.observe(host);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointermove', pick);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      renderer.domElement.removeEventListener('click', onClick);
      controls.dispose();
      clearRoute();
      tiles.dispose();
      glows.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
    // overviewRoute is read through cb on rebuild; gates drive the rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gates]);

  useEffect(() => {
    api.current?.focus(focusedGate);
  }, [focusedGate, gates]);

  useEffect(() => {
    api.current?.route(selectedDoc);
  }, [selectedDoc, gates, overviewRoute]);

  return <div ref={hostRef} className="wr-stage" aria-label="분야별 지식 탑과 문서 흐름 (3D)" role="img" />;
}
