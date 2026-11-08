/*
 * Thinking orbs — dotted, genuinely 3D loading indicators.
 * Ported to TypeScript from haplollc/ThinkingOrbs (Sources/ThinkingOrbs/Engine, MIT,
 * © 2026 Haplo LLC), itself a term-for-term port of Jakub Antalik's thinking-orbs web engine
 * (MIT, © 2026 Jakub Antalik). See third_party/thinking-orbs/LICENSE.
 * Pure maths over (size, t, opts): returns a z-sorted draw list of grayscale dots and lines.
 */

export type OrbDesign = "working" | "searching" | "solving" | "listening" | "connecting" | "weaving" | "composing" | "breathing" | "shaping";
export type OrbSize = "regular" | "small";
type Mode = "orbits" | "globe" | "rubik" | "wave" | "web" | "braid" | "ribbon" | "ring" | "morph";
type Opts = Record<string, number>;

export type OrbDot = { x: number; y: number; z: number; r: number; white: number; a: number };
export type OrbLine = { x1: number; y1: number; x2: number; y2: number; white: number; a: number; w: number };
export type OrbFrame = { dots: OrbDot[]; lines: OrbLine[] };

export const ORB_SIZE: Record<OrbSize, number> = { regular: 64, small: 20 };

const MODE: Record<OrbDesign, Mode> = {
  working: "orbits",
  searching: "globe",
  solving: "rubik",
  listening: "wave",
  connecting: "web",
  weaving: "braid",
  composing: "ribbon",
  breathing: "ring",
  shaping: "morph",
};

// ── primitives ───────────────────────────────────────────────────────────────
const PI = Math.PI;
const jsRound = Math.round;
const frac = (x: number) => x - Math.floor(x);
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
function hashD(a: number, b: number) {
  const h = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let fx = x - xi;
  let fy = y - yi;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hashD(xi, yi);
  const b = hashD(xi + 1, yi);
  const c = hashD(xi, yi + 1);
  const d = hashD(xi + 1, yi + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fibDir(i: number, n: number): [number, number, number] {
  const golden = PI * (3 - Math.sqrt(5));
  const y = 1 - (2 * (i + 0.5)) / n;
  const rad = Math.sqrt(1 - y * y);
  const a = i * golden;
  return [rad * Math.cos(a), y, rad * Math.sin(a)];
}
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const radiusScale = (size: number, p: number) => Math.pow(size / 300, p);
const below = (n: number) => (n > 0 ? Math.ceil(n) : 0);
const through = (n: number) => (n >= 0 ? Math.floor(n) + 1 : 0);

function projector(yaw: number, tilt: number, cx: number, cy: number, scale: number) {
  const st = Math.sin(tilt);
  const ct = Math.cos(tilt);
  const sy = Math.sin(yaw);
  const cyw = Math.cos(yaw);
  return (x: number, y: number, z: number): [number, number, number] => {
    const x1 = x * cyw + z * sy;
    const z1 = -x * sy + z * cyw;
    const y1 = y * ct - z1 * st;
    const z2 = y * st + z1 * ct;
    return [cx + x1 * scale, cy - y1 * scale, z2];
  };
}

function finalize(dots: OrbDot[], lines: OrbLine[], rMin: number): OrbFrame {
  const visible = dots
    .map((d, i) => ({ i, d }))
    .filter(({ d }) => d.a >= 0.02)
    .map(({ i, d }) => ({ i, d: { ...d, r: Math.max(rMin, d.r) } }));
  visible.sort((p, q) => (p.d.z !== q.d.z ? p.d.z - q.d.z : p.i - q.i));
  return { dots: visible.map((v) => v.d), lines: lines.filter((l) => l.a >= 0.02) };
}

const dot = (x: number, y: number, z: number, r: number, white: number, a = 1): OrbDot => ({ x, y, z, r, white, a });

// ── orbits — working ─────────────────────────────────────────────────────────
function orbits(size: number, t: number, o: Opts): OrbFrame {
  const cx = size / 2;
  const cy = size / 2;
  const R = (size / 2) * 0.82;
  const pt = projector(t * 0.12, 0.3, cx, cy, 1);
  const rs = radiusScale(size, o.rsPow ?? 0.6);
  const orbitN = o.orbitN ?? 12;
  const ghostN = o.ghostN ?? 40;
  const particles = o.particles ?? 3;
  const ghostR = o.ghostR ?? 0.9;
  const ghostA = o.ghostA ?? 0.5;
  const partR = o.partR ?? 1.2;
  const partRDepth = o.partRDepth ?? 1.6;
  const dots: OrbDot[] = [];
  for (let orb = 0; orb < below(orbitN); orb++) {
    const h1 = hashD(orb, 1.7);
    const h2 = hashD(orb, 5.2);
    const h3 = hashD(orb, 8.9);
    const ro = R * (0.45 + 0.52 * h1);
    const th = h1 * 2 * PI;
    const phi = Math.acos(2 * h2 - 1);
    const nx = Math.sin(phi) * Math.cos(th);
    const ny = Math.cos(phi);
    const nz = Math.sin(phi) * Math.sin(th);
    let ux = -ny;
    let uy = nx;
    const uz = 0;
    const ul = Math.max(1e-6, Math.sqrt(ux * ux + uy * uy));
    ux /= ul;
    uy /= ul;
    const vx = ny * uz - nz * uy;
    const vy = nz * ux - nx * uz;
    const vz = nx * uy - ny * ux;
    const speed = (0.25 + 0.55 * h3) * (h3 > 0.5 ? 1 : -1);
    for (let k = 0; k < below(ghostN); k++) {
      const a = (k / ghostN) * 2 * PI;
      const [px, py, z] = pt((ux * Math.cos(a) + vx * Math.sin(a)) * ro, (uy * Math.cos(a) + vy * Math.sin(a)) * ro, (uz * Math.cos(a) + vz * Math.sin(a)) * ro);
      const depth = (z / ro + 1) / 2;
      dots.push(dot(px, py, z, ghostR * rs, 0.72, ghostA * (0.4 + 0.6 * depth)));
    }
    for (let m = 0; m < below(particles); m++) {
      const a = t * speed + (m / particles) * 2 * PI + h2 * 6;
      const [px, py, z] = pt((ux * Math.cos(a) + vx * Math.sin(a)) * ro, (uy * Math.cos(a) + vy * Math.sin(a)) * ro, (uz * Math.cos(a) + vz * Math.sin(a)) * ro);
      const depth = (z / ro + 1) / 2;
      dots.push(dot(px, py, z, (partR + partRDepth * depth) * rs, 0.3 - 0.22 * depth));
    }
  }
  return finalize(dots, [], o.rMin ?? 0.3);
}

// ── globe — searching ────────────────────────────────────────────────────────
function globe(size: number, t: number, o: Opts): OrbFrame {
  const spin = 0.5;
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size / 2) * 0.82;
  const tilt = 0.4 + 0.06 * Math.sin(t * 0.35);
  const pt = projector(t * spin, tilt, cx, cy, radius);
  const scan = t * (spin + (1.7 - spin) * (o.scanMul ?? 1));
  const rs = radiusScale(size, o.rsPow ?? 0.6);
  const dimBase = o.dimBase ?? 1;
  const rBase = o.rBase ?? 0.6;
  const rDepth = o.rDepth ?? 1.7;
  const rBoost = o.rBoost ?? 1;
  const inkFar = o.inkFar ?? 0.62;
  const inkSpan = o.inkSpan ?? 0.54;
  const dots: OrbDot[] = [];
  const latRings = o.latRings ?? 17;
  const lonDensity = o.lonDensity ?? 44;
  for (let li = 0; li < through(latRings); li++) {
    const lat = -PI / 2 + (li / latRings) * PI;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    const lonCount = Math.max(1, jsRound(Math.abs(cosLat) * lonDensity));
    for (let lj = 0; lj < lonCount; lj++) {
      const lon = (lj / lonCount) * 2 * PI;
      const [px, py, z] = pt(cosLat * Math.cos(lon), sinLat, cosLat * Math.sin(lon));
      const depth = (z + 1) / 2;
      const d = angleDelta(lon + t * spin, scan);
      const boost = Math.exp(-(d * d) / 0.18) * Math.max(0, z);
      dots.push(dot(px, py, z, (rBase + rDepth * depth + rBoost * boost) * rs, inkFar - inkSpan * depth, dimBase + (1 - dimBase) * Math.min(1, boost)));
    }
  }
  return finalize(dots, [], o.rMin ?? 0.3);
}

// ── rubik — solving ──────────────────────────────────────────────────────────
type Move = { axis: number; lo: number; hi: number; ang: number };
function solveCycle(time: number, count: number, slotDur: number, rest: number) {
  const cyc = 2 * count * slotDur + rest;
  let tc = time % cyc;
  if (tc < 0) tc += cyc;
  const amount = new Array<number>(count).fill(0);
  let active = -1;
  if (tc < 2 * count * slotDur) {
    const slot = Math.floor(tc / slotDur);
    const p = (tc - slot * slotDur) / slotDur;
    const cl = Math.min(1, p / 0.7);
    const ep = 1 - Math.pow(1 - cl, 3);
    if (slot < count) {
      for (let i = 0; i < slot; i++) amount[i] = 1;
      amount[slot] = ep;
      active = slot;
    } else {
      const u = 2 * count - 1 - slot;
      for (let i = 0; i < u; i++) amount[i] = 1;
      amount[u] = 1 - ep;
      active = u;
    }
  }
  return { amount, active };
}
function makeMoves(count: number): Move[] {
  return Array.from({ length: count }, (_, i) => {
    const axis = Math.min(2, Math.floor(hashD(i, 2.3) * 3));
    const lo = -1 + 0.5 * Math.min(3, Math.floor(hashD(i, 5.9) * 4));
    const dir = hashD(i, 7.7) < 0.5 ? 1 : -1;
    return { axis, lo, hi: lo + 0.5, ang: (dir * PI) / 2 };
  });
}
function applyMoves(px: number, py: number, pz: number, moves: Move[], amount: number[], active: number): [number, number, number, boolean] {
  let x = px;
  let y = py;
  let z = pz;
  let inActive = false;
  for (let i = 0; i < moves.length; i++) {
    if (amount[i]! <= 0) continue;
    const mv = moves[i]!;
    const coord = mv.axis === 0 ? x : mv.axis === 1 ? y : z;
    if (coord < mv.lo || coord >= mv.hi) continue;
    if (i === active) inActive = true;
    const a = mv.ang * amount[i]!;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    if (mv.axis === 0) {
      const y2 = y * ca - z * sa;
      z = y * sa + z * ca;
      y = y2;
    } else if (mv.axis === 1) {
      const x2 = x * ca + z * sa;
      z = -x * sa + z * ca;
      x = x2;
    } else {
      const x2 = x * ca - y * sa;
      y = x * sa + y * ca;
      x = x2;
    }
  }
  return [x, y, z, inActive];
}
function rubik(size: number, t: number, o: Opts): OrbFrame {
  const cx = size / 2;
  const cy = size / 2;
  const R = (size / 2) * 0.82;
  const pt = projector(t * 0.55, 0.35 + 0.1 * Math.sin(t * 0.9), cx, cy, R);
  const rs = radiusScale(size, o.rsPow ?? 0.6);
  const moveCount = Math.trunc(o.moveCount ?? 14);
  const moves = makeMoves(moveCount);
  const sc = solveCycle(t, moveCount, 0.42, 1.2);
  const rBase = o.rBase ?? 0.6;
  const rDepth = o.rDepth ?? 1.7;
  const rActive = o.rActive ?? 0.3;
  const inkFar = o.inkFar ?? 0.62;
  const inkSpan = o.inkSpan ?? 0.54;
  const dots: OrbDot[] = [];
  const latRings = o.latRings ?? 15;
  const lonDensity = o.lonDensity ?? 40;
  for (let li = 0; li < through(latRings); li++) {
    const lat = -PI / 2 + (li / latRings) * PI;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    const lonCount = Math.max(1, jsRound(Math.abs(cosLat) * lonDensity));
    for (let lj = 0; lj < lonCount; lj++) {
      const lon = (lj / lonCount) * 2 * PI;
      const [x, y, z, inActive] = applyMoves(cosLat * Math.cos(lon), sinLat, cosLat * Math.sin(lon), moves, sc.amount, sc.active);
      const [px, py, zr] = pt(x, y, z);
      const depth = (zr + 1) / 2;
      dots.push(dot(px, py, zr, (rBase + rDepth * depth + (inActive ? rActive : 0)) * rs, inkFar - inkSpan * depth - (inActive ? 0.14 : 0)));
    }
  }
  return finalize(dots, [], o.rMin ?? 0.3);
}

// ── wave — listening ─────────────────────────────────────────────────────────
function wave(size: number, t: number, o: Opts): OrbFrame {
  const cx = size / 2;
  const cy = size / 2;
  const R = (size / 2) * 0.874;
  const pt = projector(t * 0.18, 0.38, cx, cy, 1);
  const rs = radiusScale(size, o.rsPow ?? 0.6);
  const rBase = o.rBase ?? 0.6;
  const rDepth = o.rDepth ?? 1.7;
  const dots: OrbDot[] = [];
  const rings = o.rings ?? 15;
  const lonDensity = o.lonDensity ?? 40;
  for (let ri = 0; ri < through(rings); ri++) {
    const lat = -PI / 2 + (ri / rings) * PI;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    const w = 0.62 * Math.sin(t * 2.1 - ri * 0.52) + 0.38 * Math.sin(t * 1.27 + ri * 0.83);
    const rr = R * (0.88 + 0.105 * w);
    const lonCount = Math.max(1, jsRound(Math.abs(cosLat) * lonDensity));
    for (let lj = 0; lj < lonCount; lj++) {
      const lon = (lj / lonCount) * 2 * PI;
      const [px, py, z] = pt(cosLat * Math.cos(lon) * rr, sinLat * rr, cosLat * Math.sin(lon) * rr);
      const depth = (z / R + 1) / 2;
      const crest = Math.max(0, w);
      dots.push(dot(px, py, z, (rBase + rDepth * depth) * (1 + 0.4 * crest) * rs, 0.66 - 0.56 * depth - 0.1 * crest));
    }
  }
  return finalize(dots, [], o.rMin ?? 0.3);
}

// ── web — connecting ─────────────────────────────────────────────────────────
function web(size: number, t: number, o: Opts): OrbFrame {
  const cx = size / 2;
  const cy = size / 2;
  const R = (size / 2) * 0.8 * (o.spread ?? 1);
  const pt = projector(t * 0.12, 0.32, cx, cy, R);
  const rs = radiusScale(size, o.rsPow ?? 0.6);
  const nodeN = o.nodeN ?? 30;
  const thr = o.thr ?? 0.72;
  const nodeR = o.nodeR ?? 1.4;
  const nodeRDepth = o.nodeRDepth ?? 1.8;
  const lineW = o.lineW ?? 0.8;
  const nodes: [number, number, number][] = [];
  for (let i = 0; i < below(nodeN); i++) {
    const d = fibDir(i, nodeN);
    const x = d[0] + 0.3 * (vnoise(i * 0.31 + 9, t * 0.24) - 0.5) * 2;
    const y = d[1] + 0.3 * (vnoise(i * 0.53 + 27, t * 0.21) - 0.5) * 2;
    const z = d[2] + 0.3 * (vnoise(i * 0.77 + 55, t * 0.27) - 0.5) * 2;
    const l = Math.sqrt(x * x + y * y + z * z);
    nodes.push([x / l, y / l, z / l]);
  }
  const lines: OrbLine[] = [];
  const dots: OrbDot[] = [];
  for (let i = 0; i < below(nodeN); i++) {
    for (let j = i + 1; j < below(nodeN); j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      if (dist >= thr) continue;
      const [x1, y1, z1] = pt(a[0], a[1], a[2]);
      const [x2, y2, z2] = pt(b[0], b[1], b[2]);
      const depth = ((z1 + z2) / 2 + 1) / 2;
      lines.push({ x1, y1, x2, y2, white: 0.42, a: (1 - dist / thr) * (0.3 + 0.55 * depth), w: Math.max(0.6, lineW * rs) });
    }
  }
  for (let i = 0; i < below(nodeN); i++) {
    const n = nodes[i]!;
    const [px, py, z] = pt(n[0], n[1], n[2]);
    const depth = (z + 1) / 2;
    const pulse = 1 + 0.25 * Math.sin(t * 1.4 + i * 2.7);
    dots.push(dot(px, py, z, (nodeR + nodeRDepth * depth) * pulse * rs, 0.55 - 0.45 * depth));
  }
  const signals = o.signals ?? 5;
  for (let s = 0; s < below(signals); s++) {
    const seg = Math.floor(t * 0.55 + s * 7.31);
    const a = Math.floor(hashD(seg, s * 3.1 + 1.7) * nodeN);
    const b = Math.floor(hashD(seg, s * 5.7 + 4.2) * nodeN);
    if (a === b || !nodes[a] || !nodes[b]) continue;
    const f = frac(t * 0.55 + s * 7.31);
    const x = lerp(nodes[a]![0], nodes[b]![0], f);
    const y = lerp(nodes[a]![1], nodes[b]![1], f);
    const z = lerp(nodes[a]![2], nodes[b]![2], f);
    const l = Math.max(1e-6, Math.sqrt(x * x + y * y + z * z));
    const [px, py, zr] = pt(x / l, y / l, z / l);
    const depth = (zr + 1) / 2;
    dots.push(dot(px, py, zr, (nodeR * 1.5 + nodeRDepth * depth) * rs, 0.05, 0.5 + 0.5 * depth));
  }
  return finalize(dots, lines, o.rMin ?? 0.3);
}

// ── braid — weaving ──────────────────────────────────────────────────────────
function braid(size: number, t: number, o: Opts): OrbFrame {
  const cx = size / 2;
  const cy = size / 2;
  const R = (size / 2) * 0.76;
  const pt = projector(t * 0.4, 0.3, cx, cy, 1);
  const rs = radiusScale(size, o.rsPow ?? 0.6);
  const rBase = o.rBase ?? 1.2;
  const rDepth = o.rDepth ?? 1.8;
  const dots: OrbDot[] = [];
  const ghostN = o.ghostN ?? 150;
  for (let i = 0; i < below(ghostN); i++) {
    const d = fibDir(i, ghostN);
    const [px, py, z] = pt(d[0] * R, d[1] * R, d[2] * R);
    const depth = (z / R + 1) / 2;
    dots.push(dot(px, py, z, 0.8 * rs, 0.78, 0.1 + 0.22 * depth));
  }
  const strandN = o.strandN ?? 52;
  const turns = o.turns ?? 3;
  for (let s = 0; s < 3; s++) {
    const phase = (s / 3) * 2 * PI;
    for (let i = 0; i < below(strandN); i++) {
      const u = (frac(i / strandN + t * 0.045) * 2 - 1) * 0.96;
      const surf = Math.sqrt(Math.max(0, 1 - u * u));
      const endFade = Math.min(1, (1 - Math.abs(u)) / 0.1);
      const a = u * PI * turns + phase;
      const weave = 1 + 0.075 * Math.sin(u * PI * turns * 2 + phase * 2 + t * 0.8);
      const rr = surf * R * weave;
      const [px, py, zr] = pt(Math.cos(a) * rr, u * R * weave, Math.sin(a) * rr);
      const depth = (zr / R + 1) / 2;
      dots.push(dot(px, py, zr, (rBase + rDepth * depth) * rs, 0.55 - 0.45 * depth, endFade * (0.45 + 0.55 * depth)));
    }
  }
  return finalize(dots, [], o.rMin ?? 0.3);
}

// ── ribbon — composing (and ring — breathing, via faceOn) ────────────────────
function ribbon(size: number, t: number, o: Opts): OrbFrame {
  const cx = size / 2;
  const cy = size / 2;
  const R = (size / 2) * 0.78;
  const spin = o.spin ?? 1;
  const camTilt = 0.3;
  const pt = projector(t * 0.1 * spin, camTilt, cx, cy, 1);
  const rs = radiusScale(size, o.rsPow ?? 0.6);
  const faceOn = (o.faceOn ?? 0) !== 0;
  const wobMul = o.wobMul ?? 1;
  const rBase = o.rBase ?? 1.1;
  const rDepth = o.rDepth ?? 1.7;
  const dots: OrbDot[] = [];
  const ghostN = o.ghostN ?? 150;
  for (let i = 0; i < below(ghostN); i++) {
    const d = fibDir(i, ghostN);
    const [px, py, z] = pt(d[0] * R, d[1] * R, d[2] * R);
    const depth = (z / R + 1) / 2;
    dots.push(dot(px, py, z, 0.8 * rs, 0.78, 0.1 + 0.22 * depth));
  }
  const ya = t * 0.24 * spin;
  const ta = faceOn ? -camTilt : 0.55 + 0.3 * Math.sin(t * 0.18) * spin;
  const ux = Math.cos(ya);
  const uy = 0;
  const uz = Math.sin(ya);
  const vx = -uz * Math.sin(ta);
  const vy = Math.cos(ta);
  const vz = ux * Math.sin(ta);
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const wobAmp = 0.23 * wobMul;
  const baseR = faceOn ? R / (1 + 0.85 * wobAmp) : R;
  const baseLanes = o.lanes ?? 5;
  const segs = o.segs ?? 88;
  const lanes = Math.max(1, jsRound(baseLanes * (o.bandMul ?? 1)));
  const mid = (lanes - 1) / 2;
  for (let w = 0; w < lanes; w++) {
    const laneOff = (w - mid) * 0.075;
    const edge = Math.abs(w - mid) / Math.max(1, mid);
    for (let k = 0; k < below(segs); k++) {
      const a = (k / segs) * 2 * PI;
      const wob = (0.16 * Math.sin(a * 3 - t * 1.7 + w * 0.22) + 0.07 * Math.sin(a * 5 + t * 1.1)) * wobMul;
      const radial = faceOn ? 1 + wob : 1;
      const off = faceOn ? laneOff : laneOff + wob;
      const x = ux * Math.cos(a) + vx * Math.sin(a) + nx * off;
      const y = uy * Math.cos(a) + vy * Math.sin(a) + ny * off;
      const z = uz * Math.cos(a) + vz * Math.sin(a) + nz * off;
      const l = Math.sqrt(x * x + y * y + z * z);
      const rr = baseR * radial;
      const [px, py, zr] = pt((x / l) * rr, (y / l) * rr, (z / l) * rr);
      const depth = (zr / R + 1) / 2;
      dots.push(dot(px, py, zr, (rBase + rDepth * depth) * (1 - 0.25 * edge) * rs, 0.52 - 0.44 * depth + 0.18 * edge, 0.4 + 0.6 * depth));
    }
  }
  return finalize(dots, [], o.rMin ?? 0.3);
}

// ── morph — shaping ──────────────────────────────────────────────────────────
function polyPath(verts: [number, number][]) {
  const lengths = verts.map((a, i) => {
    const b = verts[(i + 1) % verts.length]!;
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  });
  const total = lengths.reduce((s, l) => s + l, 0);
  return (f: number): [number, number] => {
    let target = f * total;
    let i = 0;
    while (target > lengths[i]! && i < verts.length - 1) {
      target -= lengths[i]!;
      i++;
    }
    const a = verts[i]!;
    const b = verts[(i + 1) % verts.length]!;
    const ff = lengths[i] !== 0 ? Math.min(1, target / lengths[i]!) : 0;
    return [a[0] + (b[0] - a[0]) * ff, a[1] + (b[1] - a[1]) * ff];
  };
}
const triangle = polyPath([[0, -0.26], [0.24, 0.16], [-0.24, 0.16]]);
const square = polyPath([[0, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2], [-0.2, -0.2]]);
function shapePoint(shape: number, f: number): [number, number] {
  if (shape === 0) {
    const a = -PI / 2 + f * 2 * PI;
    return [Math.cos(a) * 0.24, Math.sin(a) * 0.24];
  }
  return shape === 1 ? triangle(f) : square(f);
}
function morph(size: number, t: number, o: Opts): OrbFrame {
  const K = 3;
  const hold = 1.4;
  const move = 0.9;
  const segDur = hold + move;
  let tc = t % (segDur * K);
  if (tc < 0) tc += segDur * K;
  const k = Math.floor(tc / segDur);
  const local = tc - k * segDur;
  const m = local > hold ? ((x) => x * x * (3 - 2 * x))((local - hold) / move) : 0;
  const sprd = o.spread ?? 1;
  const M = 160;
  const pts: [number, number][] = [];
  for (let i = 0; i < M; i++) {
    const f = i / M;
    const a = shapePoint(k, f);
    const b = shapePoint((k + 1) % K, f);
    pts.push([(a[0] + (b[0] - a[0]) * m) * sprd, (a[1] + (b[1] - a[1]) * m) * sprd]);
  }
  const L: number[] = [];
  let total = 0;
  for (let i = 0; i < M; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % M]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    L.push(l);
    total += l;
  }
  const n = Math.max(6, jsRound(34 * (o.iconD ?? 1)));
  const re = (o.rDot ?? 0.021) * 1.35 * sprd;
  const pulse = 1 + 0.02 * Math.sin(local * 3.1);
  const dots: OrbDot[] = [];
  const c2 = size / 2;
  let seg = 0;
  let acc = 0;
  for (let k2 = 0; k2 < n; k2++) {
    const target = (k2 / n) * total;
    while (acc + L[seg]! < target && seg < M - 1) {
      acc += L[seg]!;
      seg++;
    }
    const a = pts[seg]!;
    const b = pts[(seg + 1) % M]!;
    const f = L[seg] !== 0 ? Math.min(1, (target - acc) / L[seg]!) : 0;
    const x = (a[0] + (b[0] - a[0]) * f) * pulse;
    const y = (a[1] + (b[1] - a[1]) * f) * pulse;
    dots.push(dot(c2 + x * size, c2 + y * size, 0, Math.max(0.35, re * size), 0.1));
  }
  return finalize(dots, [], o.rMin ?? 0.25);
}

// ── presets (nine designs × two sizes, baked on the web) ─────────────────────
type Preset = { speed: number; count: number; size: number; extra?: Opts };
const PRESETS: Record<Mode, Record<OrbSize, Preset>> = {
  orbits: { regular: { speed: 1.885, count: 1, size: 1 }, small: { speed: 3.9, count: 0.238, size: 2.4 } },
  globe: { regular: { speed: 2.015, count: 0.42, size: 1.15, extra: { scanMul: 4.08, dimBase: 0.45 } }, small: { speed: 2.665, count: 0.105, size: 1.75, extra: { scanMul: 4.335, dimBase: 0.45 } } },
  rubik: { regular: { speed: 1.82, count: 0.35, size: 1.05 }, small: { speed: 1.95, count: 0.088, size: 1.9 } },
  wave: { regular: { speed: 4.388, count: 0.341, size: 1 }, small: { speed: 3.998, count: 0.105, size: 1.6 } },
  web: { regular: { speed: 3.315, count: 1.35, size: 0.95 }, small: { speed: 6.63, count: 0.25, size: 1.52 } },
  braid: { regular: { speed: 1.625, count: 0.5, size: 1 }, small: { speed: 2.75, count: 0.1125, size: 1.36 } },
  ribbon: { regular: { speed: 2.34, count: 0.25, size: 0.85, extra: { spin: 0, bandMul: 3.9, wobMul: 1 } }, small: { speed: 3.12, count: 0.051, size: 1.073, extra: { spin: 0, bandMul: 4.94, wobMul: 1 } } },
  ring: { regular: { speed: 3.24, count: 0.25, size: 0.956, extra: { spin: 0, bandMul: 3.627, wobMul: 0.368 } }, small: { speed: 3.78, count: 0.028, size: 1.622, extra: { spin: 0, bandMul: 3.968, wobMul: 0.565 } } },
  morph: { regular: { speed: 2.405, count: 0.702, size: 0.395, extra: { spread: 1.45 } }, small: { speed: 2.08, count: 0.53, size: 1.011, extra: { spread: 1.45 } } },
};
const BASE: Record<Mode, Opts> = {
  globe: { latRings: 17, lonDensity: 44, rBase: 0.6, rDepth: 1.7, rBoost: 1, inkFar: 0.62, inkSpan: 0.54, rsPow: 0.6, rMin: 0.3 },
  orbits: { orbitN: 12, ghostN: 40, ghostR: 0.9, ghostA: 0.5, particles: 3, partR: 1.2, partRDepth: 1.6, rsPow: 0.6, rMin: 0.3 },
  rubik: { latRings: 15, lonDensity: 40, moveCount: 14, rBase: 0.6, rDepth: 1.7, rActive: 0.3, inkFar: 0.62, inkSpan: 0.54, rsPow: 0.6, rMin: 0.3 },
  wave: { rings: 15, lonDensity: 40, rBase: 0.6, rDepth: 1.7, rsPow: 0.6, rMin: 0.3 },
  web: { nodeN: 30, thr: 0.72, signals: 5, nodeR: 1.4, nodeRDepth: 1.8, lineW: 0.8, rsPow: 0.6, rMin: 0.3 },
  braid: { strandN: 52, turns: 3, ghostN: 150, rBase: 1.2, rDepth: 1.8, rsPow: 0.6, rMin: 0.3 },
  ribbon: { lanes: 5, segs: 88, ghostN: 150, rBase: 1.1, rDepth: 1.7, rsPow: 0.6, rMin: 0.3 },
  ring: { lanes: 5, segs: 88, ghostN: 0, faceOn: 1, rBase: 1.1, rDepth: 1.7, rsPow: 0.6, rMin: 0.3 },
  morph: { rDot: 0.021, iconD: 1, rMin: 0.25 },
};
const COUNT_PAIRS: [string, string][] = [["latRings", "lonDensity"], ["rings", "lonDensity"], ["lanes", "segs"]];
const COUNT_KEYS = ["orbitN", "ghostN", "nodeN", "strandN", "signals"];
const RADIUS_KEYS = ["rBase", "rDepth", "rActive", "rDot", "ghostR", "partR", "partRDepth", "nodeR", "nodeRDepth"];

function scaleCounts(opts: Opts, scale: number): Opts {
  const out = { ...opts };
  const done = new Set<string>();
  const rt = Math.sqrt(scale);
  for (const [a, b] of COUNT_PAIRS) {
    if (out[a] !== undefined && out[b] !== undefined && !done.has(a) && !done.has(b)) {
      out[a] = Math.max(2, jsRound(out[a]! * rt));
      out[b] = Math.max(2, jsRound(out[b]! * rt));
      done.add(a);
      done.add(b);
    }
  }
  for (const k of COUNT_KEYS) if (out[k] !== undefined && out[k] !== 0 && !done.has(k)) out[k] = Math.max(1, jsRound(out[k]! * scale));
  if (out.iconD !== undefined) out.iconD = Math.max(0.02, out.iconD * scale);
  return out;
}
function scaleRadii(opts: Opts, scale: number): Opts {
  const out = { ...opts };
  for (const k of RADIUS_KEYS) if (out[k] !== undefined) out[k] = out[k]! * scale;
  return out;
}

const resolved = new Map<string, { mode: Mode; speed: number; opts: Opts }>();
function resolve(design: OrbDesign, size: OrbSize) {
  const key = `${design}-${size}`;
  let r = resolved.get(key);
  if (!r) {
    const mode = MODE[design];
    const p = PRESETS[mode][size];
    let opts = BASE[mode];
    if (p.count !== 1) opts = scaleCounts(opts, p.count);
    if (p.size !== 1) opts = scaleRadii(opts, p.size);
    r = { mode, speed: p.speed, opts: { ...opts, ...(p.extra ?? {}) } };
    resolved.set(key, r);
  }
  return r;
}

const BUILDERS: Record<Mode, (size: number, t: number, o: Opts) => OrbFrame> = {
  orbits,
  globe,
  rubik,
  wave,
  web,
  braid,
  ribbon,
  ring: ribbon,
  morph,
};

/** The draw list for `design` at `seconds` on a `size` ("regular" 64pt / "small" 20pt) unit box. */
export function orbFrame(design: OrbDesign, size: OrbSize, seconds: number): OrbFrame {
  const r = resolve(design, size);
  const t = Number.isFinite(seconds) ? seconds * r.speed : 0;
  return BUILDERS[r.mode](ORB_SIZE[size], t, r.opts);
}
