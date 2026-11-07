'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@archi-web/lib/client/api';

type Props = {
  blockId: string;
  imageAssetId: string;
  baseVersionId: string;
  baseUrl: string;
  caption?: string;
  onApplied: () => void;
  onClose: () => void;
};

const CANVAS_W = 560;
const CANVAS_H = 340;

/**
 * 이미지 인페인트 modal.
 * 좌측 캔버스에 마스크(보라색 브러시)를 칠하고 프롬프트로 수정 요청 → before/after 비교 → 블록 교체.
 */
export function InpaintModal({
  blockId,
  imageAssetId,
  baseVersionId,
  baseUrl,
  caption,
  onApplied,
  onClose,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasMask = useRef(false);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [afterUrl, setAfterUrl] = useState<string | null>(null);
  const [afterVersionId, setAfterVersionId] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  }, []);

  function draw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * CANVAS_W;
    const y = ((e.clientY - rect.top) / rect.height) * CANVAS_H;
    ctx.fillStyle = 'rgba(24, 24, 27, 0.55)';
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fill();
    hasMask.current = true;
  }

  function clearMask() {
    const ctx = canvasRef.current?.getContext('2d');
    ctx?.clearRect(0, 0, CANVAS_W, CANVAS_H);
    hasMask.current = false;
  }

  async function handleInpaint(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const maskDataUrl = hasMask.current
        ? canvasRef.current?.toDataURL('image/png')
        : undefined;
      const result = await apiFetch<{ version: { id: string; url: string } }>(
        '/api/images/inpaint',
        {
          method: 'POST',
          body: JSON.stringify({
            imageAssetId,
            baseVersionId,
            prompt: prompt.trim(),
            maskDataUrl,
          }),
        },
      );
      setAfterUrl(result.version.url);
      setAfterVersionId(result.version.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleApply() {
    if (!afterVersionId || busy) return;
    setBusy(true);
    setError(null);
    try {
      // 이미지 블록의 versionId/url만 새 버전으로 교체 (원본 버전은 보존됨)
      await apiFetch(`/api/blocks/${blockId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          content: {
            imageAssetId,
            versionId: afterVersionId,
            url: afterUrl,
            caption: caption ?? '',
          },
        }),
      });
      onApplied();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">이미지 편집 (인페인트)</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-900" aria-label="닫기">
            ✕
          </button>
        </div>

        {!afterUrl ? (
          <>
            <p className="mb-2 text-xs text-zinc-500">
              수정할 영역을 브러시로 칠한 뒤(선택), 어떻게 바꿀지 입력하세요.
            </p>
            <div
              className="relative mb-3 overflow-hidden rounded-xl border border-zinc-200"
              style={{ aspectRatio: `${CANVAS_W}/${CANVAS_H}` }}
            >
              <img
                src={baseUrl}
                alt="원본 이미지"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <canvas
                ref={canvasRef}
                width={CANVAS_W}
                height={CANVAS_H}
                className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
                onPointerDown={(e) => {
                  drawing.current = true;
                  draw(e);
                }}
                onPointerMove={draw}
                onPointerUp={() => (drawing.current = false)}
                onPointerLeave={() => (drawing.current = false)}
              />
            </div>
            <div className="mb-3 flex justify-end">
              <button onClick={clearMask} className="text-xs text-zinc-500 hover:text-zinc-900">
                마스크 지우기
              </button>
            </div>
            <form onSubmit={handleInpaint} className="flex gap-2">
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="예: 벽면 타일을 베이지 톤으로 변경"
                className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={busy || !prompt.trim()}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? '생성 중...' : '인페인트 실행'}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <figure>
                <img src={baseUrl} alt="수정 전" className="aspect-video w-full rounded-xl object-cover" />
                <figcaption className="mt-1 text-center text-xs text-zinc-500">수정 전</figcaption>
              </figure>
              <figure>
                <img src={afterUrl} alt="수정 후" className="aspect-video w-full rounded-xl border-2 border-zinc-900 object-cover" />
                <figcaption className="mt-1 text-center text-xs font-semibold text-zinc-900">
                  수정 후 (새 버전)
                </figcaption>
              </figure>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleApply}
                disabled={busy}
                className="flex-1 rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                이 버전을 문서에 적용
              </button>
              <button
                onClick={() => {
                  setAfterUrl(null);
                  setAfterVersionId(null);
                }}
                className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm text-zinc-600"
              >
                다시 시도
              </button>
            </div>
          </>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
