import type { GenerateTextInput, GenerateTextResult, LlmProvider, StreamChunk } from './llm-provider';
import type { AgentActionInput } from './agent-actions';
import { detectQuestionIntent } from './intent';
import type { SearchResult } from './search-provider';

/**
 * Mock LLM provider.
 * 실제 LLM 연동 전까지 결정적(deterministic) 응답을 생성한다.
 * Provider Adapter 패턴이므로 실제 구현으로 교체 시 인터페이스는 동일하다.
 */

export type AgentPlanInput = {
  message: string;
  documentId: string;
  documentTitle?: string;
  selectedBlockId?: string;
  selectedBlockText?: string;
  /** 법규/공법 질문일 때 서비스가 검색해서 전달하는 결과 */
  searchResults?: SearchResult[];
};

export type AgentPlan = {
  reply: string;
  actions: AgentActionInput[];
};

const BLOG_KEYWORDS = ['블로그', '초안', '글 써', '글써', '작성해'];
const IMAGE_KEYWORDS = ['이미지', '사진', '그림', '썸네일'];
const EDIT_KEYWORDS = ['바꿔', '수정', '고쳐', '다듬어', '톤'];
const CHART_KEYWORDS = ['차트', '그래프'];

export function planAgentResponse(input: AgentPlanInput): AgentPlan {
  // 법규/공법 질문: citation 없는 확답 금지 (CLAUDE.md 규칙 4)
  const intent = detectQuestionIntent(input.message);
  if (intent !== 'general') {
    const results = input.searchResults ?? [];
    if (results.length === 0) {
      return {
        reply:
          '해당 질문은 법규/시공 기준과 관련되어 있어 공식 출처 확인이 필요합니다. 현재 신뢰할 수 있는 출처를 찾지 못해 확답을 드릴 수 없습니다. 법제처 국가법령정보센터 또는 국가건설기준센터(KCSC)에서 원문을 확인해 주세요.',
        actions: [],
      };
    }
    const top = results[0]!;
    const summary = results
      .slice(0, 3)
      .map((r) => `- ${r.title} (${r.publisher})`)
      .join('\n');
    return {
      reply: `공식 출처 기준으로 정리했습니다.\n\n${top.snippet}\n\n참고한 출처:\n${summary}\n\n승인하시면 출처 블록을 문서에 추가합니다. 적용 전 원문 확인을 권장합니다.`,
      actions: [
        {
          action_type: 'insert_blocks',
          target: { documentId: input.documentId },
          payload: {
            blocks: [
              {
                type: 'source_reference',
                content: {
                  title: intent === 'legal' ? '관련 법규 검토' : '시공 기준 검토',
                  summary: top.snippet,
                  citations: [],
                },
                metadata: {
                  citationDrafts: results.slice(0, 3).map((r) => ({
                    title: r.title,
                    url: r.url,
                    publisher: r.publisher,
                    quote: r.snippet,
                    sourceType: r.sourceType,
                    retrievedAt: r.retrievedAt,
                  })),
                },
              },
            ],
          },
          requires_approval: true,
          risk_level: 'low',
        },
      ],
    };
  }

  const wantsEdit = Boolean(input.selectedBlockId) && EDIT_KEYWORDS.some((k) => input.message.includes(k));
  if (wantsEdit && input.selectedBlockId) {
    const revised = reviseText(input.selectedBlockText ?? '', input.message);
    return {
      reply:
        '선택하신 블록의 수정안을 만들었습니다. 미리보기를 확인하고 승인해 주시면 문서에 반영하겠습니다.',
      actions: [
        {
          action_type: 'update_block',
          target: { documentId: input.documentId, blockId: input.selectedBlockId },
          payload: { content: { text: revised } },
          requires_approval: true,
          risk_level: 'low',
        },
      ],
    };
  }

  // 이미지(+글) 생성 요청: 글 문단 + 실제 생성될 이미지 블록을 함께 제안
  if (IMAGE_KEYWORDS.some((k) => input.message.includes(k))) {
    const topic = input.documentTitle?.trim() || '인테리어';
    return {
      reply: `${topic} 관련 글과 이미지를 함께 구성했습니다. 승인하시면 이미지가 실제로 생성되어 문서에 삽입됩니다.`,
      actions: [
        {
          action_type: 'insert_blocks',
          target: { documentId: input.documentId },
          payload: {
            blocks: [
              {
                type: 'paragraph',
                content: {
                  text: `${topic} 공간은 자연광과 마감재의 톤을 맞추는 것이 핵심입니다. 아래 이미지는 분위기를 잡는 참고안입니다.`,
                  tone: 'professional',
                },
              },
              {
                type: 'image',
                content: {
                  prompt: `${input.message} — ${topic}, 따뜻한 우드톤, 자연광, 인테리어 포토리얼리스틱`,
                  caption: `${topic} 참고 이미지`,
                },
              },
            ],
          },
          requires_approval: true,
          risk_level: 'low',
        },
      ],
    };
  }

  // 차트/그래프 생성 요청
  if (CHART_KEYWORDS.some((k) => input.message.includes(k))) {
    return {
      reply:
        '공정별 비용 비율 예시 차트를 만들었습니다. 승인하시면 문서에 삽입되며, 삽입 후 데이터와 차트 유형을 직접 수정할 수 있습니다.',
      actions: [
        {
          action_type: 'insert_blocks',
          target: { documentId: input.documentId },
          payload: {
            blocks: [
              {
                type: 'chart',
                content: {
                  chartType: input.message.includes('파이') || input.message.includes('비율')
                    ? 'pie'
                    : input.message.includes('추이') || input.message.includes('선')
                      ? 'line'
                      : 'bar',
                  title: '공정별 비용 비중 (예시)',
                  labels: ['철거', '설비/배관', '목공', '도장/마감', '가구'],
                  series: [{ name: '비용(만원)', values: [350, 620, 980, 540, 760] }],
                },
              },
            ],
          },
          requires_approval: true,
          risk_level: 'low',
        },
      ],
    };
  }

  if (BLOG_KEYWORDS.some((k) => input.message.includes(k))) {
    const topic = input.documentTitle?.trim() || '인테리어 리모델링';
    return {
      reply: `'${topic}' 주제로 블로그 초안을 구성했습니다. 승인하시면 문서에 블록으로 삽입됩니다.`,
      actions: [
        {
          action_type: 'insert_blocks',
          target: { documentId: input.documentId },
          payload: {
            blocks: [
              {
                type: 'heading',
                content: { level: 1, text: `${topic}, 모던하고 아늑한 공간으로 변신` },
              },
              {
                type: 'paragraph',
                content: {
                  text: '이번 현장은 구축 아파트 특유의 답답한 구조를 개선하고, 수납과 동선을 동시에 잡는 것을 목표로 진행했습니다. 철거 전 현장 점검에서 확인된 결로와 단열 문제를 먼저 해결한 뒤, 전체 톤을 웜그레이로 통일했습니다.',
                  tone: 'professional',
                },
              },
              {
                type: 'heading',
                content: { level: 2, text: '시공 포인트' },
              },
              {
                type: 'checklist',
                content: {
                  title: '핵심 체크리스트',
                  items: [
                    { text: '철거 전 결로/단열 상태 점검', checked: false },
                    { text: '배관·전기 증설 여부 확인', checked: false },
                    { text: '마감재 톤 통일 (웜그레이)', checked: false },
                  ],
                },
              },
              {
                type: 'paragraph',
                content: {
                  text: '거실 아트월은 무몰딩 마감으로 면을 정리하고, 간접조명을 더해 저녁 시간에도 아늑한 분위기를 유지하도록 했습니다. 주방은 ㄷ자 구조로 변경해 조리 동선을 단축했습니다.',
                  tone: 'professional',
                },
              },
              {
                type: 'cta',
                content: {
                  text: '우리 집도 이렇게 바꾸고 싶다면, 지금 무료 상담을 신청해 보세요.',
                  buttonLabel: '무료 상담 신청',
                  url: 'https://example.com/consult',
                },
              },
            ],
          },
          requires_approval: true,
          risk_level: 'low',
        },
      ],
    };
  }

  return {
    reply:
      '네, 말씀해 주세요. 블로그 초안 작성, 선택한 블록 수정, 체크리스트 추가 등을 도와드릴 수 있습니다. 예: "블로그 초안 작성해줘", 블록 선택 후 "전문가 톤으로 바꿔줘".',
    actions: [],
  };
}

function reviseText(original: string, instruction: string): string {
  const base = original.trim() || '내용';
  if (instruction.includes('전문가') || instruction.includes('professional')) {
    return `${base.replace(/[.。]?\s*$/, '')}. 시공 품질과 하자 예방 관점에서 검토한 결과를 토대로, 자재 선정 기준과 시공 순서를 명확히 정리해 안내드립니다.`;
  }
  if (instruction.includes('짧게') || instruction.includes('간결')) {
    return base.length > 50 ? `${base.slice(0, 50)}…` : base;
  }
  return `${base} (요청에 따라 다듬은 수정안입니다.)`;
}

export class MockLlmProvider implements LlmProvider {
  readonly name = 'mock';

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    return { text: `[mock 응답] ${input.prompt.slice(0, 80)}`, model: 'mock-1', provider: 'mock' };
  }

  async *streamText(input: GenerateTextInput): AsyncIterable<StreamChunk> {
    const { text } = await this.generateText(input);
    for (const char of text) {
      yield { type: 'text_delta', text: char };
    }
    yield { type: 'done' };
  }
}
