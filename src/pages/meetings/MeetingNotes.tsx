import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { CustomSelect } from "@/components/ui/custom-select";
import ThinkingOrb from "@/components/orbs/ThinkingOrb";
import {
  KIND_LABEL,
  clock,
  meetingAudio,
  meetingFetch,
  speakerLabel,
  speakerName,
  uploadMeeting,
  type Health,
  type Meeting,
  type MeetingKind,
  type MeetingSummary,
  type Participant,
} from "./meetingApi";
import { useRecorder, type RecordSource } from "./useRecorder";
import "./MeetingNotes.css";

const NONE = "none";
const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const STAGE_TEXT: Record<string, string> = {
  loading: "음성 인식 모델을 준비하는 중입니다…",
  transcribing: "받아 적는 중입니다…",
  aligning: "말한 시간을 맞추는 중입니다…",
  diarizing: "화자를 나누는 중입니다…",
  analyzing: "회의 내용을 정리하는 중입니다…",
};
const TOOL_LABEL: Record<string, string> = { "work-permit": "공사 신고·허가 판정", "quote-review": "견적서 검토", "defect-period": "하자 책임기간", "company-check": "업체 한 번에 확인" };
const busy = (m: { status: string }) => m.status === "queued" || m.status === "transcribing" || m.status === "analyzing";

/** 회의록 AI — the dedicated screen behind the Apps card `meeting-notes`. */
export default function MeetingNotes({ basePath }: { basePath: string }) {
  const { user, loading } = useAuth();
  const [params, setParams] = useSearchParams();
  const open = params.get("m");
  const [health, setHealth] = useState<Health | null>(null);
  const [list, setList] = useState<MeetingSummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/meetings/health")
      .then((r) => (r.ok ? r.json() : null))
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      setList((await meetingFetch<{ meetings: MeetingSummary[] }>(user, "")).meetings);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [user]);
  useEffect(() => void refresh(), [refresh]);

  const show = (id: string | null) => setParams(id ? { m: id } : {});

  return (
    <div className="tool-detail meetings">
      <Link className="tool-detail__back" to={open ? `${basePath}/meeting-notes` : basePath} onClick={(e) => { if (open) { e.preventDefault(); show(null); void refresh(); } }}>
        ← {open ? "회의 목록" : "전체 도구"}
      </Link>
      {!open && (
        <header className="tool-detail__head">
          <p className="tool-detail__stage">전 단계 공통</p>
          <h1 className="tool-detail__name">회의록 AI</h1>
          <p className="tool-detail__desc">
            녹음하면 화자별로 받아 적고, 결정 사항·할 일·추가 비용·일정 변경까지 정리합니다. 임원 회의는 참석 임원마다 개인 위키에 기억으로 남아 임원 에이전트가 다음 대화에서 기억합니다. 녹음은 협회 서버에만 보관됩니다.
          </p>
          {health && !health.diarization && (
            <p className="meetings__note">화자 분리 모델이 아직 연결되지 않았습니다. 지금은 받아 적은 뒤 줄마다 말한 사람을 직접 지정할 수 있습니다.</p>
          )}
        </header>
      )}

      {loading ? null : !user ? (
        <p className="tools__empty">
          회원 로그인 후 사용할 수 있습니다. <Link to={`/mypage?redirect=${basePath}/meeting-notes`}>로그인</Link>
        </p>
      ) : health === null ? (
        <p className="tools__empty">회의록 서버에 연결하지 못했습니다. 협회 서버에서 회의록 서비스가 켜져 있어야 합니다.</p>
      ) : open ? (
        <MeetingDetail id={open} basePath={basePath} onDeleted={() => { show(null); void refresh(); }} onOpen={show} />
      ) : (
        <div className="meetings__home">
          <NewMeeting previous={list ?? []} onCreated={(m) => { show(m.id); void refresh(); }} />
          <section className="meetings__list" aria-label="지난 회의">
            <h2 className="meetings__h2">지난 회의</h2>
            {error && <p className="meetings__error">{error}</p>}
            {list && list.length === 0 && <p className="meetings__muted">아직 기록한 회의가 없습니다.</p>}
            <ul>
              {(list ?? []).map((m) => (
                <li key={m.id}>
                  <button type="button" className="meeting-row" onClick={() => show(m.id)}>
                    <span className="meeting-row__title">{m.title}</span>
                    <span className="meeting-row__meta">
                      {m.date} · {KIND_LABEL[m.kind]}
                      {m.duration ? ` · ${clock(m.duration)}` : ""}
                      {m.participants.length ? ` · ${m.participants.map((p) => p.name).join(", ")}` : ""}
                    </span>
                    <span className={`meeting-row__status is-${m.status}`}>
                      {m.status === "ready" ? (Object.keys(m.saved.personas ?? {}).length ? "위키 저장됨" : "완료") : m.status === "error" ? "실패" : m.status === "queued" ? "대기 중" : `${Math.round(m.progress)}%`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

// ─── new meeting ────────────────────────────────────────────────────────────

function NewMeeting({ previous, onCreated }: { previous: MeetingSummary[]; onCreated: (m: Meeting) => void }) {
  const { user } = useAuth();
  const rec = useRecorder();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<MeetingKind>("general");
  const [date, setDate] = useState(today);
  const [people, setPeople] = useState<Participant[]>([]);
  const [personas, setPersonas] = useState<{ id: string; name: string; role: string }[]>([]);
  const [guestName, setGuestName] = useState("");
  const [guestRole, setGuestRole] = useState("");
  const [prev, setPrev] = useState(NONE);
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<number | null>(null);
  const [error, setError] = useState("");
  const preview = useMemo(() => (rec.blob ? URL.createObjectURL(rec.blob) : file ? URL.createObjectURL(file) : ""), [rec.blob, file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  useEffect(() => {
    if (!user) return;
    meetingFetch<{ personas: { id: string; name: string; role: string }[] }>(user, "/personas")
      .then((d) => setPersonas(d.personas))
      .catch(() => setPersonas([]));
  }, [user]);

  const togglePersona = (p: { id: string; name: string; role: string }) =>
    setPeople((cur) => (cur.some((x) => x.personaId === p.id) ? cur.filter((x) => x.personaId !== p.id) : [...cur, { name: p.name, role: p.role, personaId: p.id }]));
  const addGuest = () => {
    const name = guestName.trim();
    if (!name || people.some((p) => p.name === name)) return;
    setPeople((cur) => [...cur, { name, role: guestRole.trim() }]);
    setGuestName("");
    setGuestRole("");
  };

  const audio = rec.blob ?? file;
  const recording = rec.state === "recording" || rec.state === "paused";

  async function begin(source: RecordSource) {
    setError("");
    if (!consent) return setError("녹음 전에 참석자 모두에게 녹음 사실을 알리고 동의를 받았는지 확인해 주세요.");
    setFile(null);
    await rec.start(source);
  }

  async function submit() {
    if (!user || !audio) return;
    setError("");
    if (!consent) return setError("참석자 동의 확인이 필요합니다.");
    if (kind === "executive" && !people.some((p) => p.personaId)) return setError("임원 회의는 참석 임원을 한 명 이상 골라 주세요.");
    setUpload(0);
    try {
      const m = await uploadMeeting(await user.getIdToken(), audio, { title: title.trim(), kind, date, participants: people, previousId: prev === NONE ? "" : prev }, setUpload);
      rec.reset();
      setFile(null);
      onCreated(m);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUpload(null);
    }
  }

  return (
    <section className="meeting-new" aria-label="새 회의">
      <h2 className="meetings__h2">새 회의</h2>
      <div className="tool-form meeting-new__grid">
        <label className="tool-form__field">
          <span className="tool-form__label">회의 제목</span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 11월 임원 정례회의" />
        </label>
        <label className="tool-form__field">
          <span className="tool-form__label">종류</span>
          <CustomSelect aria-label="회의 종류" value={kind} onValueChange={(v) => setKind(v as MeetingKind)} options={(Object.keys(KIND_LABEL) as MeetingKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
        </label>
        <label className="tool-form__field">
          <span className="tool-form__label">날짜</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="tool-form__field">
          <span className="tool-form__label">지난 회의 이어받기</span>
          <CustomSelect aria-label="지난 회의" value={prev} onValueChange={setPrev} options={[{ value: NONE, label: "없음" }, ...previous.filter((m) => m.status === "ready").slice(0, 30).map((m) => ({ value: m.id, label: `${m.date} ${m.title}` }))]} />
        </label>
      </div>

      <fieldset className="meeting-new__people">
        <legend className="tool-form__label">참석자 {kind === "executive" && <em>임원 필수</em>}</legend>
        {personas.length > 0 && (
          <div className="meeting-new__personas" role="group" aria-label="임원 에이전트">
            {personas.map((p) => {
              const on = people.some((x) => x.personaId === p.id);
              return (
                <button key={p.id} type="button" className={`tools__chip${on ? " is-active" : ""}`} aria-pressed={on} onClick={() => togglePersona(p)}>
                  {p.name}
                  {p.role && <small> {p.role}</small>}
                </button>
              );
            })}
          </div>
        )}
        <div className="meeting-new__guest">
          <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); addGuest(); } }} placeholder="이름 (예: 고객 김OO)" aria-label="참석자 이름" />
          <input type="text" value={guestRole} onChange={(e) => setGuestRole(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); addGuest(); } }} placeholder="역할 (선택)" aria-label="참석자 역할" />
          <button type="button" className="meetings__btn" onClick={addGuest}>추가</button>
        </div>
        {people.length > 0 && (
          <ol className="meeting-new__chosen">
            {people.map((p) => (
              <li key={p.name}>
                <span>{p.name}{p.role ? ` · ${p.role}` : ""}{p.personaId ? " · 에이전트" : ""}</span>
                <button type="button" aria-label={`${p.name} 빼기`} onClick={() => setPeople((cur) => cur.filter((x) => x.name !== p.name))}>×</button>
              </li>
            ))}
          </ol>
        )}
        <p className="meetings__muted">말을 먼저 시작하는 순서대로 적으면 화자 이름이 더 잘 맞습니다.</p>
      </fieldset>

      <label className="tool-form__field is-check meeting-new__consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>참석자 모두에게 녹음 사실을 알리고 동의를 받았습니다.</span>
      </label>

      <div className="meeting-rec">
        {recording ? (
          <>
            <div className="meeting-rec__live">
              <ThinkingOrb design="listening" diameter={44} label="녹음 중" />
              <div>
                <strong>{rec.state === "paused" ? "일시정지" : "녹음 중"} {clock(rec.elapsed)}</strong>
                <span className="meeting-rec__meter" aria-hidden="true"><span style={{ transform: `scaleX(${rec.state === "paused" ? 0 : Math.max(0.03, rec.level)})` }} /></span>
              </div>
            </div>
            <div className="meeting-rec__actions">
              {rec.state === "paused" ? <button type="button" className="meetings__btn" onClick={rec.resume}>계속</button> : <button type="button" className="meetings__btn" onClick={rec.pause}>일시정지</button>}
              <button type="button" className="tool-form__run" onClick={rec.stop}>녹음 끝내기</button>
            </div>
          </>
        ) : audio ? (
          <>
            <audio className="meeting-rec__preview" src={preview} controls />
            <p className="meetings__muted">{file ? file.name : `녹음 ${clock(rec.elapsed)}`} · {(audio.size / 1024 / 1024).toFixed(1)}MB</p>
            <div className="meeting-rec__actions">
              <button type="button" className="meetings__btn" onClick={() => { rec.reset(); setFile(null); }} disabled={upload != null}>다시</button>
              <button type="button" className="tool-form__run" onClick={() => void submit()} disabled={upload != null}>
                {upload != null ? `올리는 중 ${upload}%` : "회의록 만들기"}
              </button>
            </div>
          </>
        ) : (
          <div className="meeting-rec__start">
            <button type="button" className="meeting-rec__option" onClick={() => void begin("mic")}>
              <strong>마이크로 녹음</strong>
              <span>회의실에서 노트북·휴대폰을 가운데 두고</span>
            </button>
            <button type="button" className="meeting-rec__option" onClick={() => void begin("online")}>
              <strong>온라인 회의 녹음</strong>
              <span>Zoom·Meet 탭을 공유하고 ‘탭 오디오 공유’를 켜면 상대 목소리까지</span>
            </button>
            <label className="meeting-rec__option">
              <strong>녹음 파일 올리기</strong>
              <span>m4a · mp3 · wav · webm, 1GB까지</span>
              <input type="file" accept="audio/*,video/mp4,video/quicktime,video/webm" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { rec.reset(); setFile(f); } }} />
            </label>
          </div>
        )}
      </div>
      {(error || rec.error) && <p className="meetings__error" role="alert">{error || rec.error}</p>}
    </section>
  );
}

// ─── meeting detail ─────────────────────────────────────────────────────────

function MeetingDetail({ id, basePath, onDeleted, onOpen }: { id: string; basePath: string; onDeleted: () => void; onOpen: (id: string) => void }) {
  const { user, isAdmin } = useAuth();
  const [m, setM] = useState<Meeting | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"notes" | "transcript">("notes");
  const [audioUrl, setAudioUrl] = useState("");
  const [working, setWorking] = useState("");
  const player = useRef<HTMLAudioElement>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setM(await meetingFetch<Meeting>(user, `/${id}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [user, id]);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (!m || !busy(m)) return;
    const t = window.setTimeout(() => void load(), 2000);
    return () => window.clearTimeout(t);
  }, [m, load]);
  useEffect(() => {
    if (!user || !m?.transcript || audioUrl) return;
    let url = "";
    meetingAudio(user, id).then((u) => { url = u; setAudioUrl(u); }).catch(() => {});
    return () => { if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id, Boolean(m?.transcript)]);

  const patch = async (body: Record<string, unknown>) => {
    if (!user) return;
    try {
      setM(await meetingFetch<Meeting>(user, `/${id}`, { method: "PATCH", body: JSON.stringify(body) }));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const act = async (label: string, fn: () => Promise<void>) => {
    setWorking(label);
    setNotice("");
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking("");
    }
  };

  if (error && !m) return <p className="meetings__error">{error}</p>;
  if (!m || !user) return <p className="tools__empty">불러오는 중…</p>;
  const a = m.analysis;
  const seek = (t: number) => {
    if (!player.current) return;
    player.current.currentTime = t;
    void player.current.play();
  };
  const hasPersonas = m.participants.some((p) => p.personaId);
  const savedCount = Object.keys(m.saved.personas ?? {}).length;

  return (
    <article className="meeting">
      <header className="meeting__head">
        <input className="meeting__title" defaultValue={m.title} aria-label="회의 제목" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== m.title && void patch({ title: e.target.value })} />
        <p className="meeting__meta">
          {m.date} · {KIND_LABEL[m.kind]}
          {m.duration ? ` · ${clock(m.duration)}` : ""}
          {m.participants.length ? ` · ${m.participants.map((p) => p.name).join(", ")}` : ""}
        </p>
      </header>

      {busy(m) && (
        <div className="meeting__progress" role="status">
          <ThinkingOrb design={m.status === "analyzing" ? "solving" : "listening"} diameter={40} label="" />
          <div>
            <strong>{m.status === "queued" ? (m.queuePosition > 1 ? `앞에 ${m.queuePosition - 1}건이 변환 중입니다` : "곧 변환을 시작합니다") : STAGE_TEXT[m.stage] ?? "처리 중입니다…"}</strong>
            {m.status === "transcribing" && <span className="meeting__bar" aria-hidden="true"><span style={{ transform: `scaleX(${m.progress / 100})` }} /></span>}
            <small>창을 닫아도 서버에서 계속 진행됩니다.{m.duration ? ` 회의 길이 ${clock(m.duration)}` : ""}</small>
          </div>
        </div>
      )}
      {m.status === "error" && (
        <div className="meeting__fail">
          <p>{m.error || "변환에 실패했습니다."}</p>
          <button type="button" className="meetings__btn" onClick={() => void act("retry", async () => { await meetingFetch(user, `/${id}/retry`, { method: "POST" }); await load(); })}>다시 변환</button>
        </div>
      )}
      {m.warning && <p className="meetings__note">{m.warning}</p>}
      {m.analysisError && <p className="meetings__error">{m.analysisError}</p>}

      {m.transcript && (
        <>
          <SpeakerMap m={m} onChange={(speakers) => void patch({ speakers })} />

          <div className="meeting__toolbar">
            <div className="tools__chips" role="tablist">
              <button type="button" role="tab" aria-selected={tab === "notes"} className={`tools__chip${tab === "notes" ? " is-active" : ""}`} onClick={() => setTab("notes")}>회의록</button>
              <button type="button" role="tab" aria-selected={tab === "transcript"} className={`tools__chip${tab === "transcript" ? " is-active" : ""}`} onClick={() => setTab("transcript")}>원문 {m.transcript.segments.length}줄</button>
            </div>
            <div className="meeting__actions">
              <button type="button" className="meetings__btn" disabled={busy(m) || Boolean(working)} onClick={() => void act("analyze", async () => { await meetingFetch(user, `/${id}/analyze`, { method: "POST" }); await load(); })}>다시 정리</button>
              <button type="button" className="meetings__btn" disabled={!a} onClick={() => void act("copy", async () => { await navigator.clipboard.writeText(shareText(m)); setNotice("카카오톡에 붙여 넣을 요약을 복사했습니다."); })}>요약 복사</button>
              <button type="button" className="meetings__btn" disabled={!a} onClick={() => window.print()}>PDF</button>
              {hasPersonas && (
                <button type="button" className="tool-form__run meeting__save" disabled={!a || busy(m) || Boolean(working)} onClick={() => void act("personas", async () => {
                  const r = await meetingFetch<{ personas: Record<string, { ok: boolean; name: string; error?: string }>; meeting: Meeting }>(user, `/${id}/save`, { method: "POST", body: JSON.stringify({ personas: true }) });
                  setM(r.meeting);
                  const list = Object.values(r.personas);
                  const failed = list.filter((x) => !x.ok);
                  setNotice(failed.length ? `${list.length - failed.length}명 저장, ${failed.map((x) => `${x.name}(${x.error})`).join(", ")} 실패` : `${list.map((x) => x.name).join(", ")}의 개인 위키에 회의 기억과 관계 기억을 저장했습니다.`);
                })}>
                  {working === "personas" ? "저장 중…" : savedCount ? "임원 위키 다시 저장" : "임원 개인 위키에 저장"}
                </button>
              )}
              {isAdmin && (
                <button type="button" className="meetings__btn" disabled={!a || Boolean(working)} onClick={() => void act("wiki", async () => { const r = await meetingFetch<{ meeting: Meeting }>(user, `/${id}/save`, { method: "POST", body: JSON.stringify({ wiki: true }) }); setM(r.meeting); setNotice("협회 지식 위키 자료로 보냈습니다. 검수 후 문서로 반영됩니다."); })}>
                  {m.saved.wiki ? "협회 위키로 다시 보내기" : "협회 위키로 보내기"}
                </button>
              )}
            </div>
          </div>
          {notice && <p className="meetings__ok" role="status">{notice}</p>}
          {error && <p className="meetings__error" role="alert">{error}</p>}

          {audioUrl && <audio ref={player} className="meeting__player" src={audioUrl} controls preload="metadata" />}

          {tab === "notes" ? (
            a ? <Notes m={m} basePath={basePath} onOpen={onOpen} /> : busy(m) ? null : <p className="meetings__muted">요약·분석이 아직 없습니다. ‘다시 정리’를 눌러 주세요.</p>
          ) : (
            <Transcript m={m} player={player} onSeek={seek} onSave={(body) => patch(body)} />
          )}
        </>
      )}

      <footer className="meeting__foot">
        <button type="button" className="meeting__delete" disabled={Boolean(working)} onClick={() => { if (window.confirm("이 회의의 녹음과 회의록을 지웁니다. 임원 위키에 저장된 기억은 남습니다.")) void act("delete", async () => { await meetingFetch(user, `/${id}`, { method: "DELETE" }); onDeleted(); }); }}>
          녹음·회의록 삭제
        </button>
      </footer>
    </article>
  );
}

function SpeakerMap({ m, onChange }: { m: Meeting; onChange: (s: Record<string, number>) => void }) {
  const labels = Object.keys(m.speakers).sort();
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of m.transcript?.segments ?? []) c[s.speaker] = (c[s.speaker] ?? 0) + 1;
    return c;
  }, [m.transcript]);
  if (!labels.length || !m.participants.length) return null;
  return (
    <section className="meeting-speakers" aria-label="화자 이름">
      <h2 className="meetings__h3">{m.diarized ? "화자 이름 맞추기" : "말한 사람"}</h2>
      {!m.diarized && <p className="meetings__muted">화자 분리 없이 받아 적었습니다. 원문 탭에서 줄마다 말한 사람을 바꿀 수 있습니다.</p>}
      <div className="meeting-speakers__grid">
        {labels.map((l) => (
          <label key={l} className="meeting-speakers__item">
            <span>{speakerLabel(l)} <small>{counts[l] ?? 0}줄</small></span>
            <CustomSelect
              aria-label={`${speakerLabel(l)} 이름`}
              value={String(m.speakers[l] ?? -1)}
              onValueChange={(v) => onChange({ ...m.speakers, [l]: Number(v) })}
              options={[{ value: "-1", label: "미지정" }, ...m.participants.map((p, i) => ({ value: String(i), label: p.name }))]}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

function Transcript({ m, player, onSeek, onSave }: { m: Meeting; player: React.RefObject<HTMLAudioElement | null>; onSeek: (t: number) => void; onSave: (body: { segments: { index: number; speaker: string; text: string }[]; speakers?: Record<string, number> }) => Promise<void> }) {
  const [now, setNow] = useState(-1);
  const [edit, setEdit] = useState<number | null>(null);
  const [draft, setDraft] = useState({ who: "", text: "" });
  const segments = m.transcript?.segments ?? [];
  useEffect(() => {
    const el = player.current;
    if (!el) return;
    const on = () => setNow(el.currentTime);
    el.addEventListener("timeupdate", on);
    return () => el.removeEventListener("timeupdate", on);
  }, [player]);

  // A line is given to a participant ("p:<index>") or left on its unnamed speaker label ("s:<label>").
  const choice = (label: string) => {
    const i = m.speakers[label];
    return i != null && i >= 0 && m.participants[i] ? `p:${i}` : `s:${label}`;
  };
  async function save(index: number) {
    const s = segments[index];
    let speaker = s.speaker;
    let speakers: Record<string, number> | undefined;
    if (draft.who.startsWith("p:")) {
      const p = Number(draft.who.slice(2));
      const existing = Object.entries(m.speakers).find(([, v]) => v === p)?.[0];
      if (existing) speaker = existing;
      else {
        let n = 0;
        while (`SPEAKER_${String(n).padStart(2, "0")}` in m.speakers) n++;
        speaker = `SPEAKER_${String(n).padStart(2, "0")}`;
        speakers = { ...m.speakers, [speaker]: p };
      }
    } else speaker = draft.who.slice(2);
    await onSave({ segments: [{ index, speaker, text: draft.text }], ...(speakers ? { speakers } : {}) });
    setEdit(null);
  }

  return (
    <ol className="transcript">
      {segments.map((s, i) => {
        const playing = now >= s.start && now < s.end;
        return (
          <li key={i} className={`transcript__line${playing ? " is-playing" : ""}`}>
            <button type="button" className="transcript__time" onClick={() => onSeek(s.start)} aria-label={`${clock(s.start)}부터 듣기`}>{clock(s.start)}</button>
            {edit === i ? (
              <div className="transcript__edit">
                <CustomSelect
                  aria-label="말한 사람"
                  value={draft.who}
                  onValueChange={(v) => setDraft((d) => ({ ...d, who: v }))}
                  options={[...m.participants.map((p, k) => ({ value: `p:${k}`, label: p.name })), ...(choice(s.speaker).startsWith("s:") ? [{ value: `s:${s.speaker}`, label: speakerLabel(s.speaker) }] : [])]}
                />
                <textarea value={draft.text} rows={2} onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} />
                <div>
                  <button type="button" className="meetings__btn" onClick={() => setEdit(null)}>취소</button>
                  <button type="button" className="tool-form__run" onClick={() => void save(i)}>저장</button>
                </div>
              </div>
            ) : (
              <button type="button" className="transcript__body" onClick={() => { setEdit(i); setDraft({ who: choice(s.speaker), text: s.text }); }} title="눌러서 말한 사람·내용 고치기">
                <span className="transcript__who">{speakerName(m, s.speaker)}</span>
                <span className="transcript__text">{s.text}</span>
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function List({ items }: { items: string[] }) {
  return items.length ? <ul className="meeting-notes__list">{items.map((t, i) => <li key={i}>{t}</li>)}</ul> : <p className="meetings__muted">없음</p>;
}

function Notes({ m, basePath, onOpen }: { m: Meeting; basePath: string; onOpen: (id: string) => void }) {
  const a = m.analysis!;
  const site = a.site;
  const siteRows: [string, string[]][] = [
    ["고객 요구 변경", site.requirementChanges],
    ["자재·사양 변경", site.specChanges],
    ["추가 비용", site.costs.map((c) => `${c.item}${c.amount ? ` ${c.amount}` : ""}${c.note ? ` — ${c.note}` : ""}`)],
    ["일정 변경", site.scheduleChanges],
    ["하자·민원", site.defects],
  ].filter(([, v]) => (v as string[]).length) as [string, string[]][];
  return (
    <div className="meeting-notes">
      <section>
        <h2 className="meetings__h3">세 줄 요약</h2>
        <List items={a.summary} />
      </section>
      <section>
        <h2 className="meetings__h3">결정 사항</h2>
        <List items={a.decisions.map((d) => d.text + (d.by ? ` (${d.by})` : ""))} />
      </section>
      <section>
        <h2 className="meetings__h3">할 일</h2>
        {a.actions.length ? (
          <table className="meeting-notes__table">
            <thead><tr><th>할 일</th><th>담당</th><th>기한</th></tr></thead>
            <tbody>
              {a.actions.map((x, i) => (
                <tr key={i}><td>{x.task}{x.note && <small>{x.note}</small>}</td><td>{x.owner || "미정"}</td><td>{x.due || "-"}</td></tr>
              ))}
            </tbody>
          </table>
        ) : <p className="meetings__muted">없음</p>}
      </section>
      {a.carryOver.length > 0 && (
        <section>
          <h2 className="meetings__h3">지난 회의 할 일 점검 {m.previousId && <button type="button" className="meeting-notes__link" onClick={() => onOpen(m.previousId)}>지난 회의 보기</button>}</h2>
          <table className="meeting-notes__table">
            <thead><tr><th>할 일</th><th>담당</th><th>상태</th></tr></thead>
            <tbody>{a.carryOver.map((x, i) => <tr key={i}><td>{x.task}{x.note && <small>{x.note}</small>}</td><td>{x.owner || "미정"}</td><td className={`is-${x.status === "완료" ? "ok" : x.status === "미언급" ? "warn" : "info"}`}>{x.status}</td></tr>)}</tbody>
          </table>
        </section>
      )}
      <section>
        <h2 className="meetings__h3">쟁점·위험</h2>
        {a.issues.length ? <ul className="meeting-notes__list">{a.issues.map((x, i) => <li key={i}><span className={`meeting-notes__sev is-${x.severity}`}>{x.severity}</span> {x.text}</li>)}</ul> : <p className="meetings__muted">없음</p>}
      </section>
      {siteRows.length > 0 && (
        <section>
          <h2 className="meetings__h3">현장 체크</h2>
          <dl className="meeting-notes__site">
            {siteRows.map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd><List items={v} /></dd></div>
            ))}
          </dl>
        </section>
      )}
      {a.followUps.length > 0 && (
        <section>
          <h2 className="meetings__h3">이어서 확인할 도구</h2>
          <ul className="meeting-notes__list">
            {a.followUps.map((f, i) => <li key={i}><Link to={`${basePath}/${f.tool}`}>{TOOL_LABEL[f.tool] ?? f.tool}</Link> — {f.reason}</li>)}
          </ul>
        </section>
      )}
      {a.people.length > 0 && (
        <section>
          <h2 className="meetings__h3">참석자별 정리</h2>
          <div className="meeting-notes__people">
            {a.people.map((p) => (
              <div key={p.name} className="meeting-notes__person">
                <strong>{p.name}</strong>
                {p.stance && <p>{p.stance}</p>}
                <List items={p.points} />
                {p.concerns.length > 0 && <p className="meetings__muted">우려: {p.concerns.join(" · ")}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
      {a.relations.length > 0 && (
        <section>
          <h2 className="meetings__h3">오간 관계</h2>
          <ul className="meeting-notes__relations">
            {a.relations.map((r, i) => <li key={i}><strong>{r.from}</strong> → <strong>{r.to}</strong> <span className="meeting-notes__rel">{r.type}</span> {r.note}</li>)}
          </ul>
        </section>
      )}
      {a.nextAgenda.length > 0 && (
        <section>
          <h2 className="meetings__h3">다음 회의 안건</h2>
          <List items={a.nextAgenda} />
        </section>
      )}
    </div>
  );
}

function shareText(m: Meeting) {
  const a = m.analysis!;
  return [
    `[${m.title}] ${m.date}`,
    m.participants.length ? `참석: ${m.participants.map((p) => p.name).join(", ")}` : "",
    "",
    "■ 요약",
    ...a.summary.map((s) => `- ${s}`),
    a.decisions.length ? "\n■ 결정" : "",
    ...a.decisions.map((d) => `- ${d.text}`),
    a.actions.length ? "\n■ 할 일" : "",
    ...a.actions.map((x) => `- ${x.task} (${x.owner || "담당 미정"}${x.due ? `, ${x.due}` : ""})`),
    a.nextAgenda.length ? "\n■ 다음 안건" : "",
    ...a.nextAgenda.map((s) => `- ${s}`),
  ].filter((l, i, arr) => l !== "" || arr[i - 1] !== "").join("\n").trim();
}
