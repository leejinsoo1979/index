import { useEffect, useRef, useState } from 'react';
import { knowledgeRequest } from '@/lib/knowledgeServer';
import { knowledgeCaptureError, pendingKnowledgeEvents, flushKnowledgeEvents } from '@/lib/knowledgeCapture';
import { WikiMarkdown } from './WikiMarkdown';
import type { WikiPage } from '../../../wiki/types';

type Job = { id: string; state: string; attempts: number; error: string | null };
type Status = { sources: number; events: number; pages: number; jobs: Job[]; model: string | null; exportError?: string; worker: string };
export function WikiPipeline({ onRefresh }: { onRefresh: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(0);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let active = true, signature = '';
    const poll = async () => {
      try {
        const [next, count] = await Promise.all([knowledgeRequest<Status>('status'), pendingKnowledgeEvents()]);
        if (!active) return;
        const key = JSON.stringify([next.pages, next.jobs.map(j => [j.id, j.state])]);
        if (signature && key !== signature) onRefresh();
        signature = key; setStatus(next); setPending(count); setError(knowledgeCaptureError || next.exportError || '');
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : '지식 서버 연결 실패'); }
    };
    void poll(); const timer = setInterval(() => void poll(), 5000);
    return () => { active = false; clearInterval(timer); };
  }, [onRefresh]);
  const busy = status?.jobs.filter(j => ['queued', 'running'].includes(j.state)).length || 0;
  const failed = status?.jobs.filter(j => j.state === 'failed') || [];
  return <section className="wk-pipeline" aria-label="자동 지식 수집 상태" aria-live="polite">
    <div><strong>{status ? 'INDEX 공용 지식 서버' : '지식 서버 연결 중'}</strong><span>{status ? `원본 ${status.sources} · 활동 기록 ${status.events} · 처리 대기 ${busy}` : '원본과 이력을 서버에 보존합니다.'}{pending ? ` · 전송 대기 ${pending}` : ''}</span><button className="wk-button" onClick={() => setExpanded(v => !v)} aria-expanded={expanded}>처리 내역{failed.length ? ` (${failed.length}건 실패)` : ''}</button></div>
    {error && <p role="alert">{error}</p>}
    {expanded && <div className="wk-pipeline-details"><p>AI: {status?.model || '연결 확인 필요'} · 새 자료는 위키 초안으로 정리되며, 검수 후 공개 지식으로 사용됩니다.</p>{pending > 0 && <button className="wk-button" onClick={() => void flushKnowledgeEvents()}>활동 기록 다시 전송</button>}{status?.jobs.slice(0, 12).map(job => <div key={job.id}><span>{({ queued: '대기', running: '정리 중', done: '완료', failed: '확인 필요' } as Record<string, string>)[job.state]} · 시도 {job.attempts}회{job.error ? ` · ${job.error}` : ''}</span>{['failed', 'queued'].includes(job.state) && <button className="wk-button" onClick={() => void knowledgeRequest(`jobs/${job.id}/retry`, { method: 'POST', body: '{}' }).then(onRefresh).catch(e => setError(e.message))}>재시도</button>}</div>)}</div>}
  </section>;
}
type Citation = { number: number; id: string; title: string; version: number; status: string };
type ChatTurn = { id: string; role: 'user' | 'assistant'; text: string; citations?: Citation[]; error?: boolean };

const SUGGESTED_QUESTIONS = [
  '발코니 확장할 때 곰팡이와 결로는 어떻게 막나요?',
  '붙박이장 비용을 줄이는 방법이 있나요?',
  '무몰딩 인테리어의 장단점은 무엇인가요?',
  '화장실만 공사할 때 순서는 어떻게 되나요?',
];

/**
 * INDEX AI chat over the wiki. The knowledge server answers one question at a time
 * (/api/wiki/query), so the conversation is kept on screen and the previous question is
 * sent along as context for follow-ups.
 */
export function WikiAssistant({ pages, onNavigate, onClose }: { pages: WikiPage[]; onNavigate: (id: string) => void; onClose?: () => void }) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const previous = [...turns].reverse().find(t => t.role === 'user')?.text;
    const payload = (previous ? `이전 질문: ${previous}\n질문: ${question}` : question).slice(0, 2000);
    setTurns(current => [...current, { id: crypto.randomUUID(), role: 'user', text: question }]);
    setInput('');
    setBusy(true);
    try {
      const result = await knowledgeRequest<{ answer: string; citations: Citation[] }>('query', { method: 'POST', body: JSON.stringify({ question: payload, includeDrafts }) });
      setTurns(current => [...current, { id: crypto.randomUUID(), role: 'assistant', text: result.answer, citations: result.citations }]);
    } catch (e) {
      setTurns(current => [...current, { id: crypto.randomUUID(), role: 'assistant', text: e instanceof Error ? e.message : '답변을 가져오지 못했습니다.', error: true }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return <section className="wk-chat" aria-label="INDEX AI 위키 대화">
    <header className="wk-chat-header">
      <div><strong>INDEX AI</strong><span>위키 문서를 근거로 답합니다</span></div>
      <div className="wk-chat-header-actions">
        {turns.length > 0 && <button type="button" className="wk-button wk-button--subtle" onClick={() => setTurns([])} disabled={busy}>새 대화</button>}
        {onClose && <button type="button" className="wk-icon" aria-label="대화 닫기" onClick={onClose}>✕</button>}
      </div>
    </header>
    <div className="wk-chat-list" ref={listRef}>
      {turns.length === 0 && <div className="wk-chat-empty">
        <h3>무엇이 궁금하신가요?</h3>
        <p>INDEX 위키에 쌓인 문서를 찾아 출처와 함께 답해 드립니다.</p>
        <div className="wk-chat-suggestions">{SUGGESTED_QUESTIONS.map(q => <button type="button" key={q} onClick={() => void ask(q)}>{q}</button>)}</div>
      </div>}
      {turns.map(turn => turn.role === 'user'
        ? <div key={turn.id} className="wk-chat-turn wk-chat-turn--user"><p>{turn.text}</p></div>
        : <div key={turn.id} className={'wk-chat-turn wk-chat-turn--ai' + (turn.error ? ' is-error' : '')}>
            {turn.error ? <p>{turn.text}</p> : <div className="wk-prose"><WikiMarkdown content={turn.text} pages={pages} onNavigate={onNavigate} onCreate={() => {}} /></div>}
            {turn.citations && turn.citations.length > 0 && <div className="wk-chat-sources"><span>출처</span>{turn.citations.map(c => <button type="button" key={c.id} onClick={() => onNavigate(c.id)} title={c.status !== 'published' ? '검수 전 문서' : undefined}>{c.number}. {c.title}{c.status !== 'published' ? ' · 검수 전' : ''}</button>)}</div>}
          </div>)}
      {busy && <div className="wk-chat-turn wk-chat-turn--ai"><span className="wk-chat-typing" aria-label="답변 작성 중"><i /><i /><i /></span></div>}
    </div>
    <form className="wk-chat-composer" onSubmit={event => { event.preventDefault(); void ask(input); }}>
      <textarea ref={inputRef} value={input} rows={1} maxLength={1800} placeholder="INDEX AI에게 질문하기" aria-label="질문 입력"
        onChange={event => setInput(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(input); } }} />
      <button type="submit" className="wk-chat-send" disabled={busy || !input.trim()} aria-label="보내기">↑</button>
      <label className="wk-chat-option"><input type="checkbox" checked={includeDrafts} onChange={e => setIncludeDrafts(e.target.checked)} />검수 전 문서도 참고</label>
    </form>
  </section>;
}

