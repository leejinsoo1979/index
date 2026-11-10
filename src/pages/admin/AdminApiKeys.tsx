/**
 * API 관리 — keys for the outside services INDEX uses. Values go to the server (api/api-keys.ts),
 * are encrypted there and never come back: the page shows only the last four characters.
 * Super admins only.
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import "./AdminApiKeys.css";

type KeyRow = {
  name: string; label: string; group: string; use: string; custom: boolean; test: string | null;
  source: "admin" | "server" | "none"; broken: boolean; last4: string | null; updatedAt: string | null; updatedBy: string | null;
};
type Status = { keys: KeyRow[]; serverOnly: { name: string; label: string; configured: boolean }[] };

const SOURCE: Record<KeyRow["source"], string> = { admin: "관리자 등록", server: "서버 기본값", none: "없음" };

export default function AdminApiKeys() {
  const { user, isSuperAdmin } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const call = useCallback(async <T,>(body: Record<string, unknown>): Promise<T> => {
    const token = await user?.getIdToken();
    const response = await fetch("/api/api-keys", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new Error(payload.error || "요청을 처리하지 못했습니다.");
    return payload;
  }, [user]);

  const load = useCallback(async () => {
    try {
      setStatus(await call<Status>({ action: "status" }));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    }
  }, [call]);
  useEffect(() => { if (isSuperAdmin) void load(); }, [isSuperAdmin, load]);

  const act = async (body: Record<string, unknown>, done: string) => {
    setNotice("");
    try {
      await call(body);
      setNotice(done);
      await load();
      return true;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "처리하지 못했습니다.");
      return false;
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="admin-page">
        <header className="admin-page__head"><div><h1>API 관리</h1></div></header>
        <p className="admin-note">API 키는 최고 관리자만 관리할 수 있습니다.</p>
      </div>
    );
  }

  const groups = status ? [...new Set(status.keys.map((row) => row.group))] : [];
  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <div>
          <h1>API 관리</h1>
          <p>INDEX가 쓰는 외부 서비스 키를 등록·교체합니다. 키는 서버에서 암호화해 보관하고, 화면에는 끝 4자리만 보입니다. 여기 등록한 키가 서버 기본값보다 우선하며 1분 안에 반영됩니다.</p>
        </div>
      </header>
      {error && <p className="admin-note admin-note--error" role="alert">{error}</p>}
      {notice && <p className="admin-note" role="status">{notice}</p>}
      {!status && !error && <p className="admin-table__empty">불러오는 중입니다…</p>}

      {groups.map((group) => (
        <section key={group} className="admin-card ak-group">
          <h2>{group}</h2>
          {status!.keys.filter((row) => row.group === group).map((row) => <KeyItem key={row.name} row={row} act={act} call={call} />)}
        </section>
      ))}

      {status && <AddCustom act={act} />}

      {status && (
        <section className="admin-card ak-group">
          <h2>서버 기본 설정 <small>Vercel에서만 변경</small></h2>
          <p className="ak-help">서버가 스스로를 운영하는 데 쓰는 값이라 이 화면에서는 바꿀 수 없습니다. 설정 여부만 보여 줍니다.</p>
          <ul className="ak-server">
            {status.serverOnly.map((item) => (
              <li key={item.name}><span><b>{item.label}</b><code>{item.name}</code></span><em className={item.configured ? "is-ok" : "is-none"}>{item.configured ? "설정됨" : "없음"}</em></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

type Act = (body: Record<string, unknown>, done: string) => Promise<boolean>;
type Call = <T>(body: Record<string, unknown>) => Promise<T>;

function KeyItem({ row, act, call }: { row: KeyRow; act: Act; call: Call }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const save = async () => {
    setBusy(true);
    if (await act({ action: "save", name: row.name, value }, `${row.label} 키를 저장했습니다.`)) { setEditing(false); setValue(""); setResult(null); }
    setBusy(false);
  };
  const test = async () => {
    setBusy(true);
    setResult(null);
    try {
      setResult(await call<{ ok: boolean; message: string }>({ action: "test", name: row.name }));
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : "확인하지 못했습니다." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="ak-row">
      <div className="ak-row__main">
        <div className="ak-row__title"><b>{row.label}</b><code>{row.name}</code></div>
        <p>{row.use || "용도 미기재"}</p>
        <div className="ak-row__meta">
          <span className={`ak-badge ak-badge--${row.broken ? "broken" : row.source}`}>{row.broken ? "다시 입력 필요" : SOURCE[row.source]}</span>
          {row.last4 && <span>••••{row.last4}</span>}
          {row.updatedAt && <span>{row.updatedAt.slice(0, 10)} · {row.updatedBy}</span>}
          {result && <span className={result.ok ? "ak-ok" : "ak-fail"}>{result.message}</span>}
        </div>
        {editing && (
          <div className="ak-edit">
            <input type="password" autoComplete="off" value={value} placeholder={`${row.label} 키 붙여넣기`} aria-label={`${row.label} 키`} onChange={(event) => setValue(event.target.value)} />
            <button type="button" className="admin-btn admin-btn--primary" disabled={busy || !value.trim()} onClick={() => void save()}>저장</button>
            <button type="button" className="admin-btn" onClick={() => { setEditing(false); setValue(""); }}>취소</button>
          </div>
        )}
      </div>
      {!editing && (
        <div className="ak-row__actions">
          <button type="button" className="admin-btn" onClick={() => setEditing(true)}>{row.source === "admin" ? "교체" : "등록"}</button>
          {row.test && row.source !== "none" && <button type="button" className="admin-btn" disabled={busy} onClick={() => void test()}>{busy ? "확인 중…" : "연결 확인"}</button>}
          {(row.source === "admin" || row.broken) && <button type="button" className="admin-btn" disabled={busy} onClick={() => { if (window.confirm(`${row.label}의 관리자 등록 키를 지울까요? 서버 기본값이 있으면 그 값을 씁니다.`)) void act({ action: "remove", name: row.name }, "관리자 등록 키를 지웠습니다."); }}>지우기</button>}
          {row.custom && <button type="button" className="admin-btn" disabled={busy} onClick={() => { if (window.confirm(`${row.label} 항목을 목록에서 없앨까요?`)) void act({ action: "removeCustom", name: row.name }, "항목을 없앴습니다."); }}>항목 삭제</button>}
        </div>
      )}
    </article>
  );
}

function AddCustom({ act }: { act: Act }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [use, setUse] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return <button type="button" className="admin-btn ak-add" onClick={() => setOpen(true)}>+ API 추가</button>;
  return (
    <section className="admin-card ak-group">
      <h2>API 추가</h2>
      <p className="ak-help">새 서비스의 키를 미리 보관해 둘 수 있습니다. 실제 기능에서 쓰려면 개발로 연결해야 합니다.</p>
      <div className="ak-form">
        <label className="fpr-field"><span>표시 이름</span><input value={label} placeholder="예: 네이버 검색" onChange={(event) => setLabel(event.target.value)} /></label>
        <label className="fpr-field"><span>변수 이름 (영문 대문자)</span><input value={name} placeholder="예: NAVER_CLIENT_SECRET" onChange={(event) => setName(event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))} /></label>
        <label className="fpr-field"><span>용도</span><input value={use} placeholder="예: 블로그 검색" onChange={(event) => setUse(event.target.value)} /></label>
        <label className="fpr-field"><span>키 값 (나중에 넣어도 됨)</span><input type="password" autoComplete="off" value={value} onChange={(event) => setValue(event.target.value)} /></label>
      </div>
      <div className="ak-edit">
        <button type="button" className="admin-btn admin-btn--primary" disabled={busy || !name || !label} onClick={async () => {
          setBusy(true);
          if (await act({ action: "addCustom", name, label, use, value }, `${label} 항목을 추가했습니다.`)) { setOpen(false); setName(""); setLabel(""); setUse(""); setValue(""); }
          setBusy(false);
        }}>추가</button>
        <button type="button" className="admin-btn" onClick={() => setOpen(false)}>취소</button>
      </div>
    </section>
  );
}
