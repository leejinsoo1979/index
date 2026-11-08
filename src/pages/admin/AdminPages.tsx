/**
 * 페이지 관리 — admin-editable page copy and lists (siteContent). Operators change these here,
 * never in code: the /ai page copy (section by section) and the "INDEX와 함께하는 사람들" partner list.
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { ABOUT_SECTIONS, aboutEditableDefaults, type AboutEditable } from "../../data/aboutEditable";
import { partners as defaultPartners, type Partner } from "../../data/partners";
import { mergeContent, resetSiteContent, saveSiteContent, useSiteContent } from "../../lib/siteContent";
import { ContentEditor, type Json } from "./ContentEditor";
import "./AdminPages.css";

const TABS = [
  { key: "about", label: "INDEX AI 페이지" },
  { key: "partners", label: "함께하는 업체" },
] as const;

export default function AdminPages() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("about");
  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <h1>페이지 관리</h1>
        <p>홈페이지 문구와 목록을 여기서 고칩니다. 저장하면 사이트에 바로 반영됩니다.</p>
      </header>
      <div className="admin-toolbar">
        <div className="admin-toolbar__tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? "is-active" : ""} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === "about" ? <AboutCopyEditor /> : <PartnersEditor />}
    </div>
  );
}

function useSaver(key: string) {
  const { user } = useAuth();
  const [state, setState] = useState<{ busy: boolean; message: string; error: boolean }>({ busy: false, message: "", error: false });
  async function save(value: unknown, message = "저장했습니다. 사이트에 반영되었습니다.") {
    setState({ busy: true, message: "", error: false });
    try {
      await saveSiteContent(key, value, user?.email ?? null);
      setState({ busy: false, message, error: false });
    } catch (e) {
      setState({ busy: false, message: `저장하지 못했습니다: ${e instanceof Error ? e.message : String(e)}`, error: true });
    }
  }
  async function reset() {
    if (!window.confirm("저장한 내용을 지우고 기본 문구로 되돌릴까요?")) return;
    setState({ busy: true, message: "", error: false });
    try {
      await resetSiteContent(key);
      setState({ busy: false, message: "기본값으로 되돌렸습니다.", error: false });
    } catch (e) {
      setState({ busy: false, message: `되돌리지 못했습니다: ${e instanceof Error ? e.message : String(e)}`, error: true });
    }
  }
  return { ...state, save, reset };
}

function AboutCopyEditor() {
  const { value: saved, saved: hasSaved, loading } = useSiteContent<Partial<AboutEditable> | null>("about", null);
  const current = useMemo(() => mergeContent(aboutEditableDefaults, saved), [saved]);
  const [draft, setDraft] = useState<AboutEditable>(current);
  const [section, setSection] = useState<keyof AboutEditable>("hero");
  const saver = useSaver("about");
  // Load the stored copy once it arrives (until the admin starts editing).
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setDraft(current);
  }, [current, touched]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(current);
  const info = ABOUT_SECTIONS.find((s) => s.key === section)!;

  return (
    <section className="ap-layout">
      <nav className="ap-sections" aria-label="페이지 구역">
        {ABOUT_SECTIONS.map((s) => (
          <button key={s.key} type="button" className={section === s.key ? "is-active" : ""} onClick={() => setSection(s.key)}>
            <strong>{s.label}</strong>
            <small>{s.hint}</small>
          </button>
        ))}
      </nav>
      <div className="admin-card ap-editor">
        <div className="ap-editor__head">
          <div>
            <h2>{info.label}</h2>
            <p>{loading ? "불러오는 중…" : hasSaved ? "관리자가 저장한 문구를 쓰고 있습니다." : "아직 저장한 적 없음 — 기본 문구가 보이는 중입니다."} 줄바꿈은 입력칸에서 Enter로 넣습니다.</p>
          </div>
          <a className="admin-btn" href="/ai" target="_blank" rel="noreferrer">페이지 보기 ↗</a>
        </div>
        <ContentEditor
          value={draft[section] as unknown as Json}
          onChange={(v) => {
            setTouched(true);
            setDraft({ ...draft, [section]: v as unknown } as AboutEditable);
          }}
        />
        <SaveBar
          dirty={dirty}
          busy={saver.busy}
          message={saver.message}
          error={saver.error}
          onSave={() => void saver.save(draft).then(() => setTouched(false))}
          onDiscard={() => {
            setDraft(current);
            setTouched(false);
          }}
          onReset={hasSaved ? () => void saver.reset().then(() => setTouched(false)) : undefined}
        />
      </div>
    </section>
  );
}

const isUrl = (u: string) => /^https?:\/\/\S+$/i.test(u.trim());

/** Rows pasted from Excel/Sheets: 상호 ⇥ 지역 ⇥ 기수 ⇥ URL (a header row is skipped). */
function parsePasted(text: string): Partner[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split("\t").map((c) => c.trim()))
    .filter((cells) => cells[0] && !/^(상호|상호명|no\.?)$/i.test(cells[0]))
    .map(([name, region = "", cohort = "", url = ""]) => {
      const fixed = url && !/^https?:\/\//i.test(url) && /^[\w.-]+\.[a-z]{2,}/i.test(url) ? `https://${url}` : url;
      return { name, region, cohort, ...(isUrl(fixed) ? { url: fixed } : {}) };
    });
}

function PartnersEditor() {
  const { value: current, saved: hasSaved, loading } = useSiteContent<Partner[]>("partners", defaultPartners);
  const [draft, setDraft] = useState<Partner[]>(current);
  const [touched, setTouched] = useState(false);
  const [query, setQuery] = useState("");
  const [paste, setPaste] = useState("");
  const saver = useSaver("partners");
  useEffect(() => {
    if (!touched) setDraft(current);
  }, [current, touched]);

  const edit = (next: Partner[]) => {
    setTouched(true);
    setDraft(next);
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(current);
  const q = query.trim().toLowerCase();
  const visible = draft.map((p, i) => ({ p, i })).filter(({ p }) => !q || [p.name, p.region, p.cohort, p.url].some((v) => v?.toLowerCase().includes(q)));
  const badLinks = draft.filter((p) => p.url && !isUrl(p.url)).length;
  const duplicates = draft.length - new Set(draft.map((p) => p.name.replace(/\s/g, ""))).size;

  function update(i: number, patch: Partial<Partner>) {
    edit(draft.map((p, j) => {
      if (j !== i) return p;
      const next = { ...p, ...patch };
      if (!next.url) delete next.url;
      return next;
    }));
  }

  function importPaste() {
    const rows = parsePasted(paste);
    if (!rows.length) return;
    const known = new Map(draft.map((p, i) => [p.name.replace(/\s/g, ""), i]));
    const next = [...draft];
    let added = 0;
    let updated = 0;
    for (const row of rows) {
      const at = known.get(row.name.replace(/\s/g, ""));
      if (at === undefined) {
        next.unshift(row);
        added += 1;
      } else {
        next[at] = { ...next[at], ...row };
        updated += 1;
      }
    }
    edit(next);
    setPaste("");
    window.alert(`붙여넣기 완료: 새 업체 ${added}곳, 기존 업체 갱신 ${updated}곳. 확인 후 저장을 눌러 주세요.`);
  }

  return (
    <section className="admin-card ap-editor">
      <div className="ap-editor__head">
        <div>
          <h2>함께하는 업체 <small>{draft.length}곳</small></h2>
          <p>
            {loading ? "불러오는 중…" : hasSaved ? "관리자가 저장한 목록을 쓰고 있습니다." : "아직 저장한 적 없음 — 기본 목록(인쇼아카데미 레벨2 1~14기)이 보이는 중입니다."}{" "}
            /ai 페이지의 검정 배경 업체 흐름에 나옵니다. 링크가 있는 업체는 누르면 그 주소로 이동합니다.
          </p>
        </div>
        <a className="admin-btn" href="/ai" target="_blank" rel="noreferrer">페이지 보기 ↗</a>
      </div>

      <details className="ap-paste">
        <summary>엑셀에서 붙여넣어 한꺼번에 추가·갱신</summary>
        <p>엑셀이나 구글 시트에서 <b>상호 · 지역 · 기수 · URL</b> 순서의 열을 복사해 붙여넣으세요. 같은 상호는 갱신되고, 새 상호는 목록 맨 위에 추가됩니다.</p>
        <textarea rows={5} value={paste} placeholder={"디자인위트\t경기 고양\t7기\thttps://blog.naver.com/wit_design"} onChange={(e) => setPaste(e.target.value)} />
        <button type="button" className="admin-btn" disabled={!paste.trim()} onClick={importPaste}>붙여넣은 내용 적용</button>
      </details>

      <div className="ap-partner-tools">
        <input type="search" placeholder="상호·지역·기수·주소 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="button" className="admin-btn" onClick={() => edit([{ name: "", region: "", cohort: "" }, ...draft])}>+ 업체 추가</button>
        {(badLinks > 0 || duplicates > 0) && (
          <span className="ap-warn">
            {badLinks > 0 && `주소 형식이 이상한 링크 ${badLinks}개`} {duplicates > 0 && `같은 상호 ${duplicates}개`}
          </span>
        )}
      </div>

      <div className="admin-table-wrap ap-partner-table">
        <table className="admin-table">
          <thead>
            <tr>
              <th>상호</th>
              <th>지역</th>
              <th>기수</th>
              <th>링크 주소</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map(({ p, i }) => (
              <tr key={i}>
                <td><input value={p.name} placeholder="상호" onChange={(e) => update(i, { name: e.target.value })} /></td>
                <td><input value={p.region} placeholder="지역" onChange={(e) => update(i, { region: e.target.value })} /></td>
                <td className="ap-col-short"><input value={p.cohort} placeholder="기수" onChange={(e) => update(i, { cohort: e.target.value })} /></td>
                <td>
                  <input
                    value={p.url ?? ""}
                    placeholder="https://… (없으면 비워 두기)"
                    className={p.url && !isUrl(p.url) ? "is-invalid" : ""}
                    onChange={(e) => update(i, { url: e.target.value.trim() || undefined })}
                  />
                </td>
                <td className="admin-table__actions">
                  {p.url && isUrl(p.url) && <a className="admin-btn" href={p.url} target="_blank" rel="noopener noreferrer">열기</a>}
                  <button type="button" className="admin-btn admin-btn--danger" onClick={() => window.confirm(`${p.name || "이 업체"}를 목록에서 뺄까요?`) && edit(draft.filter((_, j) => j !== i))}>삭제</button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={5} className="admin-table__empty">검색 결과가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <SaveBar
        dirty={dirty}
        busy={saver.busy}
        message={saver.message}
        error={saver.error}
        onSave={() => {
          const clean = draft.filter((p) => p.name.trim()).map((p) => ({ ...p, name: p.name.trim(), region: p.region.trim(), cohort: p.cohort.trim(), ...(p.url && isUrl(p.url) ? { url: p.url.trim() } : {}) }));
          if (draft.some((p) => p.url && !isUrl(p.url)) && !window.confirm("형식이 이상한 링크는 빼고 저장합니다. 계속할까요?")) return;
          void saver.save(clean.map((p) => (p.url && isUrl(p.url) ? p : (({ url: _u, ...rest }) => rest)(p)))).then(() => setTouched(false));
        }}
        onDiscard={() => {
          setDraft(current);
          setTouched(false);
        }}
        onReset={hasSaved ? () => void saver.reset().then(() => setTouched(false)) : undefined}
      />
    </section>
  );
}

function SaveBar(props: { dirty: boolean; busy: boolean; message: string; error: boolean; onSave: () => void; onDiscard: () => void; onReset?: () => void }) {
  return (
    <div className="ap-savebar">
      <span className={props.error ? "is-error" : ""} role="status">
        {props.message || (props.dirty ? "저장하지 않은 변경이 있습니다." : "변경 사항 없음")}
      </span>
      <div>
        {props.onReset && (
          <button type="button" className="admin-btn" disabled={props.busy} onClick={props.onReset}>기본값으로 되돌리기</button>
        )}
        <button type="button" className="admin-btn" disabled={!props.dirty || props.busy} onClick={props.onDiscard}>변경 취소</button>
        <button type="button" className="admin-btn admin-btn--primary" disabled={!props.dirty || props.busy} onClick={props.onSave}>
          {props.busy ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}

