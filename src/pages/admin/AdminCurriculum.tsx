import { useEffect, useMemo, useState, type FormEvent } from "react";
import { FiArrowDown, FiArrowUp, FiCopy, FiEdit2, FiMinus, FiPlus, FiSearch, FiTrash2, FiX } from "react-icons/fi";
import { CustomSelect } from "../../components/ui/custom-select";
import {
  CURRICULUM_CATEGORIES,
  CURRICULUM_PRESETS,
  MODULE_LEVELS,
  SEED_MODULES,
  type CurriculumPreset,
} from "../../data/curriculumModules";
import {
  curriculumToText,
  deleteCurriculum,
  deleteCurriculumModule,
  formatMinutes,
  importSeedModules,
  newDayId,
  saveCurriculum,
  saveCurriculumModule,
  useCurricula,
  useCurriculumModules,
  type Curriculum,
  type CurriculumInput,
  type CurriculumModule,
  type ModuleLevel,
} from "../../lib/curriculum";
import "./AdminCurriculum.css";

const LEVEL_CLASS: Record<ModuleLevel, string> = { 기초: "basic", 응용: "app", 심화: "adv" };
const NEW = "__new__";

type Draft = CurriculumInput & { id?: string; createdAt?: number };

const emptyDraft = (): Draft => ({
  title: "",
  summary: "",
  audience: "",
  status: "draft",
  days: [{ id: newDayId(), items: [] }],
});

const toDraft = (c: Curriculum): Draft => ({
  id: c.id,
  createdAt: c.createdAt,
  title: c.title,
  summary: c.summary,
  audience: c.audience,
  status: c.status,
  days: c.days.length > 0 ? c.days.map((d) => ({ ...d, items: [...d.items] })) : [{ id: newDayId(), items: [] }],
});

const categoryLabel = (key: string) => CURRICULUM_CATEGORIES.find((c) => c.key === key)?.label ?? key;

export default function AdminCurriculum() {
  const { data: modules, loading: modulesLoading, error: modulesError } = useCurriculumModules();
  const { data: curricula, loading: curriculaLoading, error: curriculaError } = useCurricula({ includeDrafts: true });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [dirty, setDirty] = useState(false);
  const [activeDay, setActiveDay] = useState(0);

  const [category, setCategory] = useState<string>("all");
  const [levels, setLevels] = useState<Set<ModuleLevel>>(new Set());
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const [editingModule, setEditingModule] = useState<CurriculumModule | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const moduleMap = useMemo(() => new Map(modules.map((m) => [m.id, m])), [modules]);

  // 처음 열 때: 저장된 과정이 있으면 가장 최근 것을, 없으면 새 과정을 연다.
  useEffect(() => {
    if (curriculaLoading || selectedId !== null) return;
    if (curricula.length > 0) {
      setSelectedId(curricula[0]!.id);
      setDraft(toDraft(curricula[0]!));
    } else {
      setSelectedId(NEW);
      setDraft(emptyDraft());
    }
  }, [curriculaLoading, curricula, selectedId]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(t);
  }, [notice]);

  // ── 라이브러리 필터 ──
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of modules) map.set(m.category, (map.get(m.category) ?? 0) + 1);
    return map;
  }, [modules]);

  const placed = useMemo(() => {
    const map = new Map<string, number>();
    draft.days.forEach((d, i) => d.items.forEach((it) => map.set(it.moduleId, i)));
    return map;
  }, [draft.days]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return modules.filter((m) => {
      if (category !== "all" && m.category !== category) return false;
      if (levels.size > 0 && !levels.has(m.level)) return false;
      if (!q) return true;
      return [m.id, m.title, m.summary, m.deliverable, m.audience, m.practice, ...m.objectives]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [modules, category, levels, search]);

  // ── 과정 통계 ──
  const dayMinutes = draft.days.map((d) => d.items.reduce((s, it) => s + (moduleMap.get(it.moduleId)?.minutes ?? 0), 0));
  const totalMinutes = dayMinutes.reduce((a, b) => a + b, 0);
  const totalItems = draft.days.reduce((n, d) => n + d.items.length, 0);

  // ── draft 편집 ──
  function update(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  }

  function updateDays(fn: (days: Draft["days"]) => Draft["days"]) {
    setDraft((d) => ({ ...d, days: fn(d.days.map((x) => ({ ...x, items: [...x.items] }))) }));
    setDirty(true);
  }

  function addModule(moduleId: string) {
    if (placed.has(moduleId)) return;
    const target = Math.min(activeDay, draft.days.length - 1);
    updateDays((days) => {
      days[target]!.items.push({ moduleId });
      return days;
    });
  }

  function removeItem(dayIdx: number, itemIdx: number) {
    updateDays((days) => {
      days[dayIdx]!.items.splice(itemIdx, 1);
      return days;
    });
  }

  function moveItem(dayIdx: number, itemIdx: number, delta: -1 | 1) {
    updateDays((days) => {
      const items = days[dayIdx]!.items;
      const to = itemIdx + delta;
      if (to >= 0 && to < items.length) {
        [items[itemIdx], items[to]] = [items[to]!, items[itemIdx]!];
        return days;
      }
      // 일차 경계를 넘으면 이전/다음 일차의 끝/처음으로 옮긴다.
      const nextDay = dayIdx + delta;
      if (nextDay < 0 || nextDay >= days.length) return days;
      const [item] = items.splice(itemIdx, 1);
      if (delta === -1) days[nextDay]!.items.push(item!);
      else days[nextDay]!.items.unshift(item!);
      return days;
    });
  }

  function moveToDay(dayIdx: number, itemIdx: number, toDay: number) {
    if (toDay === dayIdx) return;
    updateDays((days) => {
      const [item] = days[dayIdx]!.items.splice(itemIdx, 1);
      days[toDay]!.items.push(item!);
      return days;
    });
  }

  function setNote(dayIdx: number, itemIdx: number, note: string) {
    updateDays((days) => {
      days[dayIdx]!.items[itemIdx] = { ...days[dayIdx]!.items[itemIdx]!, note: note || undefined };
      return days;
    });
  }

  function addDay() {
    updateDays((days) => [...days, { id: newDayId(), items: [] }]);
    setActiveDay(draft.days.length);
  }

  function removeLastDay() {
    if (draft.days.length <= 1) return;
    const last = draft.days[draft.days.length - 1]!;
    if (last.items.length > 0 && !window.confirm(`${draft.days.length}일차의 모듈 ${last.items.length}개를 ${draft.days.length - 1}일차로 옮기고 일차를 줄일까요?`)) {
      return;
    }
    updateDays((days) => {
      const removed = days.pop()!;
      days[days.length - 1]!.items.push(...removed.items);
      return days;
    });
    setActiveDay((i) => Math.min(i, draft.days.length - 2));
  }

  function applyPreset(p: CurriculumPreset) {
    const known = (ids: string[]) => ids.filter((id) => moduleMap.has(id)).map((moduleId) => ({ moduleId }));
    setDraft((d) => ({
      ...d,
      title: d.title || p.title,
      summary: d.summary || p.summary,
      audience: d.audience || p.audience,
      days: p.days.map((ids) => ({ id: newDayId(), items: known(ids) })),
    }));
    setActiveDay(0);
    setDirty(true);
  }

  function clearPlan() {
    if (totalItems > 0 && !window.confirm("담은 모듈을 모두 비울까요?")) return;
    update({ days: [{ id: newDayId(), items: [] }] });
    setActiveDay(0);
  }

  // ── 과정 선택·저장 ──
  function confirmDiscard() {
    return !dirty || window.confirm("저장하지 않은 변경 사항이 있습니다. 버리고 이동할까요?");
  }

  function selectCurriculum(id: string) {
    if (id === selectedId || !confirmDiscard()) return;
    if (id === NEW) {
      setDraft(emptyDraft());
    } else {
      const found = curricula.find((c) => c.id === id);
      if (!found) return;
      setDraft(toDraft(found));
    }
    setSelectedId(id);
    setDirty(false);
    setActiveDay(0);
  }

  async function handleSave(status?: Draft["status"]) {
    if (!draft.title.trim()) {
      setNotice({ tone: "error", text: "과정 이름을 입력하세요." });
      return;
    }
    if (status === "published" && totalItems === 0) {
      setNotice({ tone: "error", text: "모듈이 하나도 없는 과정은 게시할 수 없습니다." });
      return;
    }
    setSaving(true);
    try {
      const next: Draft = { ...draft, title: draft.title.trim(), status: status ?? draft.status };
      const { id, createdAt, ...input } = next;
      const savedId = await saveCurriculum(input, id, createdAt);
      setDraft({ ...next, id: savedId, createdAt: createdAt ?? Date.now() });
      setSelectedId(savedId);
      setDirty(false);
      setNotice({
        tone: "ok",
        text: status === "published" ? "게시했습니다." : status === "draft" ? "게시를 내리고 초안으로 저장했습니다." : "저장했습니다.",
      });
    } catch (err) {
      setNotice({ tone: "error", text: `저장하지 못했습니다: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!draft.id) return;
    if (!window.confirm(`'${draft.title || "제목 없는 과정"}' 과정을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await deleteCurriculum(draft.id);
      const rest = curricula.filter((c) => c.id !== draft.id);
      if (rest.length > 0) {
        setSelectedId(rest[0]!.id);
        setDraft(toDraft(rest[0]!));
      } else {
        setSelectedId(NEW);
        setDraft(emptyDraft());
      }
      setDirty(false);
      setActiveDay(0);
      setNotice({ tone: "ok", text: "과정을 삭제했습니다." });
    } catch (err) {
      setNotice({ tone: "error", text: `삭제하지 못했습니다: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(curriculumToText(draft, moduleMap));
      setNotice({ tone: "ok", text: "구성안을 복사했습니다." });
    } catch {
      setNotice({ tone: "error", text: "클립보드에 복사하지 못했습니다." });
    }
  }

  async function handleImportSeed() {
    try {
      const n = await importSeedModules(new Set(modules.map((m) => m.id)));
      setNotice({ tone: "ok", text: n > 0 ? `기본 모듈 ${n}개를 불러왔습니다.` : "이미 모든 기본 모듈이 있습니다." });
    } catch (err) {
      setNotice({ tone: "error", text: `불러오지 못했습니다: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  const curriculumOptions = [
    ...curricula.map((c) => ({ value: c.id, label: `${c.title || "제목 없는 과정"} · ${c.status === "published" ? "게시 중" : "초안"}` })),
    { value: NEW, label: "+ 새 과정" },
  ];
  const missingSeed = SEED_MODULES.filter((m) => !moduleMap.has(m.id)).length;
  const loadError = modulesError || curriculaError;

  return (
    <div className="admin-page cb">
      <header className="admin-page__head cb-head">
        <div>
          <h1>커리큘럼 빌더</h1>
          <p>강의 모듈을 골라 일차별로 배치하면 과정이 됩니다. 게시한 과정은 사이트에 공개됩니다.</p>
        </div>
        <div className="cb-head__actions">
          <CustomSelect
            className="cselect__trigger--compact cselect__trigger--toolbar cb-head__select"
            value={selectedId ?? NEW}
            onValueChange={selectCurriculum}
            options={curriculumOptions}
            aria-label="과정 선택"
          />
          <button type="button" className="admin-btn admin-btn--primary" onClick={() => selectCurriculum(NEW)}>
            <FiPlus aria-hidden /> 새 과정
          </button>
        </div>
      </header>

      {loadError && <p className="admin-modal__error">불러오기 오류: {loadError}</p>}
      {notice && <p className={`cb-notice cb-notice--${notice.tone}`} role="status">{notice.text}</p>}

      {!modulesLoading && missingSeed > 0 && (
        <section className="admin-card cb-seed">
          <p>
            {modules.length === 0
              ? "강의 모듈이 아직 없습니다. 인테리어 실무 × AI 기본 모듈로 시작하세요."
              : `기본 모듈 중 ${missingSeed}개가 라이브러리에 없습니다.`}
          </p>
          <button type="button" className="admin-btn" onClick={() => void handleImportSeed()}>
            기본 모듈 {missingSeed}개 불러오기
          </button>
        </section>
      )}

      <section className="admin-card cb-shell">
        {/* ── 분야 ── */}
        <nav className="cb-cats" aria-label="분야">
          <button type="button" className={`cb-cat${category === "all" ? " is-active" : ""}`} onClick={() => setCategory("all")}>
            <span>전체</span>
            <em>{modules.length}</em>
          </button>
          {CURRICULUM_CATEGORIES.map((c) => (
            <button
              type="button"
              key={c.key}
              className={`cb-cat${category === c.key ? " is-active" : ""}`}
              onClick={() => setCategory(c.key)}
            >
              <span>{c.label}</span>
              <em>{counts.get(c.key) ?? 0}</em>
            </button>
          ))}
        </nav>

        {/* ── 모듈 라이브러리 ── */}
        <div className="cb-lib">
          <div className="cb-lib__bar">
            <label className="cb-search">
              <FiSearch aria-hidden />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="업무로 찾기 · 견적, 방수, 하자, 위험성평가, 정산"
                aria-label="모듈 검색"
              />
            </label>
            <button type="button" className="admin-btn" onClick={() => setEditingModule("new")}>
              <FiPlus aria-hidden /> 모듈
            </button>
          </div>
          <div className="cb-lib__filters">
            {MODULE_LEVELS.map((lv) => (
              <button
                type="button"
                key={lv}
                className={`cb-chip${levels.has(lv) ? " is-on" : ""}`}
                aria-pressed={levels.has(lv)}
                onClick={() =>
                  setLevels((prev) => {
                    const next = new Set(prev);
                    if (next.has(lv)) next.delete(lv);
                    else next.add(lv);
                    return next;
                  })
                }
              >
                <i className={`cb-dot cb-dot--${LEVEL_CLASS[lv]}`} />
                {lv}
              </button>
            ))}
            <span className="cb-lib__count">{filtered.length}개</span>
          </div>

          <div className="cb-lib__list">
            {modulesLoading && <p className="cb-empty">불러오는 중…</p>}
            {!modulesLoading && filtered.length === 0 && (
              <p className="cb-empty">{modules.length === 0 ? "모듈이 없습니다." : "조건에 맞는 모듈이 없습니다."}</p>
            )}
            {filtered.map((m) => {
              const dayIdx = placed.get(m.id);
              const open = expanded === m.id;
              return (
                <article key={m.id} className={`cb-mod${dayIdx !== undefined ? " is-in" : ""}`}>
                  <div className="cb-mod__body">
                    <div className="cb-mod__meta">
                      <code>{m.id}</code>
                      <span className={`cb-lv cb-lv--${LEVEL_CLASS[m.level]}`}>
                        <i className={`cb-dot cb-dot--${LEVEL_CLASS[m.level]}`} />
                        {m.level}
                      </span>
                      <span>{m.minutes}분</span>
                      {category === "all" && <span className="cb-mod__cat">{categoryLabel(m.category)}</span>}
                      {m.caution && <span className="cb-mod__flag">확인 필요</span>}
                    </div>
                    <h3>{m.title}</h3>
                    <p className="cb-mod__summary">{m.summary}</p>
                    <p className="cb-mod__foot">
                      {m.deliverable && (
                        <span>
                          <b>산출물</b> {m.deliverable}
                        </span>
                      )}
                      {m.audience && (
                        <span>
                          <b>대상</b> {m.audience}
                        </span>
                      )}
                    </p>
                    {open && (
                      <dl className="cb-mod__detail">
                        {m.objectives.length > 0 && (
                          <>
                            <dt>학습 목표</dt>
                            <dd>
                              <ul>
                                {m.objectives.map((o) => (
                                  <li key={o}>{o}</li>
                                ))}
                              </ul>
                            </dd>
                          </>
                        )}
                        {m.practice && (
                          <>
                            <dt>실습</dt>
                            <dd>{m.practice}</dd>
                          </>
                        )}
                        {m.caution && (
                          <>
                            <dt>주의</dt>
                            <dd className="cb-mod__caution">{m.caution}</dd>
                          </>
                        )}
                      </dl>
                    )}
                    <button type="button" className="cb-link" onClick={() => setExpanded(open ? null : m.id)}>
                      {open ? "접기" : "자세히"}
                    </button>
                  </div>
                  <div className="cb-mod__actions">
                    {dayIdx !== undefined ? (
                      <span className="cb-mod__placed">{dayIdx + 1}일차</span>
                    ) : (
                      <button type="button" className="cb-add" onClick={() => addModule(m.id)}>
                        담기
                      </button>
                    )}
                    <button type="button" className="cb-icon" title="모듈 편집" aria-label={`${m.id} 편집`} onClick={() => setEditingModule(m)}>
                      <FiEdit2 />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        {/* ── 과정 구성 ── */}
        <aside className="cb-plan">
          <div className="cb-plan__meta">
            <input
              className="cb-plan__title"
              value={draft.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="과정 이름 (예: 현장 실무자 과정)"
              aria-label="과정 이름"
            />
            <input
              value={draft.audience}
              onChange={(e) => update({ audience: e.target.value })}
              placeholder="대상 (예: 현장소장·공무)"
              aria-label="대상"
            />
            <textarea
              value={draft.summary}
              onChange={(e) => update({ summary: e.target.value })}
              placeholder="과정 소개 한두 문장"
              rows={2}
              aria-label="과정 소개"
            />
          </div>

          <div className="cb-plan__head">
            <div>
              <strong>구성</strong>
              <small>
                모듈 {totalItems}개 · {formatMinutes(totalMinutes)}
              </small>
            </div>
            <div className="cb-stepper" aria-label="일수">
              <button type="button" onClick={removeLastDay} disabled={draft.days.length <= 1} aria-label="하루 줄이기">
                <FiMinus />
              </button>
              <span>{draft.days.length}일</span>
              <button type="button" onClick={addDay} aria-label="하루 늘리기">
                <FiPlus />
              </button>
            </div>
          </div>

          <div className="cb-plan__days">
            {totalItems === 0 && (
              <div className="cb-presets">
                <p>왼쪽에서 모듈을 담아 보세요. 막막하다면 추천 구성에서 시작해 빼고 더하면 됩니다.</p>
                {CURRICULUM_PRESETS.map((p) => (
                  <button type="button" key={p.key} className="cb-preset" onClick={() => applyPreset(p)}>
                    <strong>{p.title}</strong>
                    <small>
                      {p.days.length}일 · 모듈 {p.days.flat().length}개 · {p.audience}
                    </small>
                  </button>
                ))}
              </div>
            )}

            {draft.days.map((day, di) => (
              <section
                key={day.id}
                className={`cb-day${activeDay === di ? " is-active" : ""}`}
                onClick={() => setActiveDay(di)}
              >
                <header className="cb-day__head">
                  <strong>{di + 1}일차</strong>
                  <input
                    value={day.theme ?? ""}
                    onChange={(e) =>
                      updateDays((days) => {
                        days[di] = { ...days[di]!, theme: e.target.value || undefined };
                        return days;
                      })
                    }
                    onClick={(e) => e.stopPropagation()}
                    placeholder="주제 (선택)"
                    aria-label={`${di + 1}일차 주제`}
                  />
                  <span>{formatMinutes(dayMinutes[di] ?? 0)}</span>
                </header>
                {day.items.length === 0 ? (
                  <p className="cb-day__empty">{activeDay === di ? "여기에 담깁니다" : "눌러서 이 일차에 담기"}</p>
                ) : (
                  <ol className="cb-day__items">
                    {day.items.map((it, ii) => {
                      const m = moduleMap.get(it.moduleId);
                      return (
                        <li key={`${it.moduleId}-${ii}`} className={m ? "" : "is-missing"}>
                          <div className="cb-item__main">
                            <code>{it.moduleId}</code>
                            <span className="cb-item__title">{m ? m.title : "삭제된 모듈"}</span>
                            {m && <small>{m.minutes}분</small>}
                          </div>
                          <input
                            className="cb-item__note"
                            value={it.note ?? ""}
                            onChange={(e) => setNote(di, ii, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="이 과정용 메모 (선택)"
                            aria-label={`${it.moduleId} 메모`}
                          />
                          <div className="cb-item__tools" onClick={(e) => e.stopPropagation()}>
                            <button type="button" aria-label="위로" onClick={() => moveItem(di, ii, -1)} disabled={di === 0 && ii === 0}>
                              <FiArrowUp />
                            </button>
                            <button
                              type="button"
                              aria-label="아래로"
                              onClick={() => moveItem(di, ii, 1)}
                              disabled={di === draft.days.length - 1 && ii === day.items.length - 1}
                            >
                              <FiArrowDown />
                            </button>
                            {draft.days.length > 1 && (
                              <CustomSelect
                                className="cselect__trigger--compact cb-item__day"
                                value={String(di)}
                                onValueChange={(v) => moveToDay(di, ii, Number(v))}
                                options={draft.days.map((_, i) => ({ value: String(i), label: `${i + 1}일차` }))}
                                aria-label="일차 옮기기"
                              />
                            )}
                            <button type="button" aria-label="빼기" onClick={() => removeItem(di, ii)}>
                              <FiX />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            ))}
          </div>

          <footer className="cb-plan__foot">
            <div className="cb-status">
              <span className={`cb-badge cb-badge--${draft.status}`}>{draft.status === "published" ? "게시 중" : "초안"}</span>
              {dirty && <span className="cb-dirty">저장 안 됨</span>}
            </div>
            <div className="cb-plan__buttons">
              <button type="button" className="admin-btn" disabled={saving} onClick={() => void handleSave()}>
                저장
              </button>
              {draft.status === "published" ? (
                <button type="button" className="admin-btn" disabled={saving} onClick={() => void handleSave("draft")}>
                  게시 내리기
                </button>
              ) : (
                <button type="button" className="admin-btn admin-btn--primary" disabled={saving} onClick={() => void handleSave("published")}>
                  게시하기
                </button>
              )}
            </div>
            <div className="cb-plan__links">
              <button type="button" className="cb-link" onClick={() => void handleCopy()} disabled={totalItems === 0}>
                <FiCopy aria-hidden /> 구성안 복사
              </button>
              <button type="button" className="cb-link" onClick={clearPlan} disabled={totalItems === 0}>
                모두 비우기
              </button>
              {draft.id && (
                <button type="button" className="cb-link cb-link--danger" onClick={() => void handleDelete()}>
                  <FiTrash2 aria-hidden /> 과정 삭제
                </button>
              )}
            </div>
          </footer>
        </aside>
      </section>

      {editingModule && (
        <ModuleEditor
          module={editingModule === "new" ? null : editingModule}
          existingIds={new Set(modules.map((m) => m.id))}
          usedIn={
            editingModule === "new"
              ? []
              : curricula.filter((c) => c.days.some((d) => d.items.some((it) => it.moduleId === editingModule.id))).map((c) => c.title)
          }
          defaultCategory={category === "all" ? "ai" : category}
          onClose={() => setEditingModule(null)}
          onSaved={(text) => setNotice({ tone: "ok", text })}
        />
      )}
    </div>
  );
}

// ── 모듈 편집 모달 ───────────────────────────────────────────────────────────
function ModuleEditor({
  module,
  existingIds,
  usedIn,
  defaultCategory,
  onClose,
  onSaved,
}: {
  module: CurriculumModule | null;
  existingIds: Set<string>;
  usedIn: string[];
  defaultCategory: string;
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const [form, setForm] = useState({
    id: module?.id ?? "",
    title: module?.title ?? "",
    category: module?.category ?? defaultCategory,
    level: module?.level ?? ("기초" as ModuleLevel),
    minutes: String(module?.minutes ?? 60),
    summary: module?.summary ?? "",
    objectives: (module?.objectives ?? []).join("\n"),
    practice: module?.practice ?? "",
    deliverable: module?.deliverable ?? "",
    audience: module?.audience ?? "",
    caution: module?.caution ?? "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const id = form.id.trim().toUpperCase();
    const minutes = Number(form.minutes);
    if (!id || !form.title.trim()) return setError("코드와 제목은 필수입니다.");
    if (!/^[A-Z0-9-]+$/.test(id)) return setError("코드는 영문 대문자·숫자·하이픈만 쓸 수 있습니다. (예: EST-06)");
    if (id !== module?.id && existingIds.has(id)) return setError(`${id} 코드는 이미 있습니다.`);
    if (!Number.isFinite(minutes) || minutes < 10 || minutes > 600) return setError("시간은 10~600분 사이로 입력하세요.");
    if (module && id !== module.id && usedIn.length > 0) {
      return setError(`이 모듈은 과정 ${usedIn.length}개에 쓰이고 있어 코드를 바꿀 수 없습니다.`);
    }
    setBusy(true);
    try {
      await saveCurriculumModule(
        {
          id,
          title: form.title.trim(),
          category: form.category,
          level: form.level,
          minutes,
          summary: form.summary.trim(),
          objectives: form.objectives.split("\n").map((s) => s.trim()).filter(Boolean),
          practice: form.practice.trim(),
          deliverable: form.deliverable.trim(),
          audience: form.audience.trim(),
          caution: form.caution.trim() || undefined,
        },
        module?.id,
      );
      onSaved(module ? `${id} 모듈을 수정했습니다.` : `${id} 모듈을 추가했습니다.`);
      onClose();
    } catch (err) {
      setError(`저장하지 못했습니다: ${err instanceof Error ? err.message : String(err)}`);
      setBusy(false);
    }
  }

  async function remove() {
    if (!module) return;
    const warn = usedIn.length > 0 ? `\n이 모듈을 쓰는 과정(${usedIn.join(", ")})에는 "삭제된 모듈"로 표시됩니다.` : "";
    if (!window.confirm(`${module.id} 모듈을 삭제할까요?${warn}`)) return;
    setBusy(true);
    try {
      await deleteCurriculumModule(module.id);
      onSaved(`${module.id} 모듈을 삭제했습니다.`);
      onClose();
    } catch (err) {
      setError(`삭제하지 못했습니다: ${err instanceof Error ? err.message : String(err)}`);
      setBusy(false);
    }
  }

  return (
    <div className="admin-modal" role="dialog" aria-modal="true">
      <button type="button" className="admin-modal__overlay" aria-label="닫기" onClick={onClose} />
      <form className="admin-modal__card admin-modal__card--wide" onSubmit={submit}>
        <h2>{module ? `${module.id} 모듈 편집` : "새 모듈"}</h2>
        <div className="admin-modal__row">
          <label>
            코드 <em>*</em>
            <input value={form.id} onChange={(e) => set("id")(e.target.value)} placeholder="EST-06" required autoFocus={!module} />
          </label>
          <label>
            분야
            <CustomSelect
              value={form.category}
              onValueChange={set("category")}
              options={CURRICULUM_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))}
            />
          </label>
          <label>
            난이도
            <CustomSelect value={form.level} onValueChange={set("level")} options={MODULE_LEVELS} />
          </label>
        </div>
        <div className="admin-modal__row cb-editor__row">
          <label>
            제목 <em>*</em>
            <input value={form.title} onChange={(e) => set("title")(e.target.value)} required />
          </label>
          <label>
            시간(분)
            <input type="number" min={10} max={600} step={5} value={form.minutes} onChange={(e) => set("minutes")(e.target.value)} />
          </label>
        </div>
        <label>
          요약
          <textarea rows={2} value={form.summary} onChange={(e) => set("summary")(e.target.value)} />
        </label>
        <label>
          학습 목표 (한 줄에 하나)
          <textarea rows={3} value={form.objectives} onChange={(e) => set("objectives")(e.target.value)} />
        </label>
        <div className="admin-modal__row admin-modal__row--2">
          <label>
            실습
            <input value={form.practice} onChange={(e) => set("practice")(e.target.value)} />
          </label>
          <label>
            산출물
            <input value={form.deliverable} onChange={(e) => set("deliverable")(e.target.value)} />
          </label>
        </div>
        <div className="admin-modal__row admin-modal__row--2">
          <label>
            대상 예
            <input value={form.audience} onChange={(e) => set("audience")(e.target.value)} />
          </label>
          <label>
            주의 (사람이 꼭 확인할 점)
            <input value={form.caution} onChange={(e) => set("caution")(e.target.value)} placeholder="예: 원문·유권해석 확인" />
          </label>
        </div>
        {usedIn.length > 0 && <p className="cb-editor__used">사용 중인 과정: {usedIn.join(", ")}</p>}
        {error && <p className="admin-modal__error">{error}</p>}
        <div className="admin-modal__actions">
          {module && (
            <button type="button" className="admin-btn admin-btn--danger cb-editor__delete" onClick={() => void remove()} disabled={busy}>
              삭제
            </button>
          )}
          <button type="button" className="admin-btn" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="admin-btn admin-btn--primary" disabled={busy}>
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </div>
  );
}
