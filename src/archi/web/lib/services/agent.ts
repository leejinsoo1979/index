import { prisma, type Prisma } from '@archi/db';
import {
  agentActionSchema,
  MockSearchProvider,
  planAgentResponse,
  requiresCitation,
  routeAgentRole,
  type AgentActionInput,
  type AgentPlan,
  type AgentRole,
  type LlmProvider,
  type SearchResult,
} from '@archi/ai';
import { blockInputSchema } from '@archi/editor';
import { getLlmProviderForWorkspace } from './llm-config';
import { buildSessionMemoryContext, summarizeSessionIfNeeded } from './memory';
import { sanitizeUntrustedText } from '@archi/security';
import { AppError, Capabilities, ErrorCodes } from '@archi/shared';
import { z } from 'zod';
import { requireDocumentCapability } from '../authz';
import { writeAuditLog } from '../audit';
import { addBlock, updateBlock } from './blocks';

type CitationDraft = {
  title: string;
  url?: string;
  publisher?: string;
  quote?: string;
  sourceType?: string;
  retrievedAt?: string;
};

export const chatRequestSchema = z.object({
  chatSessionId: z.string().optional(),
  documentId: z.string().min(1),
  selectedBlockIds: z.array(z.string()).default([]),
  message: z.string().min(1, '메시지를 입력해 주세요.').max(4000),
});

/**
 * AI 채팅 한 턴 처리:
 * 사용자 메시지 저장 → mock LLM 계획 → assistant 메시지 + PROPOSED 액션 저장
 */
export async function chat(userId: string, input: z.infer<typeof chatRequestSchema>) {
  const { workspaceId } = await requireDocumentCapability(
    userId,
    input.documentId,
    Capabilities.USE_AI,
  );

  const document = await prisma.document.findUniqueOrThrow({
    where: { id: input.documentId },
    select: { id: true, title: true },
  });

  const session = input.chatSessionId
    ? await prisma.chatSession.findFirst({
        where: { id: input.chatSessionId, documentId: input.documentId },
      })
    : null;
  const chatSession =
    session ??
    (await prisma.chatSession.create({
      data: { documentId: input.documentId, title: input.message.slice(0, 50) },
    }));

  await prisma.chatMessage.create({
    data: {
      chatSessionId: chatSession.id,
      userId,
      role: 'USER',
      content: { text: input.message, selectedBlockIds: input.selectedBlockIds },
    },
  });

  // 문서 전체 블록을 불러와 선택 블록 + 형제 + 아웃라인 컨텍스트를 구성한다 (AIContext 강화).
  const allBlocks = await prisma.documentBlock.findMany({
    where: { documentId: input.documentId },
    orderBy: { sortOrder: 'asc' },
  });
  const blockSummary = (b: { type: string; content: unknown }): string => {
    const c = (b.content ?? {}) as Record<string, unknown>;
    const raw = (c.text ?? c.title ?? c.law ?? c.caption ?? c.expression ?? '') as unknown;
    return String(typeof raw === 'string' ? raw : '').replace(/\s+/g, ' ').trim();
  };

  const selectedBlockId = input.selectedBlockIds[0];
  const selectedIdx = allBlocks.findIndex((b) => b.id === selectedBlockId);
  const selectedBlockText =
    selectedIdx >= 0 ? blockSummary(allBlocks[selectedIdx]!) || undefined : undefined;

  // 문서 아웃라인: 블록 순서 + 타입 + 요약 (선택 블록 표시)
  const documentOutline =
    allBlocks.length > 0
      ? allBlocks
          .map((b, i) => {
            const mark = i === selectedIdx ? '  ← 선택됨' : '';
            return `${i + 1}. [${b.type}] ${blockSummary(b).slice(0, 40)}${mark}`;
          })
          .join('\n')
      : undefined;

  // 선택 블록 주변 형제 블록 내용
  let siblingText: string | undefined;
  if (selectedIdx >= 0) {
    const parts: string[] = [];
    const prev = allBlocks[selectedIdx - 1];
    const next = allBlocks[selectedIdx + 1];
    if (prev) parts.push(`이전 블록[${prev.type}]: ${blockSummary(prev).slice(0, 80)}`);
    if (next) parts.push(`다음 블록[${next.type}]: ${blockSummary(next).slice(0, 80)}`);
    siblingText = parts.length > 0 ? parts.join('\n') : undefined;
  }

  // 역할별 에이전트 라우팅 (콘텐츠/법규/시공/이미지/지식/PM)
  const agentRole = routeAgentRole(input.message);

  // 법규/공법 질문이면 출처 검색을 먼저 수행한다 (citation 없는 확답 금지)
  let searchResults: SearchResult[] | undefined;
  if (requiresCitation(input.message)) {
    const provider = new MockSearchProvider();
    const raw = await provider.search(input.message, { limit: 5 });
    // 외부 검색 결과는 신뢰할 수 없는 입력 — LLM 컨텍스트 투입 전 injection 필터 적용
    searchResults = raw.map((r) => ({
      ...r,
      title: sanitizeUntrustedText(r.title),
      snippet: sanitizeUntrustedText(r.snippet),
    }));
  }

  let plan = planAgentResponse({
    message: input.message,
    documentId: document.id,
    documentTitle: document.title,
    selectedBlockId,
    selectedBlockText,
    searchResults,
  });

  // RAG: 사용자가 승인한 지식 그래프에서 메시지와 관련된 노드/관계를 컨텍스트로 주입한다.
  const knowledgeContext = await buildKnowledgeContext(workspaceId, input.message);
  // 세션 메모리: 같은 워크스페이스의 관련 과거 세션 요약을 회상해 컨텍스트로 주입한다(Hermes식).
  const sessionMemory = await buildSessionMemoryContext(
    workspaceId,
    chatSession.id,
    input.message,
  );

  // 워크스페이스에 실제 LLM API가 등록되어 있으면 LLM 기반 초안 생성 시도.
  // 법규/공법 질문은 citation 강제 규칙 때문에 항상 검색 기반 플로우를 따른다.
  if (!requiresCitation(input.message)) {
    const provider = await getLlmProviderForWorkspace(workspaceId);
    if (provider.name !== 'mock') {
      const llmPlan = await planWithLlm(provider, {
        message: input.message,
        documentId: document.id,
        documentTitle: document.title,
        selectedBlockId,
        selectedBlockText,
        siblingText,
        documentOutline,
        knowledgeContext,
        sessionMemory,
        role: agentRole,
      });
      // 실제 LLM이 등록됐으면 결과를 그대로 쓴다. 실패해도 mock 문구로 숨기지 않고
      // 실패 사유를 사용자에게 보여준다 (조용한 mock 폴백 → 앵무새 현상 방지).
      plan = llmPlan.ok
        ? llmPlan.plan
        : {
            reply: `⚠️ 모델 호출에 실패했습니다 (${provider.name}). ${llmPlan.error}\n\n설정에서 모델을 확인하거나 잠시 후 다시 시도해 주세요.`,
            actions: [],
          };
    }
  }

  // 액션은 저장 전 서버에서 zod 재검증한다 (allowlist + schema)
  const validActions = plan.actions.map((a) => agentActionSchema.parse(a));

  const assistantMessage = await prisma.chatMessage.create({
    data: {
      chatSessionId: chatSession.id,
      role: 'ASSISTANT',
      content: { text: plan.reply, agentRole: agentRole.key },
    },
  });

  const actions = await Promise.all(
    validActions.map((action) =>
      prisma.agentAction.create({
        data: {
          chatSessionId: chatSession.id,
          documentId: input.documentId,
          type: action.action_type,
          payload: action as unknown as Prisma.InputJsonValue,
          riskLevel: action.risk_level,
          requiresApproval: action.requires_approval,
        },
      }),
    ),
  );

  await writeAuditLog({
    actorId: userId,
    action: 'agent.chat',
    targetType: 'ChatSession',
    targetId: chatSession.id,
    after: { message: input.message, proposedActions: actions.map((a) => a.id) },
  });

  // 세션 메모리 갱신: 대화가 쌓이면 요약을 만들어 이후 세션 간 회상에 쓴다(내부에서 임계치/실패 처리).
  await summarizeSessionIfNeeded(workspaceId, chatSession.id);

  return {
    chatSessionId: chatSession.id,
    reply: { id: assistantMessage.id, text: plan.reply },
    agentRole: { key: agentRole.key, label: agentRole.label },
    sources: searchResults ?? [],
    actions: actions.map((a) => ({
      id: a.id,
      type: a.type,
      payload: a.payload,
      riskLevel: a.riskLevel,
      requiresApproval: a.requiresApproval,
      status: a.status,
    })),
  };
}

/** 액션 승인 + 실행. 실행 전후 감사 로그를 남긴다 */
export async function approveAction(userId: string, actionId: string) {
  const action = await prisma.agentAction.findUnique({ where: { id: actionId } });
  if (!action || !action.documentId) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: 'AI 액션을 찾을 수 없습니다.' });
  }
  if (action.status !== 'PROPOSED') {
    throw new AppError(ErrorCodes.CONFLICT, {
      message: '이미 처리된 액션입니다.',
      details: { status: action.status },
    });
  }
  await requireDocumentCapability(userId, action.documentId, Capabilities.EDIT_DOCUMENTS);

  const parsed = agentActionSchema.safeParse(action.payload);
  if (!parsed.success) {
    await prisma.agentAction.update({ where: { id: actionId }, data: { status: 'FAILED' } });
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: '저장된 액션이 유효하지 않아 실행을 거부했습니다.',
      details: parsed.error.issues,
    });
  }

  await writeAuditLog({
    actorId: userId,
    action: 'agent_action.approve',
    targetType: 'AgentAction',
    targetId: actionId,
    before: { status: action.status },
  });

  try {
    const result = await executeAction(userId, parsed.data);
    const executed = await prisma.agentAction.update({
      where: { id: actionId },
      data: { status: 'EXECUTED', executedAt: new Date() },
    });
    await writeAuditLog({
      actorId: userId,
      action: 'agent_action.execute',
      targetType: 'AgentAction',
      targetId: actionId,
      after: { status: executed.status, result },
    });

    // 실행된 문서에서 온톨로지 후보 자동 추출 — 사용자의 실제 작업이 지식 그래프에 누적된다.
    // 실패해도 액션 실행 자체는 성공으로 유지한다.
    try {
      const { extractFromDocument } = await import('./ontology');
      await extractFromDocument(userId, action.documentId);
    } catch (error) {
      console.warn('[agent] 온톨로지 자동 추출 실패:', error);
    }

    return { status: executed.status, result };
  } catch (error) {
    await prisma.agentAction.update({ where: { id: actionId }, data: { status: 'FAILED' } });
    await writeAuditLog({
      actorId: userId,
      action: 'agent_action.fail',
      targetType: 'AgentAction',
      targetId: actionId,
      after: { error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}

export async function rejectAction(userId: string, actionId: string) {
  const action = await prisma.agentAction.findUnique({ where: { id: actionId } });
  if (!action || !action.documentId) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: 'AI 액션을 찾을 수 없습니다.' });
  }
  if (action.status !== 'PROPOSED') {
    throw new AppError(ErrorCodes.CONFLICT, { message: '이미 처리된 액션입니다.' });
  }
  await requireDocumentCapability(userId, action.documentId, Capabilities.USE_AI);
  const rejected = await prisma.agentAction.update({
    where: { id: actionId },
    data: { status: 'REJECTED' },
  });
  await writeAuditLog({
    actorId: userId,
    action: 'agent_action.reject',
    targetType: 'AgentAction',
    targetId: actionId,
    after: { status: rejected.status },
  });
  return { status: rejected.status };
}

const llmPlanResponseSchema = z.object({
  reply: z.string().min(1),
  blocks: z.array(blockInputSchema).default([]),
  updated_text: z.string().optional(),
});

/**
 * RAG: 워크스페이스의 '승인된' 온톨로지 노드 중 메시지에 언급된 것과 그 관계를 컨텍스트 문자열로 만든다.
 * 승인된 지식만 사용한다(후보/반려 제외). 관련 항목이 없으면 undefined.
 */
export async function buildKnowledgeContext(
  workspaceId: string,
  message: string,
): Promise<string | undefined> {
  try {
    const approved = await prisma.ontologyNode.findMany({
      where: { workspaceId, status: 'APPROVED' },
      take: 200,
    });
    if (approved.length === 0) return undefined;
    const msgLower = message.toLowerCase();
    const relevant = approved.filter(
      (n) => n.label && msgLower.includes(n.label.toLowerCase()),
    );
    if (relevant.length === 0) return undefined;

    const ids = relevant.map((n) => n.id);
    const edges = await prisma.ontologyEdge.findMany({
      where: {
        workspaceId,
        status: 'APPROVED',
        OR: [{ sourceNodeId: { in: ids } }, { targetNodeId: { in: ids } }],
      },
      take: 40,
    });
    const labelById = new Map(approved.map((n) => [n.id, n.label]));
    const nodeLines = relevant
      .slice(0, 8)
      .map((n) => `- ${n.label}${n.description ? `: ${n.description}` : ''}`);
    const edgeLines = edges
      .map((e) => {
        const s = labelById.get(e.sourceNodeId);
        const t = labelById.get(e.targetNodeId);
        return s && t ? `- ${s} →(${e.relationType}) ${t}` : null;
      })
      .filter((x): x is string => x !== null);
    return [
      '관련 지식 (사용자가 승인한 지식 그래프 — 우선 활용하고 사실과 다르면 무시):',
      ...nodeLines,
      ...(edgeLines.length > 0 ? ['관계:', ...edgeLines] : []),
    ].join('\n');
  } catch {
    return undefined; // 지식 주입 실패는 치명적이지 않다
  }
}

/**
 * 실제 LLM으로 초안/수정안 생성.
 * 응답은 JSON으로 강제하고 블록은 zod로 재검증한다. 실패 시 null을 반환해 mock 플랜으로 폴백.
 */
type PlanResult = { ok: true; plan: AgentPlan } | { ok: false; error: string };

async function planWithLlm(
  provider: LlmProvider,
  args: {
    message: string;
    documentId: string;
    documentTitle?: string;
    selectedBlockId?: string;
    selectedBlockText?: string;
    siblingText?: string;
    documentOutline?: string;
    knowledgeContext?: string;
    sessionMemory?: string;
    role?: AgentRole;
  },
): Promise<PlanResult> {
  const system = [
    args.role?.persona ?? '너는 건축·인테리어 전문 콘텐츠를 작성하는 ARCHI Agent Studio의 AI 에이전트다.',
    '반드시 JSON 객체 하나만 출력해라. 마크다운 코드펜스나 설명 텍스트를 붙이지 마라.',
    '최상위 형식: {"reply": "...", "blocks": [...], "updated_text": "..."}',
    'reply는 사용자에게 보여줄 짧은 한국어 안내 문장 1~2개다. 절대 reply에 JSON이나 블록 내용을 넣지 마라.',
    '각 block은 반드시 {"type": "<타입>", "content": {...}} 형태다. 절대 {"heading": {...}} 처럼 타입을 키로 쓰지 마라.',
    '허용 타입과 content:',
    '- {"type":"heading","content":{"level":1,"text":"제목"}}',
    '- {"type":"paragraph","content":{"text":"본문"}}',
    '- {"type":"checklist","content":{"title":"제목","items":[{"text":"항목","checked":false}]}}',
    '- {"type":"cta","content":{"text":"문구","buttonLabel":"버튼","url":"https://..."}}',
    '- {"type":"chart","content":{"chartType":"bar","title":"제목","labels":["a","b"],"series":[{"name":"이름","values":[1,2]}]}}',
    '- {"type":"table","content":{"title":"제목","headers":["열1","열2"],"rows":[["a","b"]]}}',
    '- {"type":"formula","content":{"title":"열관류율","expression":"U = 1 / Rtotal","variables":[{"symbol":"U","meaning":"열관류율","unit":"W/m²K"}],"result":"0.24"}}',
    '- {"type":"qna","content":{"title":"현장 Q&A","items":[{"question":"질문","answer":"답변","basis":"근거"}]}}',
    '- {"type":"law_reference","content":{"law":"건축물의 에너지절약설계기준","article":"제2조","clause":"1항","summary":"조문 요약","link":"https://..."}}',
    '- {"type":"callout","content":{"variant":"warning","title":"주의","text":"내용"}} (variant: info|tip|warning|danger)',
    '- {"type":"quote","content":{"text":"인용문","attribution":"출처"}}',
    '- {"type":"code","content":{"language":"ts","code":"const a = 1"}}',
    '- {"type":"cost_table","content":{"title":"견적","currency":"원","items":[{"name":"항목","spec":"규격","quantity":1,"unit":"식","unitPrice":100000}]}}',
    '- {"type":"construction_detail","content":{"title":"상세","imagePrompt":"상세도 묘사","steps":["1단계","2단계"],"notes":"주의사항"}}',
    '- {"type":"container","content":{"title":"섹션 제목"}} (관련 블록을 묶는 그룹 머리)',
    '- {"type":"rich_text","content":{"text":"마크다운 본문","format":"markdown"}}',
    '- {"type":"blog_section","content":{"heading":"섹션 제목","body":"본문"}}',
    '- {"type":"technical_section","content":{"heading":"제목","body":"본문","references":["참고1"]}}',
    '- {"type":"before_after","content":{"title":"시공 비교","before":{"prompt":"시공 전","label":"시공 전"},"after":{"prompt":"시공 후","label":"시공 후"}}}',
    '- {"type":"image_gallery","content":{"title":"갤러리","images":[{"prompt":"이미지1","caption":"캡션"}]}}',
    '- {"type":"risk_warning","content":{"severity":"high","title":"주의","risk":"위험 요소","mitigation":"대응 방안"}}',
    '- {"type":"schedule","content":{"title":"공정표","items":[{"task":"철거","start":"D+0","end":"D+2"}]}}',
    '- {"type":"material_spec","content":{"material":"단열재","specs":[{"key":"두께","value":"100mm"}]}}',
    '- {"type":"construction_standard","content":{"title":"기준","standardCode":"KS","clauses":[{"no":"1","text":"조항"}]}}',
    '- {"type":"diagram","content":{"title":"흐름도","source":"A -> B -> C"}}',
    '- {"type":"image","content":{"prompt":"생성할 이미지 묘사","caption":"캡션"}}',
    '법규/공법 답변에는 반드시 law_reference 또는 source_reference 블록으로 근거를 포함해라.',
    '이미지가 필요하면 image 블록을 넣어라(prompt만 주면 실제 이미지가 자동 생성된다).',
    '삽입할 내용이 없으면 blocks는 [] 로 둔다.',
    '선택한 블록 수정 요청이면 updated_text에 수정안 텍스트만 넣고 blocks는 [] 로 둔다.',
  ].join('\n');

  const prompt = [
    `문서 제목: ${args.documentTitle ?? '(없음)'}`,
    args.documentOutline ? `문서 구조(아웃라인):\n${args.documentOutline}` : '',
    args.sessionMemory ?? '',
    args.knowledgeContext ?? '',
    args.selectedBlockText ? `선택된 블록 내용: ${args.selectedBlockText}` : '',
    args.siblingText ? `선택 블록 주변 맥락:\n${args.siblingText}` : '',
    '위 문서 구조와 맥락에 어울리도록, 중복되지 않게 작성해라.',
    `사용자 요청: ${args.message}`,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const result = await provider.generateText({ system, prompt, maxTokens: 3000 });
    let parsed: z.infer<typeof llmPlanResponseSchema>;
    try {
      const raw = JSON.parse(extractJsonObject(result.text)) as Record<string, unknown>;
      // 모델이 블록을 {heading:{...}} 형태로 줘도 {type,content}로 정규화한다
      if (Array.isArray(raw.blocks)) {
        raw.blocks = (raw.blocks as unknown[]).map(normalizeBlock).filter(Boolean);
      }
      parsed = llmPlanResponseSchema.parse(raw);
    } catch {
      // 그래도 실패하면 reply만 뽑아서 보여준다 (JSON 전체를 토하지 않게)
      const replyOnly = extractReplyText(result.text);
      return { ok: true, plan: { reply: replyOnly, actions: [] } };
    }

    const actions: AgentActionInput[] = [];
    if (args.selectedBlockId && parsed.updated_text) {
      actions.push({
        action_type: 'update_block',
        target: { documentId: args.documentId, blockId: args.selectedBlockId },
        payload: { content: { text: parsed.updated_text } },
        requires_approval: true,
        risk_level: 'low',
      });
    } else if (parsed.blocks.length > 0) {
      actions.push({
        action_type: 'insert_blocks',
        target: { documentId: args.documentId },
        payload: { blocks: parsed.blocks },
        requires_approval: true,
        risk_level: 'low',
      });
    }
    return { ok: true, plan: { reply: parsed.reply, actions } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[agent] LLM 호출 실패:', message);
    return { ok: false, error: message.slice(0, 300) };
  }
}

const KNOWN_BLOCK_TYPES = [
  'heading',
  'paragraph',
  'checklist',
  'cta',
  'chart',
  'image',
  'table',
  'formula',
  'doc_meta',
  'qna',
  'source_reference',
];

/** 모델이 {heading:{...}} 또는 {type,content} 어느 형태로 줘도 {type,content}로 정규화 */
function normalizeBlock(block: unknown): unknown {
  if (!block || typeof block !== 'object') return null;
  const b = block as Record<string, unknown>;
  if (typeof b.type === 'string' && b.content && typeof b.content === 'object') {
    return { type: b.type, content: b.content };
  }
  // {heading: {...}} 형태: 알려진 타입 키 하나를 찾아 변환
  const key = Object.keys(b).find((k) => KNOWN_BLOCK_TYPES.includes(k));
  if (key && b[key] && typeof b[key] === 'object') {
    return { type: key, content: b[key] };
  }
  return null;
}

/** 파싱 실패 시 JSON 전체 대신 reply 값만 추출 */
function extractReplyText(text: string): string {
  const m = text.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (m?.[1]) {
    try {
      return JSON.parse(`"${m[1]}"`);
    } catch {
      return m[1];
    }
  }
  // reply도 못 찾으면 JSON처럼 보이지 않는 텍스트만 반환
  const trimmed = text.trim();
  return trimmed.startsWith('{') ? '응답을 생성했습니다.' : trimmed || '(빈 응답)';
}

function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('LLM 응답에서 JSON을 찾지 못했습니다.');
  return candidate.slice(start, end + 1);
}

async function executeAction(userId: string, action: AgentActionInput) {
  const warnings: string[] = [];
  switch (action.action_type) {
    case 'insert_blocks': {
      const inserted = [];
      let afterBlockId = action.target.afterBlockId;
      // 이미지 블록 생성을 위해 문서의 projectId를 미리 조회
      const doc = await prisma.document.findUnique({
        where: { id: action.target.documentId },
        select: { projectId: true },
      });
      for (const block of action.payload.blocks) {
        const created = await addBlock(userId, action.target.documentId, {
          afterBlockId,
          block,
        });

        // 이미지 블록에 생성 프롬프트가 있고 url이 없으면 실제 이미지를 생성해 채운다
        const imgContent = block.content as { prompt?: string; url?: string; caption?: string };
        if (block.type === 'image' && imgContent.prompt && !imgContent.url && doc?.projectId) {
          try {
            const { generateImage } = await import('./images');
            const gen = await generateImage(userId, {
              projectId: doc.projectId,
              prompt: imgContent.prompt,
              count: 1,
            });
            const version = gen.versions[0];
            if (version) {
              await prisma.documentBlock.update({
                where: { id: created.id },
                data: {
                  content: {
                    imageAssetId: gen.imageAssetId,
                    versionId: version.id,
                    url: version.url,
                    caption: imgContent.caption ?? imgContent.prompt.slice(0, 80),
                  } as Prisma.InputJsonValue,
                },
              });
              // provider 미설정 → mock 플레이스홀더가 삽입됐음을 조용히 넘기지 않고 알린다.
              if (version.provider === 'mock') {
                warnings.push(
                  `이미지 provider가 설정되지 않아 "${imgContent.prompt.slice(0, 30)}…"는 임시 플레이스홀더로 삽입됐습니다. 설정 → LLM에서 OpenAI 키를 등록하면 실제 이미지가 생성됩니다.`,
                );
              }
            }
          } catch (error) {
            // 조용히 삼키지 않고 사용자에게 실패 사유를 알린다 (CLAUDE.md: AI 도구 호출 silent fail 금지).
            const msg = error instanceof Error ? error.message : String(error);
            warnings.push(`이미지 생성 실패 ("${imgContent.prompt.slice(0, 30)}…"): ${msg}`);
          }
        }
        // 출처 블록이면 citation draft를 실제 Citation 레코드로 생성한다
        const drafts = (block.metadata as { citationDrafts?: CitationDraft[] } | undefined)
          ?.citationDrafts;
        if (block.type === 'source_reference' && Array.isArray(drafts) && drafts.length > 0) {
          const citations = await Promise.all(
            drafts.map((d) =>
              prisma.citation.create({
                data: {
                  blockId: created.id,
                  title: d.title,
                  url: d.url,
                  publisher: d.publisher,
                  quote: d.quote,
                  sourceType: d.sourceType,
                  retrievedAt: d.retrievedAt ? new Date(d.retrievedAt) : null,
                },
              }),
            ),
          );
          const content = created.content as Record<string, unknown>;
          await prisma.documentBlock.update({
            where: { id: created.id },
            data: {
              content: {
                ...content,
                citations: citations.map((c) => c.id),
              } as Prisma.InputJsonValue,
            },
          });
        }
        inserted.push(created.id);
        afterBlockId = created.id;
      }
      return { insertedBlockIds: inserted, warnings };
    }
    case 'update_block':
    case 'replace_block_content': {
      const updated = await updateBlock(userId, action.target.blockId, {
        content: action.payload.content,
      });
      return { updatedBlockId: updated.id, warnings };
    }
    case 'append_to_block': {
      const block = await prisma.documentBlock.findUnique({
        where: { id: action.target.blockId },
      });
      if (!block) {
        throw new AppError(ErrorCodes.NOT_FOUND, { message: '이어쓸 블록을 찾을 수 없습니다.' });
      }
      const content = block.content as Record<string, unknown>;
      // 텍스트를 담는 필드를 찾아 이어쓴다 (paragraph.text, code.code, summary 등)
      const field = ['text', 'code', 'summary'].find((f) => typeof content[f] === 'string');
      if (!field) {
        throw new AppError(ErrorCodes.VALIDATION_FAILED, {
          message: '이 블록 타입에는 이어쓸 텍스트 필드가 없습니다.',
        });
      }
      const existing = String(content[field] ?? '');
      const nextContent = {
        ...content,
        [field]: existing ? `${existing}\n${action.payload.text}` : action.payload.text,
      };
      const updated = await updateBlock(userId, action.target.blockId, { content: nextContent });
      return { updatedBlockId: updated.id, warnings };
    }
    case 'create_container': {
      // 컨테이너 블록 생성 후 자식 블록들을 parentId로 연결하고 컨테이너 바로 뒤에 배치
      const container = await addBlock(userId, action.target.documentId, {
        afterBlockId: action.target.afterBlockId,
        block: { type: 'container', content: { title: action.payload.title } },
      });
      const childBlockIds: string[] = [];
      let after = container.id;
      for (const child of action.payload.children) {
        const created = await addBlock(userId, action.target.documentId, {
          afterBlockId: after,
          parentId: container.id,
          block: child,
        });
        childBlockIds.push(created.id);
        after = created.id;
      }
      return { containerId: container.id, childBlockIds, warnings };
    }
    case 'insert_block_before': {
      const inserted: string[] = [];
      let afterId: string | undefined;
      let first = true;
      for (const block of action.payload.blocks) {
        const created = first
          ? await addBlock(userId, action.target.documentId, {
              beforeBlockId: action.target.beforeBlockId,
              block,
            })
          : await addBlock(userId, action.target.documentId, { afterBlockId: afterId, block });
        inserted.push(created.id);
        afterId = created.id;
        first = false;
      }
      return { insertedBlockIds: inserted, warnings };
    }
    case 'create_child_block': {
      const created = await addBlock(userId, action.target.documentId, {
        parentId: action.target.parentId,
        afterBlockId: action.target.afterBlockId,
        block: action.payload.block,
      });
      return { insertedBlockIds: [created.id], warnings };
    }
    case 'convert_block_type': {
      // capability는 approveAction에서 EDIT_DOCUMENTS로 이미 확인됨. 새 타입/내용은 스키마로 검증됨.
      const updated = await prisma.documentBlock.update({
        where: { id: action.target.blockId },
        data: {
          type: action.payload.block.type,
          content: action.payload.block.content as Prisma.InputJsonValue,
        },
      });
      return { updatedBlockId: updated.id, warnings };
    }
    case 'update_block_title': {
      const block = await prisma.documentBlock.findUnique({
        where: { id: action.target.blockId },
      });
      if (!block) {
        throw new AppError(ErrorCodes.NOT_FOUND, { message: '블록을 찾을 수 없습니다.' });
      }
      const content = block.content as Record<string, unknown>;
      const field = 'title' in content ? 'title' : 'heading' in content ? 'heading' : 'title';
      const updated = await updateBlock(userId, action.target.blockId, {
        content: { ...content, [field]: action.payload.title },
      });
      return { updatedBlockId: updated.id, warnings };
    }
    case 'mark_block_approved': {
      const block = await prisma.documentBlock.findUnique({
        where: { id: action.target.blockId },
      });
      if (!block) {
        throw new AppError(ErrorCodes.NOT_FOUND, { message: '블록을 찾을 수 없습니다.' });
      }
      const meta =
        block.metadata && typeof block.metadata === 'object'
          ? (block.metadata as Record<string, unknown>)
          : {};
      const updated = await prisma.documentBlock.update({
        where: { id: action.target.blockId },
        data: { metadata: { ...meta, approved: true } as Prisma.InputJsonValue },
      });
      await writeAuditLog({
        actorId: userId,
        action: 'block.approve',
        targetType: 'DocumentBlock',
        targetId: updated.id,
      });
      return { updatedBlockId: updated.id, warnings };
    }
    case 'generate_image': {
      // 이미지 블록 생성 후 prompt로 실제 이미지를 생성해 채운다.
      const created = await addBlock(userId, action.target.documentId, {
        afterBlockId: action.target.afterBlockId,
        block: {
          type: 'image',
          content: { prompt: action.payload.prompt, caption: action.payload.caption },
        },
      });
      const doc = await prisma.document.findUnique({
        where: { id: action.target.documentId },
        select: { projectId: true },
      });
      if (doc?.projectId) {
        try {
          const { generateImage } = await import('./images');
          const gen = await generateImage(userId, {
            projectId: doc.projectId,
            prompt: action.payload.prompt,
            count: 1,
          });
          const version = gen.versions[0];
          if (version) {
            await prisma.documentBlock.update({
              where: { id: created.id },
              data: {
                content: {
                  imageAssetId: gen.imageAssetId,
                  versionId: version.id,
                  url: version.url,
                  caption: action.payload.caption ?? action.payload.prompt.slice(0, 80),
                } as Prisma.InputJsonValue,
              },
            });
            if (version.provider === 'mock') {
              warnings.push(
                '이미지 provider가 설정되지 않아 임시 플레이스홀더가 삽입됐습니다. 설정 → LLM에서 OpenAI 키를 등록하세요.',
              );
            }
          }
        } catch (error) {
          warnings.push(`이미지 생성 실패: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      return { insertedBlockIds: [created.id], warnings };
    }
    case 'extract_ontology': {
      const { extractFromDocument } = await import('./ontology');
      await extractFromDocument(userId, action.target.documentId);
      return { extracted: true, warnings };
    }
  }
}

export async function listSessionMessages(userId: string, chatSessionId: string) {
  const session = await prisma.chatSession.findUnique({
    where: { id: chatSessionId },
    select: { documentId: true },
  });
  if (!session?.documentId) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: '채팅 세션을 찾을 수 없습니다.' });
  }
  await requireDocumentCapability(userId, session.documentId, Capabilities.VIEW_DOCUMENTS);
  return prisma.chatMessage.findMany({
    where: { chatSessionId },
    orderBy: { createdAt: 'asc' },
  });
}
