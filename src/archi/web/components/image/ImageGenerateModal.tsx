'use client';

import { useState } from 'react';
import { apiFetch } from '@archi-web/lib/client/api';

type GeneratedVersion = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  prompt: string | null;
};

type Props = {
  projectId: string;
  onInsert: (image: { imageAssetId: string; versionId: string; url: string; caption: string }) => void;
  onClose: () => void;
};

/** AI 이미지 생성 modal: 프롬프트 입력 → 생성 → 선택 → 문서 삽입 */
export function ImageGenerateModal({ projectId, onInsert, onClose }: Props) {
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('1024x1024');
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [versions, setVersions] = useState<GeneratedVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ imageAssetId: string; versions: GeneratedVersion[] }>(
        '/api/images/generate',
        {
          method: 'POST',
          body: JSON.stringify({ projectId, prompt: prompt.trim(), size, count }),
        },
      );
      setAssetId(result.imageAssetId);
      setVersions(result.versions);
      setSelectedVersionId(result.versions[0]?.id ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleInsert() {
    const version = versions.find((v) => v.id === selectedVersionId);
    if (!version || !assetId) return;
    onInsert({
      imageAssetId: assetId,
      versionId: version.id,
      url: version.url,
      caption: prompt.trim(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">AI 이미지 생성</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-900" aria-label="닫기">
            ✕
          </button>
        </div>

        <form onSubmit={handleGenerate} className="mb-4 flex flex-col gap-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            placeholder="예: 화이트 오크 주방, 무광 세라믹 상판, 간접조명"
            className="w-full resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <div className="flex items-center gap-3">
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
            >
              <option value="1024x1024">1024 × 1024</option>
              <option value="1280x720">1280 × 720</option>
              <option value="720x1280">720 × 1280</option>
            </select>
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
            >
              <option value={1}>1장</option>
              <option value={2}>2장</option>
              <option value={4}>4장</option>
            </select>
            <button
              type="submit"
              disabled={busy || !prompt.trim()}
              className="ml-auto rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? '생성 중...' : '생성하기'}
            </button>
          </div>
        </form>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {versions.length > 0 && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3">
              {versions.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVersionId(v.id)}
                  className={`overflow-hidden rounded-xl border-2 ${
                    selectedVersionId === v.id ? 'border-zinc-900' : 'border-transparent'
                  }`}
                >
                  <img src={v.url} alt={v.prompt ?? 'AI 생성 이미지'} className="aspect-video w-full object-cover" />
                </button>
              ))}
            </div>
            <button
              onClick={handleInsert}
              disabled={!selectedVersionId}
              className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              선택한 이미지를 문서에 삽입
            </button>
          </>
        )}
      </div>
    </div>
  );
}
