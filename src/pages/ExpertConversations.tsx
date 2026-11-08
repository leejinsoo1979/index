import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, LoaderCircle, PencilLine, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from '../auth/AuthContext';
import { expertRequest } from '../lib/personas';
import type { ExpertMessage, ExpertProfile } from '../types/personas';
import './Experts.css';
import './ExpertConversations.css';

/**
 * 임원 대시보드 · 대화 기록. The owning executive (or an admin) reads members' conversations
 * with their agent and adds a 보완 to weak answers; the store turns each 보완 into a
 * '답변 보완' page in the personal wiki so similar questions are answered with it next time.
 */
type Correction = { id: string; messageId: string; roomId: string; pageId: string; question: string; content: string; author?: string; createdAt: string; updatedAt: string };
type OwnerRoomSummary = { id: string; title: string; updatedAt: string; member: string; messageCount: number; lastQuestion: string; correctedCount: number };
type OwnerMessage = ExpertMessage & { correction?: Correction };
type OwnerRoom = { id: string; title: string; updatedAt: string; member: string; messages: OwnerMessage[] };

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function ExpertConversations() {
  const { personId = 'interior-show' } = useParams();
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<ExpertProfile | null>(null);
  const [rooms, setRooms] = useState<OwnerRoomSummary[] | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [room, setRoom] = useState<OwnerRoom | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    let active = true;
    setError('');
    Promise.all([expertRequest<ExpertProfile>('settings', { personId }), expertRequest<OwnerRoomSummary[]>('ownerRooms', { personId })])
      .then(([p, list]) => {
        if (!active) return;
        setProfile(p);
        setRooms(list);
        setRoomId((current) => current ?? list[0]?.id ?? null);
      })
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [user, personId]);

  useEffect(() => {
    if (!roomId || !user) return;
    let active = true;
    setRoom(null);
    expertRequest<OwnerRoom>('ownerRoom', { personId, roomId })
      .then((r) => active && setRoom(r))
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [roomId, personId, user]);

  const visibleRooms = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rooms ?? []).filter(
      (r) =>
        (filter === 'all' || (filter === 'done' ? r.correctedCount > 0 : r.correctedCount === 0)) &&
        (!q || `${r.title} ${r.lastQuestion}`.toLowerCase().includes(q)),
    );
  }, [rooms, filter, query]);

  /** Apply a saved/removed correction to the open room and the list counter. */
  function applyCorrection(messageId: string, correction: Correction | undefined) {
    setRoom((r) => (r ? { ...r, messages: r.messages.map((m) => (m.id === messageId ? { ...m, correction } : m)) } : r));
    setRooms((list) =>
      list?.map((r) =>
        r.id === roomId
          ? { ...r, correctedCount: Math.max(0, r.correctedCount + (correction ? (room?.messages.find((m) => m.id === messageId)?.correction ? 0 : 1) : -1)) }
          : r,
      ) ?? null,
    );
  }

  if (loading) return null;
  if (!user)
    return (
      <main className="expert-shell">
        <p className="expert-loading">
          임원 계정으로 로그인해야 대화 기록을 볼 수 있습니다. <Link to={`/mypage?redirect=/experts/${personId}/conversations`}>로그인</Link>
        </p>
      </main>
    );

  return (
    <main className="expert-shell expert-conv">
      <nav className="expert-top">
        <Link className="expert-brand" to="/experts">
          index<span>PEOPLE</span>
        </Link>
        <div>
          <Link to={`/experts/${personId}/settings`}>자료와 말투</Link>
          <Link to={`/experts/${personId}`}>
            <ArrowLeft size={15} />
            개인 채팅방
          </Link>
        </div>
      </nav>

      <header className="expert-conv__head">
        <span className="expert-eyebrow">MY AGENT · CONVERSATIONS</span>
        <h1>{profile ? `${profile.name} 에이전트 대화 기록` : '대화 기록'}</h1>
        <p>회원이 내 에이전트와 나눈 대화입니다. 부족한 답에 보완을 남기면 개인 지식 위키에 바로 저장되고, 다음에 비슷한 질문부터 보완한 내용으로 답합니다.</p>
      </header>

      {error && <p className="expert-chat-error expert-conv__error">{error}</p>}

      <div className="expert-conv__layout">
        <aside className="expert-conv__list">
          <input className="expert-conv__search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="질문 내용으로 찾기" aria-label="대화 검색" />
          <div className="expert-conv__filters" role="group" aria-label="보완 여부">
            {([['all', '전체'], ['open', '보완 전'], ['done', '보완함']] as const).map(([key, label]) => (
              <button key={key} type="button" className={filter === key ? 'is-active' : undefined} aria-pressed={filter === key} onClick={() => setFilter(key)}>
                {label}
              </button>
            ))}
          </div>
          {!rooms && !error && <p className="expert-conv__empty"><LoaderCircle className="expert-spin" size={14} /> 불러오는 중</p>}
          {rooms && visibleRooms.length === 0 && <p className="expert-conv__empty">해당하는 대화가 없습니다.</p>}
          <ul>
            {visibleRooms.map((r) => (
              <li key={r.id}>
                <button type="button" className={r.id === roomId ? 'is-active' : undefined} onClick={() => setRoomId(r.id)}>
                  <strong>{r.lastQuestion || r.title}</strong>
                  <span>
                    {r.member} · 메시지 {r.messageCount}개 · {when(r.updatedAt)}
                    {r.correctedCount > 0 && <em> · 보완 {r.correctedCount}</em>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="expert-conv__room" aria-live="polite">
          {!roomId && rooms && <p className="expert-conv__empty">왼쪽에서 대화를 고르세요.</p>}
          {roomId && !room && !error && <p className="expert-conv__empty"><LoaderCircle className="expert-spin" size={14} /> 대화를 여는 중</p>}
          {room && (
            <>
              <header className="expert-conv__room-head">
                <h2>{room.title}</h2>
                <span>{room.member} · {when(room.updatedAt)}</span>
              </header>
              <ol className="expert-conv__messages">
                {room.messages.map((m, i) =>
                  m.role === 'user' ? (
                    <li key={m.id} className="expert-conv__q">
                      <span>회원 질문</span>
                      <p>{m.content}</p>
                    </li>
                  ) : (
                    <AnswerItem
                      key={m.id}
                      personId={personId}
                      roomId={room.id}
                      message={m}
                      question={room.messages.slice(0, i).reverse().find((x) => x.role === 'user')?.content ?? ''}
                      onChange={(c) => applyCorrection(m.id, c)}
                    />
                  ),
                )}
              </ol>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function AnswerItem({ personId, roomId, message, question, onChange }: { personId: string; roomId: string; message: OwnerMessage; question: string; onChange: (c: Correction | undefined) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.correction?.content ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const correction = message.correction;

  async function save() {
    const content = draft.trim();
    if (!content) return;
    setBusy(true);
    setError('');
    try {
      const { correction: saved } = await expertRequest<{ correction: Correction }>('correctAnswer', { personId, roomId, messageId: message.id, content });
      onChange(saved);
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm('이 보완을 지울까요? 개인 위키의 보완 문서도 더 이상 답변에 쓰이지 않습니다.')) return;
    setBusy(true);
    setError('');
    try {
      await expertRequest('deleteCorrection', { personId, messageId: message.id });
      onChange(undefined);
      setDraft('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="expert-conv__a">
      <span>에이전트 답변 · {when(message.createdAt)}</span>
      {message.state === 'error' ? (
        <p className="expert-message-error">{message.error || '답변을 완료하지 못했습니다.'}</p>
      ) : (
        <div className="expert-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
      )}

      {correction && !editing && (
        <div className="expert-conv__fix">
          <div className="expert-conv__fix-head">
            <strong>내가 보완한 답변</strong>
            <span>{when(correction.updatedAt)} · 개인 위키 반영됨</span>
          </div>
          <div className="expert-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{correction.content}</ReactMarkdown>
          </div>
          <div className="expert-conv__fix-actions">
            <button type="button" onClick={() => { setDraft(correction.content); setEditing(true); }} disabled={busy}>
              <PencilLine size={14} /> 고치기
            </button>
            <button type="button" onClick={remove} disabled={busy}>
              <Trash2 size={14} /> 지우기
            </button>
          </div>
        </div>
      )}

      {!correction && !editing && message.state !== 'pending' && question && (
        <button type="button" className="expert-conv__fix-open" onClick={() => setEditing(true)}>
          <PencilLine size={14} /> 이 답변 보완하기
        </button>
      )}

      {editing && (
        <div className="expert-conv__editor">
          <label>
            <span>보완할 내용</span>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              placeholder={`이 질문에 실제로 이렇게 답하고 싶은 내용을 적어 주세요.\n질문: ${question.slice(0, 80)}`}
              autoFocus
            />
          </label>
          <p>저장하면 '답변 보완' 문서로 개인 지식 위키에 들어가고, 비슷한 질문에 이 내용을 우선 근거로 씁니다. 다른 회원에게도 쓰이는 내용이니 이 회원의 주소·연락처·이름 같은 개인 정보는 빼고, 누구에게나 맞는 설명으로 적어 주세요.</p>
          <div className="expert-conv__fix-actions">
            <button type="button" className="is-primary" onClick={save} disabled={busy || !draft.trim()}>
              {busy ? <LoaderCircle className="expert-spin" size={14} /> : null} 저장하고 위키에 반영
            </button>
            <button type="button" onClick={() => { setEditing(false); setDraft(correction?.content ?? ''); }} disabled={busy}>
              취소
            </button>
          </div>
        </div>
      )}
      {error && <p className="expert-message-error">{error}</p>}
    </li>
  );
}
