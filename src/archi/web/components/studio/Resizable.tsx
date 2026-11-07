'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Opts = {
  initial: number;
  min: number;
  max: number;
  /** 패널이 좌측이면 'left'(오른쪽 모서리를 끌어 넓힘), 우측이면 'right'(왼쪽 모서리를 끌어 넓힘) */
  side: 'left' | 'right';
  /** 폭을 localStorage에 저장할 키 */
  storageKey?: string;
};

/**
 * 좌/우 사이드바 폭을 드래그로 조절하는 훅.
 * SSR 안전(초기값으로 렌더 후 마운트 시 저장값 복원), 드래그 중 폭 클램프 + 저장.
 */
export function useResizable({ initial, min, max, side, storageKey }: Opts) {
  const [width, setWidth] = useState(initial);
  const widthRef = useRef(width);
  widthRef.current = width;

  useEffect(() => {
    if (!storageKey) return;
    const raw = window.localStorage.getItem(storageKey);
    const saved = raw ? Number(raw) : NaN;
    if (Number.isFinite(saved)) setWidth(Math.min(max, Math.max(min, saved)));
  }, [storageKey, min, max]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = widthRef.current;
      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startX;
        const next = side === 'left' ? startW + delta : startW - delta;
        setWidth(Math.min(max, Math.max(min, next)));
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        if (storageKey) window.localStorage.setItem(storageKey, String(widthRef.current));
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
    },
    [side, min, max, storageKey],
  );

  return { width, onPointerDown };
}

/** 패널 안쪽 모서리에 붙는 드래그 핸들 (부모는 position: relative 여야 함) */
export function ResizeHandle({
  side,
  onPointerDown,
  dark = false,
}: {
  side: 'left' | 'right';
  onPointerDown: (e: React.PointerEvent) => void;
  dark?: boolean;
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation="vertical"
      title="드래그하여 너비 조절"
      className={`absolute top-0 z-30 h-full w-1.5 cursor-col-resize transition-colors ${
        side === 'left' ? 'right-0' : 'left-0'
      } ${dark ? 'hover:bg-white/20 active:bg-white/30' : 'hover:bg-zinc-400/50 active:bg-zinc-500/60'}`}
    />
  );
}
