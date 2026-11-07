import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { CustomSelect } from "@/components/ui/custom-select";
import { AUDIENCES, LIFECYCLE_STAGES, audienceLabel, stageLabel } from "@/data/lifecycle";
import "./Tools.css";

type ToolField = {
  name: string;
  label: string;
  type: "text" | "textarea" | "select" | "checkbox";
  placeholder?: string;
  required?: boolean;
  help?: string;
  options?: { value: string; label: string }[];
};
type Tool = {
  id: string;
  name: string;
  summary: string;
  description: string;
  stages: string[];
  audience: string[];
  tags: string[];
  dataSources: string[];
  status: "beta" | "stable";
  inputs: ToolField[];
  example: Record<string, string | boolean>;
  available: boolean;
  missing: string[];
};
type Source = { id: string; title: string; publisher?: string; url?: string; snippet?: string };
type RunResult = { ok: true; sources: Source[]; data: unknown } | { ok: false; error: string };

const ALL = "all";

function useTools() {
  const [tools, setTools] = useState<Tool[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    fetch("/api/tools")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { tools: Tool[] }) => alive && setTools(d.tools))
      .catch(() => alive && setError("도구 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
    return () => {
      alive = false;
    };
  }, []);
  return { tools, error };
}

function stageText(tool: Tool) {
  return tool.stages.length ? tool.stages.map(stageLabel).join(" · ") : "전 단계 공통";
}

export default function Tools() {
  const { id } = useParams();
  const { tools, error } = useTools();
  const tool = id ? tools?.find((t) => t.id === id) : undefined;

  return (
    <div className="tools">
      <div className="tools__inner">
        {id ? (
          tools && !tool ? (
            <p className="tools__empty">
              없는 도구입니다. <Link to="/tools">전체 도구 보기</Link>
            </p>
          ) : tool ? (
            <ToolDetail tool={tool} />
          ) : (
            <p className="tools__empty">{error || "불러오는 중…"}</p>
          )
        ) : (
          <ToolCatalog tools={tools} error={error} />
        )}
      </div>
    </div>
  );
}

function ToolCatalog({ tools, error }: { tools: Tool[] | null; error: string }) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState(ALL);
  const [audience, setAudience] = useState(ALL);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (tools ?? []).filter(
      (t) =>
        (stage === ALL || t.stages.length === 0 || t.stages.includes(stage)) &&
        (audience === ALL || t.audience.includes(audience)) &&
        (!q || `${t.name} ${t.summary} ${t.tags.join(" ")} ${t.dataSources.join(" ")}`.toLowerCase().includes(q)),
    ).sort((a, b) => Number(b.available) - Number(a.available));
  }, [tools, query, stage, audience]);

  return (
    <>
      <header className="tools__hero">
        <p className="tools__eyebrow">TOOLS</p>
        <h1 className="tools__title">인테리어 AI 도구</h1>
        <p className="tools__lead">
          현장 주소, 법령, 업체 정보를 공공 원천에서 바로 확인합니다. 같은 도구를 INDEX AI와 에이전트도 답변 근거로 씁니다.
        </p>
      </header>

      <div className="tools__bar">
        <input
          className="tools__search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="도구 이름, 법령, 업무로 찾기"
          aria-label="도구 검색"
        />
        <CustomSelect
          className="tools__select"
          aria-label="업무 단계"
          value={stage}
          onValueChange={setStage}
          options={[{ value: ALL, label: "모든 단계" }, ...LIFECYCLE_STAGES.map((s) => ({ value: s.id, label: s.label }))]}
        />
        <div className="tools__chips" role="group" aria-label="대상">
          {[{ id: ALL, label: "전체" }, ...AUDIENCES].map((a) => (
            <button
              key={a.id}
              type="button"
              className={`tools__chip${audience === a.id ? " is-active" : ""}`}
              aria-pressed={audience === a.id}
              onClick={() => setAudience(a.id)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="tools__empty">{error}</p>}
      {!tools && !error && <p className="tools__empty">불러오는 중…</p>}
      {tools && visible.length === 0 && <p className="tools__empty">조건에 맞는 도구가 없습니다.</p>}

      <ul className="tools__grid">
        {visible.map((t) => (
          <li key={t.id}>
            <Link className="tool-card" to={`/tools/${t.id}`}>
              <div className="tool-card__meta">
                <span>{stageText(t)}</span>
                {!t.available && <span className="tool-card__off">연결 준비 중</span>}
              </div>
              <h2 className="tool-card__name">{t.name}</h2>
              <p className="tool-card__summary">{t.summary}</p>
              <div className="tool-card__foot">
                <span>{t.audience.map(audienceLabel).join(" · ")}</span>
                <span className="tool-card__src">{t.dataSources[0]}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function ToolDetail({ tool }: { tool: Tool }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const initial = () =>
    Object.fromEntries(
      tool.inputs.map((f) => [f.name, f.type === "checkbox" ? false : f.type === "select" ? (f.options?.[0]?.value ?? "") : ""]),
    ) as Record<string, string | boolean>;
  const [values, setValues] = useState<Record<string, string | boolean>>(initial);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  useEffect(() => {
    setValues(initial());
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool.id]);

  const set = (name: string, v: string | boolean) => setValues((cur) => ({ ...cur, [name]: v }));
  const hasExample = Object.keys(tool.example).length > 0;

  async function run(e: FormEvent) {
    e.preventDefault();
    if (!user) {
      navigate(`/mypage?redirect=/tools/${tool.id}`);
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: tool.id, input: values }),
      });
      const body = (await res.json().catch(() => null)) as RunResult | { error?: string } | null;
      if (body && "ok" in body) setResult(body);
      else setResult({ ok: false, error: (body && "error" in body && body.error) || `실행하지 못했습니다 (${res.status}).` });
    } catch {
      setResult({ ok: false, error: "서버에 연결하지 못했습니다." });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="tool-detail">
      <Link className="tool-detail__back" to="/tools">
        ← 전체 도구
      </Link>
      <header className="tool-detail__head">
        <p className="tool-detail__stage">{stageText(tool)}</p>
        <h1 className="tool-detail__name">{tool.name}</h1>
        <p className="tool-detail__desc">{tool.description}</p>
        <dl className="tool-detail__facts">
          <div>
            <dt>대상</dt>
            <dd>{tool.audience.map(audienceLabel).join(", ")}</dd>
          </div>
          <div>
            <dt>원천 데이터</dt>
            <dd>{tool.dataSources.join(", ")}</dd>
          </div>
        </dl>
      </header>

      <div className="tool-detail__body">
        <form className="tool-form" onSubmit={run}>
          {tool.inputs.map((f) => (
            <label key={f.name} className={`tool-form__field${f.type === "checkbox" ? " is-check" : ""}`}>
              {f.type === "checkbox" ? (
                <>
                  <input type="checkbox" checked={values[f.name] === true} onChange={(e) => set(f.name, e.target.checked)} />
                  <span>{f.label}</span>
                </>
              ) : (
                <>
                  <span className="tool-form__label">
                    {f.label}
                    {f.required && <em> 필수</em>}
                  </span>
                  {f.type === "select" ? (
                    <CustomSelect
                      aria-label={f.label}
                      value={String(values[f.name] ?? "")}
                      onValueChange={(v) => set(f.name, v)}
                      options={f.options ?? []}
                    />
                  ) : f.type === "textarea" ? (
                    <textarea
                      rows={3}
                      value={String(values[f.name] ?? "")}
                      placeholder={f.placeholder}
                      required={f.required}
                      onChange={(e) => set(f.name, e.target.value)}
                    />
                  ) : (
                    <input
                      type="text"
                      value={String(values[f.name] ?? "")}
                      placeholder={f.placeholder}
                      required={f.required}
                      onChange={(e) => set(f.name, e.target.value)}
                    />
                  )}
                </>
              )}
            </label>
          ))}
          <div className="tool-form__actions">
            <button type="submit" className="tool-form__run" disabled={running || !tool.available}>
              {!tool.available ? "연결 준비 중" : running ? "조회 중…" : user ? "실행" : "로그인 후 실행"}
            </button>
            {hasExample && (
              <button type="button" className="tool-form__example" onClick={() => setValues({ ...initial(), ...tool.example })}>
                예시 넣기
              </button>
            )}
          </div>
          {!tool.available && tool.missing.length > 0 && (
            <p className="tool-form__note">아직 연결되지 않은 원천: {tool.missing.join(", ")}</p>
          )}
          {!user && tool.available && <p className="tool-form__note">회원만 실행할 수 있습니다.</p>}
        </form>

        <section className="tool-result" aria-live="polite">
          {!result && !running && <p className="tool-result__idle">입력하고 실행하면 결과와 근거가 여기에 나옵니다.</p>}
          {running && <p className="tool-result__idle">공공 원천에 조회하는 중입니다…</p>}
          {result && !result.ok && <p className="tool-result__error">{result.error}</p>}
          {result && result.ok && (
            <>
              <h2 className="tool-result__title">결과</h2>
              <DataView value={result.data} />
              {result.sources.length > 0 && (
                <>
                  <h2 className="tool-result__title">근거</h2>
                  <ol className="tool-sources">
                    {result.sources.map((s) => (
                      <li key={s.id}>
                        {s.url ? (
                          <a href={s.url} target="_blank" rel="noreferrer">
                            {s.title}
                          </a>
                        ) : (
                          <strong>{s.title}</strong>
                        )}
                        {s.publisher && <span className="tool-sources__pub">{s.publisher}</span>}
                        {s.snippet && <p>{s.snippet}</p>}
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isEmpty = (v: unknown) =>
  v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0) || (isPlain(v) && Object.keys(v).length === 0);

/** Generic, readable view of a tool's JSON result: objects as label/value rows, arrays as stacked items. */
function DataView({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (isEmpty(value)) return <p className="tool-data__none">결과 없음</p>;
  if (Array.isArray(value)) {
    if (value.every((v) => !isPlain(v) && !Array.isArray(v))) return <p className="tool-data__text">{value.join(", ")}</p>;
    return (
      <ol className="tool-data__list">
        {value.slice(0, 30).map((v, i) => (
          <li key={i}>
            <DataView value={v} depth={depth + 1} />
          </li>
        ))}
      </ol>
    );
  }
  if (isPlain(value)) {
    const entries = Object.entries(value).filter(([k, v]) => !isEmpty(v) && k !== "raw");
    return (
      <dl className={`tool-data${depth ? " is-nested" : ""}`}>
        {entries.map(([k, v]) => (
          <div key={k} className={isPlain(v) || Array.isArray(v) ? "is-block" : undefined}>
            <dt>{k}</dt>
            <dd>
              <DataView value={v} depth={depth + 1} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  if (typeof value === "boolean") return <span>{value ? "예" : "아니오"}</span>;
  const text = String(value);
  if (/^https?:\/\//.test(text))
    return (
      <a href={text} target="_blank" rel="noreferrer">
        원문 보기
      </a>
    );
  return <span className="tool-data__text">{text}</span>;
}
