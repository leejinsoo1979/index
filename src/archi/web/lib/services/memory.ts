import { prisma } from '@archi/db';
import { getLlmProviderForWorkspace } from './llm-config';

/**
 * 세션 메모리 (Hermes식 cross-session recall).
 * - summarizeSessionIfNeeded: 대화가 일정량 쌓이면 LLM(또는 추출식)으로 세션을 요약해 저장.
 * - buildSessionMemoryContext: 새 메시지와 관련된 '다른 과거 세션'의 요약을 찾아 컨텍스트로 제공.
 */

type MsgContent = { text?: string };

/** 메시지 텍스트만 뽑아 간단 추출식 요약 (LLM 미설정 시 폴백) */
function extractiveSummary(
  messages: { role: string; content: unknown }[],
): string {
  const userTexts = messages
    .filter((m) => m.role === 'USER')
    .map((m) => (m.content as MsgContent)?.text ?? '')
    .filter(Boolean);
  return userTexts.slice(-5).join(' / ').slice(0, 400) || '(대화 기록)';
}

/** 검색용 토큰화: 공백/구두점 분리, 2자 이상, 중복 제거 */
function tokenize(s: string): string[] {
  return Array.from(
    new Set(
      s
        .toLowerCase()
        .split(/[\s,./!?()[\]{}:;"'`~]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2),
    ),
  );
}

const MIN_MESSAGES = 4; // 최소 2왕복
const NUDGE_EVERY = 4; // 마지막 요약 이후 새 메시지 4개마다 재요약 (periodic nudge)

/**
 * 세션 메시지가 충분히 쌓였고 마지막 요약 이후 새 메시지가 임계치 이상이면 요약을 갱신한다.
 * 실패해도 조용히 넘어간다(메모리는 보조 기능).
 */
export async function summarizeSessionIfNeeded(
  workspaceId: string,
  sessionId: string,
): Promise<void> {
  try {
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!session) return;
    const msgs = session.messages;
    if (msgs.length < MIN_MESSAGES) return;
    if (session.summaryAt) {
      const sinceAt = session.summaryAt;
      const newCount = msgs.filter((m) => m.createdAt > sinceAt).length;
      if (newCount < NUDGE_EVERY) return;
    }

    const transcript = msgs
      .slice(-20)
      .map((m) => `${m.role === 'USER' ? '사용자' : 'AI'}: ${(m.content as MsgContent)?.text ?? ''}`)
      .join('\n')
      .slice(0, 4000);

    let summary = extractiveSummary(msgs);
    const provider = await getLlmProviderForWorkspace(workspaceId);
    if (provider.name !== 'mock') {
      try {
        const res = await provider.generateText({
          system:
            '다음 대화를 한국어 3문장 이내로 요약해라. 사용자가 무엇을 만들고 어떤 결정·요청을 했는지 핵심만. 군더더기 금지.',
          prompt: transcript,
          maxTokens: 220,
        });
        const text = res.text.trim();
        if (text) summary = text.slice(0, 600);
      } catch {
        /* LLM 실패 시 추출식 요약 유지 */
      }
    }

    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { summary, summaryAt: new Date() },
    });
  } catch {
    /* 메모리 요약 실패는 치명적이지 않다 */
  }
}

/**
 * 같은 워크스페이스의 '다른' 세션 요약 중 현재 메시지와 관련된 것을 찾아 컨텍스트 문자열로 만든다.
 * 관련 항목이 없으면 undefined.
 */
export async function buildSessionMemoryContext(
  workspaceId: string,
  currentSessionId: string,
  message: string,
): Promise<string | undefined> {
  try {
    const terms = tokenize(message);
    if (terms.length === 0) return undefined;

    const sessions = await prisma.chatSession.findMany({
      where: {
        id: { not: currentSessionId },
        summary: { not: null },
        document: { project: { workspaceId } },
      },
      orderBy: { summaryAt: 'desc' },
      take: 50,
      select: { title: true, summary: true, document: { select: { title: true } } },
    });
    if (sessions.length === 0) return undefined;

    const scored = sessions
      .map((s) => {
        const hay = `${s.title ?? ''} ${s.summary ?? ''}`.toLowerCase();
        const score = terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
        return { s, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    if (scored.length === 0) return undefined;

    const lines = scored.map(({ s }) => `- [${s.document?.title ?? '문서'}] ${s.summary}`);
    return ['이전 대화 메모리 (관련된 과거 세션 요약 — 참고용):', ...lines].join('\n');
  } catch {
    return undefined;
  }
}
