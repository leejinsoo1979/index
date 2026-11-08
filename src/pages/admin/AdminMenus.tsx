import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { CustomSelect } from "../../components/ui/custom-select";
import { defaultNavigation, type NavLink, type SiteNavigation } from "../../data/navigation";
import { isExternalLink, useNavigation } from "../../lib/navigation";
import { resetSiteContent, saveSiteContent } from "../../lib/siteContent";
import "./AdminMenus.css";

/**
 * 메뉴 관리 — the site's header menu, footer columns, legal links and footer lines.
 * Saved as the `navigation` site-content block; Header, Footer and the placeholder routes read it
 * through useNavigation(), so changes show on the site right away without a code change.
 */
type Visibility = "all" | "admin" | "hidden";
const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: "all", label: "모두에게 보임" },
  { value: "admin", label: "관리자에게만" },
  { value: "hidden", label: "숨김" },
];
const visibilityOf = (l: NavLink): Visibility => (l.hidden ? "hidden" : l.adminOnly ? "admin" : "all");
const withVisibility = (l: NavLink, v: Visibility): NavLink => ({ ...l, hidden: v === "hidden" || undefined, adminOnly: v === "admin" || undefined });

const clone = (n: SiteNavigation): SiteNavigation => JSON.parse(JSON.stringify(n)) as SiteNavigation;

function linkProblem(l: NavLink): string | null {
  if (!l.label.trim()) return "이름을 입력해 주세요.";
  const to = l.to.trim();
  if (!to) return "링크를 입력해 주세요.";
  if (!to.startsWith("/") && !isExternalLink(to)) return "링크는 /로 시작하는 사이트 주소나 https:// 주소여야 합니다.";
  return null;
}

export default function AdminMenus() {
  const { user } = useAuth();
  const { nav, saved, loading } = useNavigation();
  const [draft, setDraft] = useState<SiteNavigation>(() => clone(nav));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  // Load the live menus once they arrive (and after a reset), unless the admin is mid-edit.
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setDraft(clone(nav));
  }, [nav, touched]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(nav), [draft, nav]);
  const problems = useMemo(() => {
    const all = [...draft.primary, ...draft.footer.flatMap((c) => c.links), ...draft.legal];
    return all.map(linkProblem).filter(Boolean) as string[];
  }, [draft]);

  const update = (fn: (d: SiteNavigation) => void) => {
    setTouched(true);
    setNotice("");
    setDraft((cur) => {
      const next = clone(cur);
      fn(next);
      return next;
    });
  };

  async function save() {
    if (problems.length) {
      setError(problems[0]!);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const clean: SiteNavigation = {
        ...draft,
        primary: draft.primary.map((l) => ({ ...l, label: l.label.trim(), to: l.to.trim(), englishLabel: l.englishLabel?.trim() || undefined })),
        footer: draft.footer.filter((c) => c.links.length > 0).map((c) => ({ links: c.links.map((l) => ({ ...l, label: l.label.trim(), to: l.to.trim() })) })),
        legal: draft.legal.map((l) => ({ ...l, label: l.label.trim(), to: l.to.trim() })),
        org: draft.org.trim(),
        copyright: draft.copyright.trim(),
      };
      await saveSiteContent("navigation", JSON.parse(JSON.stringify(clean)), user?.email ?? null);
      setTouched(false);
      setNotice("저장했습니다. 사이트 메뉴에 바로 반영됩니다.");
    } catch (e) {
      setError(`저장하지 못했습니다: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!window.confirm("메뉴를 처음 기본값으로 되돌릴까요? 지금 저장된 메뉴는 사라집니다.")) return;
    setBusy(true);
    setError("");
    try {
      await resetSiteContent("navigation");
      setTouched(false);
      setDraft(clone(defaultNavigation));
      setNotice("기본 메뉴로 되돌렸습니다.");
    } catch (e) {
      setError(`되돌리지 못했습니다: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-page admin-menus">
      <header className="admin-page__head">
        <div>
          <h1>메뉴 관리</h1>
          <p>사이트 위쪽 메뉴, 아래쪽 메뉴와 약관 링크, 하단 문구를 바꿉니다. 저장하면 코드 수정 없이 사이트에 바로 반영됩니다.</p>
        </div>
        <div className="admin-menus__actions">
          {saved && (
            <button type="button" className="admin-btn" onClick={() => void reset()} disabled={busy}>
              기본값으로 되돌리기
            </button>
          )}
          <button type="button" className="admin-btn" onClick={() => { setTouched(false); setDraft(clone(nav)); setError(""); }} disabled={busy || !dirty}>
            바꾼 내용 취소
          </button>
          <button type="button" className="admin-btn admin-btn--primary" onClick={() => void save()} disabled={busy || !dirty || loading}>
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </header>

      {error && <p className="admin-modal__error">{error}</p>}
      {notice && <p className="admin-menus__notice">{notice}</p>}
      {!saved && !loading && <p className="admin-menus__hint">아직 저장한 적이 없어 기본 메뉴가 보이고 있습니다.</p>}

      <LinkList
        title="위쪽 메뉴"
        description="사이트 맨 위 가로 메뉴입니다. 영문 이름이 있으면 기본으로 영문이 보이고, 마우스를 올리면 한글이 보입니다."
        links={draft.primary}
        withEnglish
        onChange={(links) => update((d) => void (d.primary = links))}
      />

      <section className="admin-card admin-menus__section">
        <div className="admin-menus__section-head">
          <div>
            <h2>아래쪽 메뉴</h2>
            <p>사이트 맨 아래 메뉴입니다. 열 단위로 묶여 보입니다.</p>
          </div>
          <button type="button" className="admin-btn" onClick={() => update((d) => void d.footer.push({ links: [{ label: "새 메뉴", to: "/" }] }))}>
            + 열 추가
          </button>
        </div>
        {draft.footer.map((col, ci) => (
          <div key={ci} className="admin-menus__column">
            <div className="admin-menus__column-head">
              <strong>{ci + 1}열</strong>
              <div>
                <button type="button" className="admin-btn" disabled={ci === 0} onClick={() => update((d) => void d.footer.splice(ci - 1, 2, d.footer[ci]!, d.footer[ci - 1]!))}>
                  ← 앞으로
                </button>
                <button type="button" className="admin-btn admin-btn--danger" onClick={() => window.confirm(`${ci + 1}열을 지울까요?`) && update((d) => void d.footer.splice(ci, 1))}>
                  열 삭제
                </button>
              </div>
            </div>
            <LinkRows links={col.links} onChange={(links) => update((d) => void (d.footer[ci]!.links = links))} />
          </div>
        ))}
      </section>

      <LinkList title="약관 링크" description="맨 아래 오른쪽의 개인정보처리방침·이용약관 같은 링크입니다." links={draft.legal} onChange={(links) => update((d) => void (d.legal = links))} />

      <section className="admin-card admin-menus__section">
        <div className="admin-menus__section-head">
          <div>
            <h2>하단 문구</h2>
            <p>로고 아래 단체명과 맨 아래 저작권 문구입니다.</p>
          </div>
        </div>
        <div className="admin-menus__texts">
          <label>
            <span>단체명</span>
            <input value={draft.org} onChange={(e) => update((d) => void (d.org = e.target.value))} />
          </label>
          <label>
            <span>저작권 문구</span>
            <input value={draft.copyright} onChange={(e) => update((d) => void (d.copyright = e.target.value))} />
          </label>
        </div>
      </section>
    </div>
  );
}

function LinkList({ title, description, links, withEnglish, onChange }: { title: string; description: string; links: NavLink[]; withEnglish?: boolean; onChange: (links: NavLink[]) => void }) {
  return (
    <section className="admin-card admin-menus__section">
      <div className="admin-menus__section-head">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <LinkRows links={links} withEnglish={withEnglish} onChange={onChange} />
    </section>
  );
}

function LinkRows({ links, withEnglish, onChange }: { links: NavLink[]; withEnglish?: boolean; onChange: (links: NavLink[]) => void }) {
  const set = (i: number, patch: Partial<NavLink> | ((l: NavLink) => NavLink)) =>
    onChange(links.map((l, j) => (j === i ? (typeof patch === "function" ? patch(l) : { ...l, ...patch }) : l)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= links.length) return;
    const next = [...links];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  return (
    <div className="admin-menus__rows">
      <div className={`admin-menus__row admin-menus__row--head${withEnglish ? " has-en" : ""}`} aria-hidden>
        <span>순서</span>
        <span>이름</span>
        {withEnglish && <span>영문 이름</span>}
        <span>링크</span>
        <span>공개</span>
        <span>새 탭</span>
        <span />
      </div>
      {links.map((l, i) => {
        const problem = linkProblem(l);
        return (
          <div key={i} className={`admin-menus__row${withEnglish ? " has-en" : ""}${l.hidden ? " is-hidden" : ""}`}>
            <span className="admin-menus__order">
              <button type="button" aria-label="위로" disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button type="button" aria-label="아래로" disabled={i === links.length - 1} onClick={() => move(i, 1)}>
                ↓
              </button>
            </span>
            <input aria-label="이름" value={l.label} onChange={(e) => set(i, { label: e.target.value })} />
            {withEnglish && <input aria-label="영문 이름" value={l.englishLabel ?? ""} placeholder="선택" onChange={(e) => set(i, { englishLabel: e.target.value })} />}
            <input aria-label="링크" value={l.to} placeholder="/cases 또는 https://…" onChange={(e) => set(i, { to: e.target.value })} aria-invalid={Boolean(problem)} title={problem ?? undefined} />
            <CustomSelect aria-label="공개 범위" value={visibilityOf(l)} onValueChange={(v) => set(i, (cur) => withVisibility(cur, v as Visibility))} options={VISIBILITY_OPTIONS} />
            <label className="admin-menus__check">
              <input type="checkbox" checked={Boolean(l.newTab)} onChange={(e) => set(i, { newTab: e.target.checked || undefined })} />
              <span className="sr-only">새 탭에서 열기</span>
            </label>
            <button type="button" className="admin-menus__remove" aria-label={`${l.label || "메뉴"} 삭제`} onClick={() => onChange(links.filter((_, j) => j !== i))}>
              삭제
            </button>
          </div>
        );
      })}
      <button type="button" className="admin-btn admin-menus__add" onClick={() => onChange([...links, { label: "새 메뉴", to: "/" }])}>
        + 메뉴 추가
      </button>
    </div>
  );
}
