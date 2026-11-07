'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@archi-web/lib/client/api';
import { NavRail } from '@archi-web/components/studio/NavRail';

type Me = { organizations: { workspaces: { id: string; name: string }[] }[] };

type LlmConfig = {
  id: string;
  provider: string;
  authType: string;
  model: string | null;
  baseUrl: string | null;
  maskedApiKey: string;
  isActive: boolean;
};

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI (GPT)',
  anthropic: 'Anthropic (Claude)',
  google: 'Google (Gemini)',
  grok: 'xAI (Grok)',
  custom: 'Custom',
};


export default function SettingsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [configs, setConfigs] = useState<LlmConfig[]>([]);
  const [provider, setProvider] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [customModel, setCustomModel] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [modelsLive, setModelsLive] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<Me>('/api/auth/me')
      .then((me) => setWorkspaceId(me.organizations[0]?.workspaces[0]?.id ?? null))
      .catch(() => setError('로그인이 필요합니다. 스튜디오에서 먼저 로그인해 주세요.'));
  }, []);

  const loadConfigs = useCallback((wsId: string) => {
    apiFetch<{ configs: LlmConfig[] }>(`/api/settings/llm?workspaceId=${wsId}`)
      .then((data) => setConfigs(data.configs))
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (workspaceId) loadConfigs(workspaceId);
  }, [workspaceId, loadConfigs]);

  // provider 선택/키 등록 시 모델 목록을 서버에서 가져온다 (라이브 우선, 실패 시 폴백)
  useEffect(() => {
    if (!workspaceId || provider === 'custom') {
      setModels([]);
      return;
    }
    let cancelled = false;
    setModelsLoading(true);
    apiFetch<{ models: string[]; live: boolean }>(
      `/api/settings/llm/models?workspaceId=${workspaceId}&provider=${provider}`,
    )
      .then((data) => {
        if (cancelled) return;
        setModels(data.models);
        setModelsLive(data.live);
        setCustomModel(false);
        setModel((prev) => (data.models.includes(prev) ? prev : (data.models[0] ?? '')));
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, provider, configs]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId || !apiKey.trim() || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch('/api/settings/llm', {
        method: 'POST',
        body: JSON.stringify({
          workspaceId,
          provider,
          apiKey: apiKey.trim(),
          model: model.trim() || undefined,
        }),
      });
      setApiKey('');
      setNotice('LLM API가 등록되었습니다. 이제 AI 에이전트가 실제 모델로 응답합니다.');
      loadConfigs(workspaceId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(configId: string) {
    if (!workspaceId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/settings/llm/${configId}`, { method: 'DELETE' });
      loadConfigs(workspaceId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <NavRail />
      <main className="flex-1 overflow-y-auto bg-zinc-50 p-8">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-bold">설정</h1>
            <Link href="/studio" className="text-sm text-zinc-500 hover:text-zinc-900">
              ← 스튜디오
            </Link>
          </div>
          {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
          {notice && <p className="mb-4 text-sm text-zinc-700">{notice}</p>}

          <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-5">
            <h2 className="mb-1 text-sm font-semibold text-zinc-800">에이전트 LLM API 등록</h2>
            <p className="mb-4 text-xs text-zinc-500">
              OpenAI(GPT), Anthropic(Claude), Google(Gemini), xAI(Grok) API 키를 등록합니다. API 키는 암호화되어
              저장되며 화면에는 끝 4자리만 표시됩니다. 등록하면 AI 에이전트가 mock 대신 실제
              모델로 응답합니다. (관리자 전용)
            </p>
            <form onSubmit={handleRegister} className="flex flex-col gap-3">
              <div className="flex gap-2">
                <select
                  value={provider}
                  onChange={(e) => {
                    setProvider(e.target.value);
                    setCustomModel(e.target.value === 'custom');
                  }}
                  className="rounded-lg border border-zinc-300 px-2 py-2 text-sm"
                >
                  <option value="openai">OpenAI (GPT)</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="google">Google (Gemini)</option>
                  <option value="grok">xAI (Grok)</option>
                  <option value="custom">Custom</option>
                </select>
                {!customModel && provider !== 'custom' && models.length > 0 ? (
                  <select
                    value={model}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setCustomModel(true);
                        setModel('');
                      } else {
                        setModel(e.target.value);
                      }
                    }}
                    className="flex-1 rounded-lg border border-zinc-300 px-2 py-2 text-sm"
                  >
                    {models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                    <option value="__custom__">직접 입력…</option>
                  </select>
                ) : (
                  <input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={modelsLoading ? '모델 불러오는 중...' : '모델 ID 직접 입력'}
                    className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  />
                )}
              </div>
              {provider !== 'custom' && (
                <p className="-mt-1 text-[11px] text-zinc-400">
                  {modelsLoading
                    ? '모델 목록을 불러오는 중...'
                    : modelsLive
                      ? '✓ 등록된 키로 조회한 실시간 모델 목록입니다.'
                      : '키 등록 전이라 기본 목록을 표시합니다. 키를 등록하면 실제 사용 가능한 모델로 갱신됩니다.'}
                </p>
              )}
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="API 키"
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={busy || !apiKey.trim()}
                className="self-end rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                등록
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-800">등록된 API</h2>
            {configs.length === 0 ? (
              <p className="text-sm text-zinc-400">
                등록된 LLM API가 없습니다. 현재 에이전트는 mock provider로 동작합니다.
              </p>
            ) : (
              <ul className="space-y-2">
                {configs.map((config) => (
                  <li
                    key={config.id}
                    className="flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  >
                    <span className="font-semibold">
                      {PROVIDER_LABELS[config.provider] ?? config.provider}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        config.authType === 'oauth'
                          ? 'bg-zinc-900 text-white'
                          : 'bg-zinc-100 text-zinc-600'
                      }`}
                    >
                      {config.authType === 'oauth' ? 'OAuth 계정' : 'API 키'}
                    </span>
                    <span className="text-zinc-500">{config.model ?? '기본 모델'}</span>
                    <span className="font-mono text-xs text-zinc-400">{config.maskedApiKey}</span>
                    <button
                      onClick={() => handleDelete(config.id)}
                      disabled={busy}
                      className="ml-auto text-xs text-zinc-400 hover:text-red-600 disabled:opacity-50"
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
