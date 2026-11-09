/**
 * 도면 관리 — the whole floor plan collection: list and filter complexes, correct names and areas,
 * hide wrong drawings, set map locations, and register a new complex by address with its plans.
 * Changes are stored apart from the collected data (R2 index/edits.json), see api/_floorplanManage.ts.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { CustomSelect } from "../../components/ui/custom-select";
import { FloorPlanLocationPicker, type PickedPlace } from "../../components/FloorPlanLocationPicker";
import { FloorPlanZoom } from "../../components/FloorPlanFigure";
import { resetFloorPlanMapData } from "../../components/FloorPlanMap";
import { imageToPlanJpeg, renderPdfPage, type PlanJpeg } from "../../lib/planFiles";
import "../../components/FloorPlanMap.css";
import "./AdminFloorPlans.css";

type Call = <T>(body: Record<string, unknown>) => Promise<T>;
type Row = { kbId: string; name: string; region: string; dong: string; hidden: boolean; added: boolean; located: boolean; suspect: number; surveyed: number; reviewed: number; hiddenPlans: number; count: number };
type ListResult = { counts: Record<string, number>; total: number; page: number; pages: number; rows: Row[] };
type DetailPlan = { id: string; type: string; pyeong: number; supply: number; exclusive: number; suspect: boolean; hidden: boolean; added: boolean; surveyedNote: string | null; review: "approved" | "draft" | null; url: string };
type Detail = { danji: { kbId: string; name: string; region: string; dong: string; hidden: boolean; added: boolean; lat: number | null; lng: number | null }; plans: DetailPlan[] };

const FILTERS = [
  { id: "all", label: "전체" },
  { id: "noLocation", label: "위치 없음" },
  { id: "suspect", label: "중복 의심" },
  { id: "surveyed", label: "실측 교체" },
  { id: "reviewed", label: "검수 완료" },
  { id: "hidden", label: "숨김" },
  { id: "added", label: "직접 등록" },
];

type RegionTree = Record<string, Record<string, string[]>>;
/** Radix select items can't have an empty value, so "no choice" gets its own. */
const ANY = "__any";
const regionOptions = (values: string[], allLabel: string) => [{ value: ANY, label: allLabel }, ...values.filter(Boolean).map((value) => ({ value }))];

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export default function AdminFloorPlanManage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [view, setView] = useState<{ mode: "list" } | { mode: "add" } | { mode: "detail"; kbId: string; notice?: string }>(params.get("add") ? { mode: "add" } : { mode: "list" });
  const [filter, setFilter] = useState("all");
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [list, setList] = useState<ListResult | null>(null);
  const [error, setError] = useState("");
  const [tree, setTree] = useState<RegionTree>({});
  const [sido, setSido] = useState(ANY);
  const [sigungu, setSigungu] = useState(ANY);
  const [dong, setDong] = useState(ANY);
  const districts = sido === ANY ? {} : tree[sido] ?? {};
  // 세종 has no 시·군·구 level: its 동 list hangs directly under the 시.
  const hasSigungu = Object.keys(districts).some(Boolean);
  const dongs = (hasSigungu ? (sigungu === ANY ? [] : districts[sigungu]) : districts[""]) ?? [];

  const call = useCallback<Call>(async <T,>(body: Record<string, unknown>): Promise<T> => {
    const token = await user?.getIdToken();
    const response = await fetch("/api/floorplans", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new Error(payload.error || "요청을 처리하지 못했습니다.");
    return payload;
  }, [user]);

  useEffect(() => {
    if (view.mode !== "list") return;
    let active = true;
    setError("");
    call<ListResult>({ action: "manageList", filter, query, page, sido: sido === ANY ? "" : sido, sigungu: sigungu === ANY ? "" : sigungu, dong: dong === ANY ? "" : dong }).then((result) => active && setList(result)).catch((e: unknown) => active && setError(errorText(e, "목록을 불러오지 못했습니다.")));
    return () => {
      active = false;
    };
  }, [call, filter, query, page, sido, sigungu, dong, view.mode]);

  useEffect(() => {
    if (view.mode !== "list") return;
    let active = true;
    call<{ tree: RegionTree }>({ action: "manageRegions" }).then((result) => active && setTree(result.tree)).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [call, view.mode]);

  if (view.mode === "add") return <DanjiRegister call={call} onCancel={() => setView({ mode: "list" })} onFailedPlan={(kbId, notice) => setView({ mode: "detail", kbId, notice })} onDone={(kbId) => navigate(`/admin/floorplan-map?open=${kbId}`)} />;
  if (view.mode === "detail") return <DanjiDetail key={view.kbId} kbId={view.kbId} notice={view.notice} call={call} onBack={() => setView({ mode: "list" })} />;

  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <div>
          <h1>도면 관리</h1>
          <p>단지와 도면을 고치거나 숨기고, 주소로 새 단지를 지도에 등록합니다. 저장하면 지도와 챗봇에 바로 반영됩니다.</p>
        </div>
        <button type="button" className="admin-btn admin-btn--primary" onClick={() => setView({ mode: "add" })}>지도에 단지 등록</button>
      </header>

      <div className="fpm-regions">
        <CustomSelect aria-label="시·도" options={regionOptions(Object.keys(tree), "시·도 전체")} value={sido} onValueChange={(value) => { setSido(value); setSigungu(ANY); setDong(ANY); setPage(1); }} />
        <CustomSelect aria-label="시·군·구" disabled={!hasSigungu} options={regionOptions(Object.keys(districts), "시·군·구 전체")} value={sigungu} onValueChange={(value) => { setSigungu(value); setDong(ANY); setPage(1); }} />
        <CustomSelect aria-label="읍·면·동" disabled={!dongs.length} options={regionOptions(dongs, "읍·면·동 전체")} value={dong} onValueChange={(value) => { setDong(value); setPage(1); }} />
      </div>

      <form className="fpr-search" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(input); }}>
        <input type="search" value={input} placeholder="단지명, 지역, 동으로 찾기" onChange={(event) => setInput(event.target.value)} />
        <button type="submit" className="admin-btn admin-btn--primary">찾기</button>
      </form>

      <div className="fpm-filters" role="tablist" aria-label="도면 상태">
        {FILTERS.map((item) => (
          <button type="button" role="tab" key={item.id} aria-selected={filter === item.id} onClick={() => { setFilter(item.id); setPage(1); }}>
            {item.label}<b>{(list?.counts[item.id] ?? 0).toLocaleString()}</b>
          </button>
        ))}
      </div>

      {error && <p className="admin-note admin-note--error" role="alert">{error}</p>}

      <section className="admin-card fpr-list">
        {!list ? <p className="admin-table__empty">불러오는 중입니다…</p> : list.rows.length === 0 ? <p className="admin-table__empty">해당하는 단지가 없습니다.</p> : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>단지</th><th>지역</th><th>도면</th><th>지도</th><th>상태</th><th /></tr></thead>
              <tbody>
                {list.rows.map((row) => (
                  <tr key={row.kbId}>
                    <td className="admin-table__title">{row.name}</td>
                    <td>{row.region} {row.dong}</td>
                    <td>{row.count}개</td>
                    <td>{row.located ? "있음" : <button type="button" className="fpm-tag fpm-tag--warn fpm-tag--action" title="지도에서 위치 지정하기" onClick={() => setView({ mode: "detail", kbId: row.kbId })}>위치 없음 · 지정</button>}</td>
                    <td>
                      <span className="fpm-tags">
                        {row.hidden && <span className="fpm-tag">단지 숨김</span>}
                        {row.added && <span className="fpm-tag">직접 등록</span>}
                        {row.suspect > 0 && <span className="fpm-tag fpm-tag--warn">중복 의심 {row.suspect}</span>}
                        {row.surveyed > 0 && <span className="fpm-tag">실측 {row.surveyed}</span>}
                        {row.reviewed > 0 && <span className="fpm-tag">검수 {row.reviewed}</span>}
                        {row.hiddenPlans > 0 && <span className="fpm-tag">숨긴 도면 {row.hiddenPlans}</span>}
                      </span>
                    </td>
                    <td>
                      <span className="fpm-row-actions">
                        {row.hidden || row.count === 0
                          ? <button type="button" className="admin-btn" disabled title="숨겼거나 도면이 없는 단지입니다">보기</button>
                          : <Link className="admin-btn" to={`/admin/floorplan-map?open=${row.kbId}`}>보기</Link>}
                        <button type="button" className="admin-btn" onClick={() => setView({ mode: "detail", kbId: row.kbId })}>관리</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list && list.pages > 1 && (
          <div className="fpm-pages">
            <button type="button" className="admin-btn" disabled={list.page <= 1} onClick={() => setPage(list.page - 1)}>이전</button>
            <span>{list.page.toLocaleString()} / {list.pages.toLocaleString()} 쪽 · {list.total.toLocaleString()}곳</span>
            <button type="button" className="admin-btn" disabled={list.page >= list.pages} onClick={() => setPage(list.page + 1)}>다음</button>
          </div>
        )}
      </section>
    </div>
  );
}

/** A plan being prepared for upload: the file turned into a JPEG, plus its type and areas. */
function usePlanDraft() {
  const [file, setFile] = useState<File | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [rendered, setRendered] = useState<PlanJpeg | null>(null);
  const [type, setType] = useState("");
  const [exclusive, setExclusive] = useState("");
  const [supply, setSupply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load(target: File, pageNumber: number) {
    setBusy(true);
    setError("");
    try {
      const isPdf = target.type === "application/pdf" || /\.pdf$/i.test(target.name);
      const result = isPdf ? await renderPdfPage(await target.arrayBuffer(), pageNumber) : await imageToPlanJpeg(target);
      setPages(result.pages ?? 0);
      setRendered(result);
    } catch (e) {
      setRendered(null);
      setError(`파일을 읽지 못했습니다: ${errorText(e, "형식을 확인해 주세요.")}`);
    } finally {
      setBusy(false);
    }
  }

  return {
    file, page, pages, rendered, type, exclusive, supply, busy, error, setType, setExclusive, setSupply,
    ready: Boolean(rendered && type.trim() && Number(exclusive) > 0 && Number(supply) > 0),
    choose(next: File | null) {
      setFile(next);
      setPage(1);
      setPages(0);
      setRendered(null);
      if (next) void load(next, 1);
    },
    choosePage(value: number) {
      setPage(value);
      if (file) void load(file, value);
    },
    body: () => ({ image: rendered?.image, type: type.trim(), exclusive: Number(exclusive), supply: Number(supply) }),
    reset() {
      setFile(null);
      setRendered(null);
      setPages(0);
      setType("");
      setExclusive("");
      setSupply("");
    },
  };
}
type PlanDraft = ReturnType<typeof usePlanDraft>;

function PlanDraftFields({ draft }: { draft: PlanDraft }) {
  return (
    <div className="fpm-draft">
      <div className="fpm-draft__fields">
        <label className="fpr-field"><span>평면도 파일 (이미지 또는 PDF)</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" onChange={(event) => draft.choose(event.target.files?.[0] ?? null)} /></label>
        {draft.pages > 1 && <label className="fpr-field"><span>도면이 있는 페이지 (전체 {draft.pages}쪽)</span><input type="number" min={1} max={draft.pages} value={draft.page} onChange={(event) => draft.choosePage(Number(event.target.value) || 1)} /></label>}
        <label className="fpr-field"><span>타입</span><input value={draft.type} placeholder="예: 84A" onChange={(event) => draft.setType(event.target.value)} /></label>
        <div className="fpm-row">
          <label className="fpr-field"><span>전용면적 (㎡)</span><input type="number" min={1} step="0.01" value={draft.exclusive} onChange={(event) => draft.setExclusive(event.target.value)} /></label>
          <label className="fpr-field"><span>공급면적 (㎡)</span><input type="number" min={1} step="0.01" value={draft.supply} onChange={(event) => draft.setSupply(event.target.value)} /></label>
        </div>
        {draft.busy && <p className="fpm-help">파일을 변환하고 있습니다…</p>}
        {draft.error && <p className="admin-note admin-note--error">{draft.error}</p>}
      </div>
      <div className="fpm-draft__preview">{draft.rendered ? <img src={draft.rendered.image} alt="올릴 평면도 미리보기" /> : <span>평면도 미리보기</span>}</div>
    </div>
  );
}

/** Kakao's short names, spelled as the collection spells them so a new complex lands in the same 시·도. */
const SIDO: Record<string, string> = { 서울: "서울특별시", 부산: "부산광역시", 대구: "대구광역시", 인천: "인천광역시", 광주: "전남광주통합특별시", 전남: "전남광주통합특별시", 대전: "대전광역시", 울산: "울산광역시", 세종: "세종특별자치시", 경기: "경기도", 강원: "강원특별자치도", 충북: "충청북도", 충남: "충청남도", 전북: "전북특별자치도", 경북: "경상북도", 경남: "경상남도", 제주: "제주특별자치도" };

/** "서울 양천구 목동 912" → region 서울특별시 양천구, dong 목동. */
function splitAddress(address: string): { region: string; dong: string } | null {
  const parts = address.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const at = parts.findIndex((part, index) => index > 0 && /(동|읍|면|가)$/.test(part));
  if (at < 1) return null;
  return { region: [SIDO[parts[0]!] ?? parts[0]!, ...parts.slice(1, at)].join(" "), dong: parts[at]! };
}

function DanjiRegister({ call, onCancel, onDone, onFailedPlan }: { call: Call; onCancel: () => void; onDone: (kbId: string) => void; onFailedPlan: (kbId: string, notice: string) => void }) {
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [dong, setDong] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const draft = usePlanDraft();

  function picked(place: PickedPlace) {
    setPoint({ lat: place.lat, lng: place.lng });
    if (place.address) {
      setAddress(place.address);
      const split = splitAddress(place.address);
      if (split) {
        setRegion(split.region);
        setDong(split.dong);
      }
    }
    if (place.name) setName(place.name);
  }

  async function register() {
    if (!point) return setMessage("주소를 찾아 위치를 지정해 주세요.");
    if (!name.trim() || !region.trim() || !dong.trim()) return setMessage("단지명, 지역, 동을 입력해 주세요.");
    if (!draft.ready) return setMessage("평면도 파일, 타입, 전용·공급면적을 입력해 주세요.");
    setSaving(true);
    setMessage("");
    let kbId = "";
    try {
      kbId = (await call<{ kbId: string }>({ action: "manageAddDanji", name, region, dong, ...point })).kbId;
      await call({ action: "manageAddPlan", kbId, ...draft.body() });
      resetFloorPlanMapData();
      onDone(kbId);
    } catch (e) {
      if (kbId) onFailedPlan(kbId, `단지는 등록했지만 평면도를 올리지 못했습니다. 평면도를 다시 올려 주세요. (${errorText(e, "오류")})`);
      else setMessage(errorText(e, "등록하지 못했습니다."));
      setSaving(false);
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <div>
          <h1>지도에 단지 등록</h1>
          <p>주소로 위치를 잡고 평면도를 올리면 그 자리에 핀이 생깁니다.</p>
        </div>
        <button type="button" className="admin-btn" onClick={onCancel}>목록으로</button>
      </header>
      <section className="admin-card fpm-card">
        <h2>1. 위치</h2>
        <FloorPlanLocationPicker value={point} onPick={picked} />
        {address && <p className="fpm-help">선택한 주소: {address}</p>}
        <label className="fpr-field"><span>단지명</span><input value={name} placeholder="예: 목동 대원칸타빌" onChange={(event) => setName(event.target.value)} /></label>
        <div className="fpm-row">
          <label className="fpr-field"><span>지역</span><input value={region} placeholder="예: 서울특별시 양천구" onChange={(event) => setRegion(event.target.value)} /></label>
          <label className="fpr-field"><span>동</span><input value={dong} placeholder="예: 목동" onChange={(event) => setDong(event.target.value)} /></label>
        </div>
      </section>
      <section className="admin-card fpm-card">
        <h2>2. 평면도</h2>
        <PlanDraftFields draft={draft} />
      </section>
      {message && <p className="admin-note admin-note--error" role="alert">{message}</p>}
      <div className="fpm-submit">
        <button type="button" className="admin-btn admin-btn--primary" disabled={saving || draft.busy} onClick={() => void register()}>{saving ? "등록 중…" : "지도에 등록"}</button>
      </div>
    </div>
  );
}

function DanjiDetail({ kbId, notice, call, onBack }: { kbId: string; notice?: string; call: Call; onBack: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(notice ?? "");
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [dong, setDong] = useState("");
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const draft = usePlanDraft();

  const load = useCallback(async () => {
    try {
      const result = await call<Detail>({ action: "manageDetail", kbId });
      setDetail(result);
      setName(result.danji.name);
      setRegion(result.danji.region);
      setDong(result.danji.dong);
      setPoint(result.danji.lat !== null && result.danji.lng !== null ? { lat: result.danji.lat, lng: result.danji.lng } : null);
    } catch (e) {
      setError(errorText(e, "단지를 불러오지 못했습니다."));
    }
  }, [call, kbId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(body: Record<string, unknown>, done: string): Promise<boolean> {
    setSaving(true);
    setMessage("");
    try {
      await call(body);
      resetFloorPlanMapData();
      setMessage(done);
      await load();
      return true;
    } catch (e) {
      setMessage(errorText(e, "저장하지 못했습니다."));
      return false;
    } finally {
      setSaving(false);
    }
  }

  if (error) return <div className="admin-page"><p className="admin-note admin-note--error" role="alert">{error}</p><button type="button" className="admin-btn" onClick={onBack}>목록으로</button></div>;
  if (!detail) return <div className="admin-page"><p className="admin-table__empty">불러오는 중입니다…</p></div>;
  const { danji, plans } = detail;
  const moved = point && (point.lat !== danji.lat || point.lng !== danji.lng);
  const visible = plans.filter((plan) => !plan.hidden).length;

  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <div>
          <h1>{danji.name}</h1>
          <p>{danji.region} {danji.dong} · 도면 {visible}개{danji.hidden ? " · 숨김 상태" : ""}</p>
        </div>
        <div className="fpm-head-actions">
          {point && !danji.hidden && visible > 0 && <Link className="admin-btn" to={`/admin/floorplan-map?open=${kbId}`}>지도에서 보기</Link>}
          <button type="button" className="admin-btn" disabled={saving} onClick={() => { if (danji.hidden || window.confirm("이 단지를 지도와 챗봇에서 숨길까요? 언제든 다시 표시할 수 있습니다.")) void save({ action: "manageDanji", kbId, hidden: !danji.hidden }, danji.hidden ? "단지를 다시 표시합니다." : "단지를 숨겼습니다."); }}>{danji.hidden ? "단지 다시 표시" : "단지 숨기기"}</button>
          <button type="button" className="admin-btn" onClick={onBack}>목록으로</button>
        </div>
      </header>
      {message && <p className="admin-note" role="status">{message}</p>}

      <div className="fpm-columns">
        <section className="admin-card fpm-card">
          <h2>단지 정보</h2>
          <label className="fpr-field"><span>단지명</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="fpr-field"><span>지역</span><input value={region} onChange={(event) => setRegion(event.target.value)} /></label>
          <label className="fpr-field"><span>동</span><input value={dong} onChange={(event) => setDong(event.target.value)} /></label>
          <button type="button" className="admin-btn admin-btn--primary" disabled={saving || (name === danji.name && region === danji.region && dong === danji.dong)} onClick={() => void save({ action: "manageDanji", kbId, name, region, dong }, "단지 정보를 저장했습니다.")}>단지 정보 저장</button>
        </section>
        <section className="admin-card fpm-card">
          <h2>지도 위치 {danji.lat === null && <span className="fpm-tag fpm-tag--warn">위치 없음</span>}</h2>
          <FloorPlanLocationPicker value={point} initialQuery={`${danji.region} ${danji.dong}`} onPick={(place) => setPoint({ lat: place.lat, lng: place.lng })} />
          <button type="button" className="admin-btn admin-btn--primary" disabled={saving || !moved} onClick={() => point && void save({ action: "manageDanji", kbId, ...point }, "지도 위치를 저장했습니다.")}>위치 저장</button>
        </section>
      </div>

      <section className="admin-card fpm-card">
        <h2>도면 {plans.length}개</h2>
        {plans.length === 0 ? <p className="fpm-help">아직 도면이 없습니다. 도면을 올려야 지도에 핀이 표시됩니다.</p> : (
          <div className="fpm-plans">
            {plans.map((plan) => <PlanEditor key={plan.id} plan={plan} danji={danji} saving={saving} onSave={save} />)}
          </div>
        )}
      </section>

      <section className="admin-card fpm-card">
        <h2>도면 추가</h2>
        <PlanDraftFields draft={draft} />
        <button type="button" className="admin-btn admin-btn--primary fpm-add" disabled={saving || draft.busy || !draft.ready} onClick={() => void save({ action: "manageAddPlan", kbId, ...draft.body() }, "도면을 추가했습니다.").then((saved) => saved && draft.reset())}>이 도면 추가</button>
      </section>
    </div>
  );
}

function PlanEditor({ plan, danji, saving, onSave }: { plan: DetailPlan; danji: Detail["danji"]; saving: boolean; onSave: (body: Record<string, unknown>, done: string) => Promise<boolean> }) {
  const [type, setType] = useState(plan.type);
  const [exclusive, setExclusive] = useState(String(plan.exclusive));
  const [supply, setSupply] = useState(String(plan.supply));
  const [pyeong, setPyeong] = useState(String(plan.pyeong));
  const [zoom, setZoom] = useState(false);
  const dirty = type !== plan.type || Number(exclusive) !== plan.exclusive || Number(supply) !== plan.supply || Number(pyeong) !== plan.pyeong;

  return (
    <article className={`fpm-plan${plan.hidden ? " is-hidden" : ""}`}>
      <button type="button" className="fpm-plan__img" aria-label={`${plan.type} 평면도 크게 보기`} onClick={() => setZoom(true)}><img src={plan.url} alt={`${plan.type} 평면도`} loading="lazy" /></button>
      <div className="fpm-tags">
        {plan.hidden && <span className="fpm-tag">숨김</span>}
        {plan.added && <span className="fpm-tag">직접 등록</span>}
        {plan.suspect && !plan.surveyedNote && <span className="fpm-tag fpm-tag--warn">중복 의심</span>}
        {plan.surveyedNote && <span className="fpm-tag" title={plan.surveyedNote}>실측</span>}
        {plan.review === "approved" && <span className="fpm-tag">내력벽 검수</span>}
      </div>
      <label className="fpr-field"><span>타입</span><input value={type} onChange={(event) => setType(event.target.value)} /></label>
      <div className="fpm-row">
        <label className="fpr-field"><span>전용 ㎡</span><input type="number" step="0.01" value={exclusive} onChange={(event) => setExclusive(event.target.value)} /></label>
        <label className="fpr-field"><span>공급 ㎡</span><input type="number" step="0.01" value={supply} onChange={(event) => setSupply(event.target.value)} /></label>
        <label className="fpr-field"><span>평</span><input type="number" step="0.01" value={pyeong} onChange={(event) => setPyeong(event.target.value)} /></label>
      </div>
      <div className="fpm-plan__actions">
        <button type="button" className="admin-btn admin-btn--primary" disabled={saving || !dirty} onClick={() => void onSave({ action: "managePlan", id: plan.id, type, exclusive: Number(exclusive), supply: Number(supply), pyeong: Number(pyeong) }, "도면 정보를 저장했습니다.")}>저장</button>
        <button type="button" className="admin-btn" disabled={saving} onClick={() => void onSave({ action: "managePlan", id: plan.id, hidden: !plan.hidden }, plan.hidden ? "도면을 다시 표시합니다." : "도면을 숨겼습니다.")}>{plan.hidden ? "다시 표시" : "숨기기"}</button>
        {plan.suspect && !plan.surveyedNote && <button type="button" className="admin-btn" disabled={saving} onClick={() => void onSave({ action: "managePlan", id: plan.id, notSuspect: true }, "정상 도면으로 표시했습니다.")}>정상 도면</button>}
        {!plan.hidden && !danji.hidden && <Link className="admin-btn" to={`/admin/floorplans?kbId=${danji.kbId}&plan=${plan.id}`}>검수·실측</Link>}
      </div>
      {zoom && <FloorPlanZoom url={plan.url} label={`${danji.name} ${plan.type}`} mirrored={false} onClose={() => setZoom(false)} />}
    </article>
  );
}
