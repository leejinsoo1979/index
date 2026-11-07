'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BlockTypes } from '@archi/editor';
import { FiDownload } from 'react-icons/fi';
import { apiFetch } from '@archi-web/lib/client/api';
import { exportArtboardToPdf } from '@archi-web/lib/client/export-canvas';
import { BlockContentEditor } from './BlockContentEditor';
import type { CanvasLayout, DocumentWithBlocks, EditorBlock } from './BlockEditor';

/** 아트보드(페이지) 크기 — A4 비율에 가까운 고정 페이지. PDF '화면 그대로' 렌더의 기준이 된다. */
const PAGE_W = 820;
const PAGE_H = 1160;
const GRID = 4;
const MIN_W = 80;
const MIN_H = 36;
const SNAP = 6; // 정렬 스냅/가이드가 작동하는 거리(px)
const CONTAINER_PAD = 16; // 컨테이너 프레임이 자식을 감싸는 여백
const CONTAINER_TITLE_H = 26;
const snap = (v: number) => Math.round(v / GRID) * GRID;

const TYPE_LABELS: Record<string, string> = {
  heading: '제목',
  paragraph: '문단',
  image: '이미지',
  checklist: '체크리스트',
  source_reference: '출처',
  cta: 'CTA',
  chart: '차트',
  table: '표',
  formula: '계산식',
  doc_meta: '문서정보',
  qna: 'Q&A',
  law_reference: '법규',
  callout: '강조',
  quote: '인용',
  code: '코드',
  cost_table: '견적표',
  construction_detail: '시공상세',
  container: '컨테이너',
  rich_text: '서식 텍스트',
  image_gallery: '갤러리',
  before_after: '전/후 비교',
  diagram: '다이어그램',
  construction_standard: '시공기준',
  material_spec: '자재사양',
  schedule: '공정표',
  risk_warning: '위험경고',
  seo_meta: 'SEO',
  blog_section: '블로그섹션',
  technical_section: '기술섹션',
  ontology_summary: '지식요약',
};

/** 캔버스 좌표가 아직 없는 블록을 세로로 쌓는 기본 높이(타입별) */
const DEFAULT_H: Record<string, number> = {
  heading: 64,
  paragraph: 140,
  image: 260,
  checklist: 168,
  source_reference: 140,
  cta: 120,
  chart: 300,
  table: 200,
  formula: 184,
  doc_meta: 120,
  qna: 240,
  law_reference: 160,
  callout: 120,
  quote: 100,
  code: 180,
  cost_table: 240,
  construction_detail: 280,
  container: 80,
  rich_text: 140,
  image_gallery: 240,
  before_after: 240,
  diagram: 200,
  construction_standard: 200,
  material_spec: 180,
  schedule: 200,
  risk_warning: 140,
  seo_meta: 160,
  blog_section: 180,
  technical_section: 200,
  ontology_summary: 140,
};

/** 8방향 리사이즈 핸들 정의: 위치/커서 */
type Dir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: { dir: Dir; left: string; top: string; cursor: string }[] = [
  { dir: 'nw', left: '0%', top: '0%', cursor: 'cursor-nwse-resize' },
  { dir: 'n', left: '50%', top: '0%', cursor: 'cursor-ns-resize' },
  { dir: 'ne', left: '100%', top: '0%', cursor: 'cursor-nesw-resize' },
  { dir: 'e', left: '100%', top: '50%', cursor: 'cursor-ew-resize' },
  { dir: 'se', left: '100%', top: '100%', cursor: 'cursor-nwse-resize' },
  { dir: 's', left: '50%', top: '100%', cursor: 'cursor-ns-resize' },
  { dir: 'sw', left: '0%', top: '100%', cursor: 'cursor-nesw-resize' },
  { dir: 'w', left: '0%', top: '50%', cursor: 'cursor-ew-resize' },
];
const MOVES_LEFT: Dir[] = ['nw', 'w', 'sw'];
const MOVES_RIGHT: Dir[] = ['ne', 'e', 'se'];
const MOVES_TOP: Dir[] = ['nw', 'n', 'ne'];
const MOVES_BOTTOM: Dir[] = ['sw', 's', 'se'];

/** 이동/리사이즈 중인 변(positions)을 정렬 후보(targets)에 맞춰 스냅. 가장 가까운 한 곳만 반환. */
function snapAxis(positions: number[], targets: number[]): { delta: number; guide: number } | null {
  let best: { dist: number; delta: number; guide: number } | null = null;
  for (const p of positions) {
    for (const t of targets) {
      const dist = Math.abs(p - t);
      if (dist <= SNAP && (!best || dist < best.dist)) best = { dist, delta: t - p, guide: t };
    }
  }
  return best ? { delta: best.delta, guide: best.guide } : null;
}

/** 두 사각형이 겹치는지 (마키 선택 판정) */
function intersects(a: CanvasLayout, b: CanvasLayout): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** 좌표가 없는 블록에 결정적(deterministic) 기본 배치를 부여 — 새로고침해도 위치가 튀지 않는다. */
function resolveLayouts(blocks: EditorBlock[]): Record<string, CanvasLayout> {
  const out: Record<string, CanvasLayout> = {};
  let cursor = 40;
  for (const b of blocks) {
    const saved = b.metadata?.canvas;
    if (saved) {
      out[b.id] = saved;
      continue;
    }
    const h = DEFAULT_H[b.type] ?? 140;
    out[b.id] = { x: 40, y: cursor, w: PAGE_W - 80, h };
    cursor += h + 16;
  }
  return out;
}

type Props = {
  documentId: string;
  selectedBlockId: string | null;
  onSelectBlock: (blockId: string | null) => void;
  reloadKey?: number;
  onBlocksLoaded?: (blocks: EditorBlock[]) => void;
  onDocumentLoaded?: (doc: { id: string; projectId: string; title: string; status: string }) => void;
  onSaveStateChange?: (state: 'idle' | 'saving' | 'saved') => void;
  /** 우측 패널 '+ 블록 추가' 트리거 */
  openAddMenuKey?: number;
};

type DragState =
  | {
      kind: 'move' | 'resize';
      id: string;
      dir?: Dir;
      primaryBase: CanvasLayout;
      bases: Record<string, CanvasLayout>;
      startX: number;
      startY: number;
      moved: boolean;
    }
  | {
      kind: 'marquee';
      ox: number;
      oy: number;
      addToSel: boolean;
      baseSel: Set<string>;
      startX: number;
      startY: number;
      moved: boolean;
    };

type Clip = { type: string; content: Record<string, unknown>; canvas: CanvasLayout };

/**
 * 자유 배치(캔버스) 모드 — 피그마/PPT처럼 동작한다.
 * 클릭=선택 / Shift·⌘클릭=다중선택 토글 / 빈 공간 드래그=마키 선택 /
 * 블록 드래그=이동(다중 선택 시 그룹 이동) / 핸들=크기 조절 / 더블클릭=글자 편집 /
 * Del=삭제, ⌘·Ctrl+C·V=복사·붙여넣기. 위치/크기는 block.metadata.canvas 에 저장.
 */
export function CanvasView({
  documentId,
  selectedBlockId,
  onSelectBlock,
  reloadKey,
  onBlocksLoaded,
  onDocumentLoaded,
  onSaveStateChange,
  openAddMenuKey,
}: Props) {
  const [doc, setDoc] = useState<DocumentWithBlocks | null>(null);
  const [layouts, setLayouts] = useState<Record<string, CanvasLayout>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [marquee, setMarquee] = useState<CanvasLayout | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  const layoutsRef = useRef(layouts);
  layoutsRef.current = layouts;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const lastPushedRef = useRef<string | null>(selectedBlockId); // 부모로 마지막에 보낸 primary
  const artboardRef = useRef<HTMLDivElement>(null);
  const contentTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const clipboardRef = useRef<Clip[] | null>(null);
  const dragRef = useRef<DragState | null>(null);

  // container(부모) → 자식 블록 id 인덱스. 컨테이너를 그룹처럼 이동·삭제할 때 사용.
  const childIdsByParentRef = useRef<Map<string, string[]>>(new Map());
  {
    const map = new Map<string, string[]>();
    for (const b of doc?.blocks ?? []) {
      if (b.parentId) {
        const list = map.get(b.parentId) ?? [];
        list.push(b.id);
        map.set(b.parentId, list);
      }
    }
    childIdsByParentRef.current = map;
  }
  /** id 집합에 컨테이너 자식들을 더해 반환 (container를 그룹으로 취급) */
  const withChildren = (ids: Iterable<string>): Set<string> => {
    const out = new Set(ids);
    for (const id of out) {
      for (const child of childIdsByParentRef.current.get(id) ?? []) out.add(child);
    }
    return out;
  };

  const load = useCallback(() => {
    apiFetch<DocumentWithBlocks>(`/api/documents/${documentId}`)
      .then((data) => {
        setDoc(data);
        setLayouts(resolveLayouts(data.blocks));
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [documentId]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  useEffect(() => {
    if (doc) {
      onBlocksLoaded?.(doc.blocks);
      onDocumentLoaded?.({ id: doc.id, projectId: doc.projectId, title: doc.title, status: doc.status });
    }
  }, [doc, onBlocksLoaded, onDocumentLoaded]);

  useEffect(() => {
    onSaveStateChange?.(saveState);
  }, [saveState, onSaveStateChange]);

  // 외부(우측 블록 패널)에서 선택이 바뀌면 단일 선택으로 반영. 내 echo면 무시(루프 방지).
  useEffect(() => {
    if (selectedBlockId === lastPushedRef.current) return;
    lastPushedRef.current = selectedBlockId;
    setSelectedIds(selectedBlockId ? new Set([selectedBlockId]) : new Set());
  }, [selectedBlockId]);

  /** 선택 갱신 + 부모에 primary 통지 */
  const applySelection = useCallback(
    (ids: Set<string>, primary: string | null) => {
      setSelectedIds(ids);
      lastPushedRef.current = primary;
      onSelectBlock(primary);
    },
    [onSelectBlock],
  );

  const persistCanvasMany = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    setSaveState('saving');
    try {
      await Promise.all(
        ids.map((id) => {
          const c = layoutsRef.current[id];
          return c
            ? apiFetch(`/api/blocks/${id}`, { method: 'PATCH', body: JSON.stringify({ canvas: c }) })
            : Promise.resolve(undefined);
        }),
      );
      setSaveState('saved');
    } catch {
      setSaveState('idle');
    }
  }, []);

  const deleteBlocks = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      applySelection(new Set(), null);
      setEditingId(null);
      // 컨테이너 삭제 시 자식도 함께 제거(서버는 onDelete Cascade, 화면은 즉시 제거)
      const localIds = [...withChildren(ids)];
      localIds.forEach((id) => {
        const t = contentTimers.current.get(id);
        if (t) {
          clearTimeout(t);
          contentTimers.current.delete(id);
        }
      });
      setDoc((prev) =>
        prev ? { ...prev, blocks: prev.blocks.filter((b) => !localIds.includes(b.id)) } : prev,
      );
      setLayouts((prev) => {
        const next = { ...prev };
        localIds.forEach((id) => delete next[id]);
        return next;
      });
      try {
        // 원본 id만 DELETE — 자식은 DB cascade로 삭제된다
        await Promise.all(ids.map((id) => apiFetch(`/api/blocks/${id}`, { method: 'DELETE' })));
      } catch (e) {
        setError((e as Error).message);
        load();
      }
    },
    [applySelection, load],
  );

  const pasteBlocks = useCallback(async () => {
    const clips = clipboardRef.current;
    if (!clips?.length) return;
    // 병렬 생성 + 항목별 독립 처리 (하나 실패해도 나머지는 붙여넣어짐)
    const results = await Promise.all(
      clips.map(async (clip) => {
        try {
          const created = await apiFetch<{ id: string }>(`/api/documents/${documentId}/blocks`, {
            method: 'POST',
            body: JSON.stringify({ block: { type: clip.type, content: clip.content } }),
          });
          const canvas: CanvasLayout = {
            x: clip.canvas.x + 24,
            y: clip.canvas.y + 24,
            w: clip.canvas.w,
            h: clip.canvas.h,
          };
          await apiFetch(`/api/blocks/${created.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ canvas }),
          });
          return created.id;
        } catch {
          return null;
        }
      }),
    );
    const newIds = results.filter((id): id is string => id !== null);
    load();
    applySelection(new Set(newIds), newIds[0] ?? null);
  }, [documentId, load, applySelection]);

  // 키보드: Esc / Backspace·Delete(삭제) / ⌘·Ctrl+C·V(복사·붙여넣기) — 다중 선택 일괄 처리
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setEditingId(null);
        applySelection(new Set(), null);
        return;
      }
      if (editingId) return;
      const ae = document.activeElement as HTMLElement | null;
      const tag = ae?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ae?.isContentEditable) return;

      const ids = [...selectedIdsRef.current];
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        const all = Object.keys(layoutsRef.current);
        applySelection(new Set(all), all[0] ?? null);
        return;
      }
      if (mod && (e.key === 'c' || e.key === 'C')) {
        if (!ids.length || !doc) return;
        const order = new Map(doc.blocks.map((b, i) => [b.id, i]));
        const clips = ids
          .slice()
          .sort((p, q) => (order.get(p) ?? 0) - (order.get(q) ?? 0))
          .map((id) => {
            const blk = doc.blocks.find((b) => b.id === id);
            const canvas = layoutsRef.current[id];
            return blk && canvas ? { type: blk.type, content: blk.content, canvas } : null;
          })
          .filter((c): c is Clip => c !== null);
        clipboardRef.current = clips;
        return;
      }
      if (mod && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        void pasteBlocks();
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (!ids.length) return;
        e.preventDefault();
        void deleteBlocks(ids);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editingId, doc, applySelection, deleteBlocks, pasteBlocks]);

  // 우측 패널 '+ 블록 추가'
  const addBlockKey = useRef(openAddMenuKey);
  useEffect(() => {
    if (openAddMenuKey === undefined || openAddMenuKey === addBlockKey.current) return;
    addBlockKey.current = openAddMenuKey;
    (async () => {
      try {
        await apiFetch(`/api/documents/${documentId}/blocks`, {
          method: 'POST',
          body: JSON.stringify({ block: { type: BlockTypes.PARAGRAPH, content: { text: '' } } }),
        });
        load();
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [openAddMenuKey, documentId, load]);

  // ── 포인터 드래그 (이동/리사이즈/마키) ──────────────────────────────
  const onPointerMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;

    if (d.kind === 'marquee') {
      const rect = artboardRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const x = Math.min(d.ox, cx);
      const y = Math.min(d.oy, cy);
      const w = Math.abs(cx - d.ox);
      const h = Math.abs(cy - d.oy);
      if (w > 3 || h > 3) d.moved = true;
      const box: CanvasLayout = { x, y, w, h };
      setMarquee(box);
      const hits = Object.entries(layoutsRef.current)
        .filter(([, l]) => intersects(box, l))
        .map(([id]) => id);
      const sel = d.addToSel ? new Set([...d.baseSel, ...hits]) : new Set(hits);
      setSelectedIds(sel);
      return;
    }

    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) d.moved = true;

    const others = Object.entries(layoutsRef.current)
      .filter(([id]) => !d.bases[id])
      .map(([, l]) => l);
    const targetsX = [0, PAGE_W / 2, PAGE_W];
    const targetsY = [0, PAGE_H / 2, PAGE_H];
    for (const o of others) {
      targetsX.push(o.x, o.x + o.w / 2, o.x + o.w);
      targetsY.push(o.y, o.y + o.h / 2, o.y + o.h);
    }

    setLayouts((prev) => {
      const next = { ...prev };
      const nextGuides: { x: number[]; y: number[] } = { x: [], y: [] };
      const pb = d.primaryBase;

      if (d.kind === 'move') {
        let px = Math.max(0, snap(pb.x + dx));
        let py = Math.max(0, snap(pb.y + dy));
        const sx = snapAxis([px, px + pb.w / 2, px + pb.w], targetsX);
        if (sx) {
          px += sx.delta;
          nextGuides.x.push(sx.guide);
        }
        const sy = snapAxis([py, py + pb.h / 2, py + pb.h], targetsY);
        if (sy) {
          py += sy.delta;
          nextGuides.y.push(sy.guide);
        }
        // 그룹 전체에 같은 델타 적용 (그룹이 페이지 밖으로 나가지 않도록 클램프)
        let ddx = px - pb.x;
        let ddy = py - pb.y;
        const baseEntries = Object.entries(d.bases);
        const minX = Math.min(...baseEntries.map(([, b]) => b.x));
        const minY = Math.min(...baseEntries.map(([, b]) => b.y));
        ddx = Math.max(ddx, -minX);
        ddy = Math.max(ddy, -minY);
        for (const [id, b] of baseEntries) {
          next[id] = { ...b, x: b.x + ddx, y: b.y + ddy };
        }
        setGuides(nextGuides);
        return next;
      }

      // resize (단일)
      const dir = d.dir!;
      let { x, y, w, h } = pb;
      if (MOVES_LEFT.includes(dir)) {
        let left = snap(pb.x + dx);
        const s = snapAxis([left], targetsX);
        if (s) {
          left += s.delta;
          nextGuides.x.push(s.guide);
        }
        x = Math.max(0, Math.min(left, pb.x + pb.w - MIN_W));
        w = pb.x + pb.w - x;
      }
      if (MOVES_RIGHT.includes(dir)) {
        let right = snap(pb.x + pb.w + dx);
        const s = snapAxis([right], targetsX);
        if (s) {
          right += s.delta;
          nextGuides.x.push(s.guide);
        }
        w = Math.max(MIN_W, right - pb.x);
      }
      if (MOVES_TOP.includes(dir)) {
        let top = snap(pb.y + dy);
        const s = snapAxis([top], targetsY);
        if (s) {
          top += s.delta;
          nextGuides.y.push(s.guide);
        }
        y = Math.max(0, Math.min(top, pb.y + pb.h - MIN_H));
        h = pb.y + pb.h - y;
      }
      if (MOVES_BOTTOM.includes(dir)) {
        let bottom = snap(pb.y + pb.h + dy);
        const s = snapAxis([bottom], targetsY);
        if (s) {
          bottom += s.delta;
          nextGuides.y.push(s.guide);
        }
        h = Math.max(MIN_H, bottom - pb.y);
      }
      next[d.id] = { x, y, w, h };
      setGuides(nextGuides);
      return next;
    });
  }, []);

  const onPointerUp = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    setGuides({ x: [], y: [] });
    setMarquee(null);
    if (!d) return;
    if (d.kind === 'marquee') {
      const ids = [...selectedIdsRef.current];
      applySelection(new Set(ids), ids[0] ?? null);
      return;
    }
    if (d.moved) persistCanvasMany(Object.keys(d.bases));
  }, [onPointerMove, persistCanvasMany, applySelection]);

  const startListeners = useCallback(() => {
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  }, [onPointerMove, onPointerUp]);

  const beginBlockDrag = useCallback(
    (e: React.PointerEvent, id: string, kind: 'move' | 'resize', dir?: Dir) => {
      e.preventDefault();
      e.stopPropagation();
      if (editingId && editingId !== id) setEditingId(null);

      // 이동 대상 집합 결정
      let movingSet: Set<string>;
      if (kind === 'resize') {
        movingSet = new Set([id]);
      } else if (selectedIdsRef.current.has(id) && selectedIdsRef.current.size > 1) {
        movingSet = new Set(selectedIdsRef.current); // 그룹 이동
      } else {
        movingSet = new Set([id]);
        applySelection(movingSet, id);
      }

      // 컨테이너를 잡으면 자식 블록도 함께 이동(그룹)
      if (kind === 'move') movingSet = withChildren(movingSet);

      const bases: Record<string, CanvasLayout> = {};
      movingSet.forEach((mid) => {
        const l = layoutsRef.current[mid];
        if (l) bases[mid] = l;
      });
      const primaryBase = layoutsRef.current[id];
      if (!primaryBase) return;
      dragRef.current = { kind, id, dir, primaryBase, bases, startX: e.clientX, startY: e.clientY, moved: false };
      startListeners();
    },
    [editingId, applySelection, startListeners],
  );

  const onBlockPointerDown = useCallback(
    (e: React.PointerEvent, id: string) => {
      e.stopPropagation();
      if (editingId === id) return; // 편집 중 블록은 입력 우선
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      if (additive) {
        e.preventDefault();
        const next = new Set(selectedIdsRef.current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        applySelection(next, next.size ? id : null);
        return;
      }
      beginBlockDrag(e, id, 'move');
    },
    [editingId, applySelection, beginBlockDrag],
  );

  const onArtboardPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const rect = artboardRef.current?.getBoundingClientRect();
      if (!rect) return;
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      setEditingId(null);
      if (!additive) applySelection(new Set(), null);
      dragRef.current = {
        kind: 'marquee',
        ox: e.clientX - rect.left,
        oy: e.clientY - rect.top,
        addToSel: additive,
        baseSel: new Set(selectedIdsRef.current),
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
      startListeners();
    },
    [applySelection, startListeners],
  );

  function handleContentChange(id: string, content: Record<string, unknown>) {
    setDoc((prev) =>
      prev ? { ...prev, blocks: prev.blocks.map((b) => (b.id === id ? { ...b, content } : b)) } : prev,
    );
    const timers = contentTimers.current;
    const existing = timers.get(id);
    if (existing) clearTimeout(existing);
    setSaveState('saving');
    timers.set(
      id,
      setTimeout(async () => {
        try {
          await apiFetch(`/api/blocks/${id}`, { method: 'PATCH', body: JSON.stringify({ content }) });
          setSaveState('saved');
        } catch {
          setSaveState('idle');
        }
      }, 600),
    );
  }

  /** 화면 그대로 PDF 내보내기 — 선택/핸들/가이드를 먼저 지운 뒤 아트보드를 캡처한다. */
  async function handleExportPdf() {
    if (!artboardRef.current || exporting) return;
    setExporting(true);
    applySelection(new Set(), null);
    setEditingId(null);
    setGuides({ x: [], y: [] });
    setMarquee(null);
    // 선택 외곽선이 사라지도록 두 프레임 대기 후 캡처
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );
    try {
      const title = doc?.title?.trim() || '문서';
      await exportArtboardToPdf(artboardRef.current, `${title}.pdf`);
    } catch (e) {
      setError(`PDF 내보내기에 실패했습니다: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  const blocks = useMemo(() => doc?.blocks ?? [], [doc]);

  // 콘텐츠가 아래로 길어지면 아트보드를 A4 페이지 단위로 늘린다(PDF 다중 페이지와 일치).
  const { artboardHeight, pageCount } = useMemo(() => {
    let bottom = 0;
    for (const l of Object.values(layouts)) bottom = Math.max(bottom, l.y + l.h);
    const pages = Math.max(1, Math.ceil((bottom + 48) / PAGE_H));
    return { artboardHeight: pages * PAGE_H, pageCount: pages };
  }, [layouts]);

  /** 컨테이너 프레임 = 자식 블록들을 감싸는 경계(여백+제목). 자식 없으면 자체 레이아웃. */
  function containerFrame(id: string): CanvasLayout | null {
    const kids = (childIdsByParentRef.current.get(id) ?? [])
      .map((cid) => layouts[cid])
      .filter((x): x is CanvasLayout => Boolean(x));
    if (kids.length === 0) return layouts[id] ?? null;
    const minX = Math.max(0, Math.min(...kids.map((k) => k.x)) - CONTAINER_PAD);
    const minY = Math.max(0, Math.min(...kids.map((k) => k.y)) - CONTAINER_PAD - CONTAINER_TITLE_H);
    const maxX = Math.max(...kids.map((k) => k.x + k.w)) + CONTAINER_PAD;
    const maxY = Math.max(...kids.map((k) => k.y + k.h)) + CONTAINER_PAD;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  if (error) {
    return <div className="flex h-full items-center justify-center text-sm text-red-500">{error}</div>;
  }

  return (
    <div className="h-full overflow-auto bg-zinc-200/70 p-8">
      {blocks.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-zinc-500">
          블록이 없습니다. 우측 패널에서 ‘+ 블록 추가’로 시작하세요.
        </div>
      ) : (
        <>
          {/* 상단 도구막대: 화면 그대로 PDF 내보내기 */}
          <div
            className="sticky top-0 z-40 mx-auto mb-3 flex items-center justify-end"
            style={{ width: PAGE_W }}
          >
            <button
              onClick={handleExportPdf}
              disabled={exporting}
              className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-zinc-700 disabled:opacity-50"
            >
              <FiDownload size={13} aria-hidden />
              {exporting ? '내보내는 중…' : 'PDF (화면 그대로)'}
            </button>
          </div>

          <div
            ref={artboardRef}
            className="relative mx-auto select-none bg-white shadow-md ring-1 ring-zinc-300"
            style={{ width: PAGE_W, height: artboardHeight }}
            onPointerDown={onArtboardPointerDown}
          >
          {/* 페이지 경계선 (A4 단위) + 페이지 번호 */}
          {Array.from({ length: pageCount - 1 }, (_, i) => (
            <div
              key={`pb-${i}`}
              className="pointer-events-none absolute left-0 right-0 z-0 border-t border-dashed border-zinc-300"
              style={{ top: (i + 1) * PAGE_H }}
            >
              <span className="absolute right-2 -top-4 text-[10px] text-zinc-400">
                {i + 2} 페이지
              </span>
            </div>
          ))}

          {/* 정렬 가이드 */}
          {guides.x.map((gx, i) => (
            <div
              key={`gx-${i}`}
              className="pointer-events-none absolute bottom-0 top-0 z-30 w-px bg-rose-500"
              style={{ left: gx }}
            />
          ))}
          {guides.y.map((gy, i) => (
            <div
              key={`gy-${i}`}
              className="pointer-events-none absolute left-0 right-0 z-30 h-px bg-rose-500"
              style={{ top: gy }}
            />
          ))}

          {/* 마키(드래그) 선택 박스 */}
          {marquee && (
            <div
              className="pointer-events-none absolute z-20 border border-zinc-900/60 bg-zinc-900/5"
              style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
            />
          )}

          {blocks.map((block) => {
            const l = layouts[block.id];
            if (!l) return null;
            const selected = selectedIds.has(block.id);
            const editing = editingId === block.id;
            const single = selected && selectedIds.size === 1;

            // 컨테이너: 자식을 감싸는 프레임으로 렌더(제목 바=이동 핸들). z-0으로 자식 뒤에 깔린다.
            if (block.type === 'container') {
              const frame = containerFrame(block.id);
              if (!frame) return null;
              const title = (block.content as { title?: string }).title ?? '';
              return (
                <div
                  key={block.id}
                  className={`pointer-events-none absolute z-0 rounded-lg border-2 border-dashed ${
                    selected ? 'border-zinc-900' : 'border-zinc-300'
                  }`}
                  style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
                >
                  <div
                    onPointerDown={(e) => onBlockPointerDown(e, block.id)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      applySelection(new Set([block.id]), block.id);
                      setEditingId(block.id);
                    }}
                    className={`pointer-events-auto flex h-6 cursor-move items-center gap-1 rounded-t-md px-2 text-[11px] font-bold ${
                      selected ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600'
                    }`}
                  >
                    <span>📦</span>
                    {editing ? (
                      <input
                        autoFocus
                        value={title}
                        onChange={(e) => handleContentChange(block.id, { ...block.content, title: e.target.value })}
                        onBlur={() => setEditingId(null)}
                        onKeyDown={(e) => e.key === 'Enter' && setEditingId(null)}
                        className="flex-1 bg-transparent outline-none"
                      />
                    ) : (
                      <span className="truncate">{title || '컨테이너'}</span>
                    )}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={block.id}
                className={`absolute select-none rounded-md ${
                  selected
                    ? 'outline outline-2 outline-zinc-900'
                    : 'outline outline-1 outline-transparent hover:outline-zinc-300'
                }`}
                style={{ left: l.x, top: l.y, width: l.w, height: l.h }}
                onPointerDown={(e) => onBlockPointerDown(e, block.id)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  applySelection(new Set([block.id]), block.id);
                  setEditingId(block.id);
                }}
              >
                <div
                  className={`h-full w-full overflow-auto rounded-md bg-white p-3 ${
                    editing ? 'select-text' : 'pointer-events-none'
                  }`}
                  style={editing ? undefined : { cursor: 'move' }}
                >
                  <BlockContentEditor
                    type={block.type}
                    content={block.content}
                    onChange={(content) => handleContentChange(block.id, content)}
                  />
                </div>

                {single && (
                  <span className="pointer-events-none absolute -top-5 left-0 rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {TYPE_LABELS[block.type] ?? block.type}
                    {!editing && <span className="ml-1 opacity-60">더블클릭=편집</span>}
                  </span>
                )}

                {single &&
                  !editing &&
                  HANDLES.map((hd) => (
                    <div
                      key={hd.dir}
                      onPointerDown={(e) => beginBlockDrag(e, block.id, 'resize', hd.dir)}
                      className={`absolute z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-zinc-900 bg-white ${hd.cursor}`}
                      style={{ left: hd.left, top: hd.top }}
                    />
                  ))}
              </div>
            );
          })}
          </div>
        </>
      )}
    </div>
  );
}
