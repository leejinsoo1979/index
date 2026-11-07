import { detectQuestionIntent } from './intent';

/**
 * 역할별 전문 에이전트 라우터 (제안서: 콘텐츠팀/법규팀/시공디테일팀/이미지팀/지식관리팀/PM).
 * 하나의 챗봇이 아니라 역할별 에이전트가 같은 프로젝트 컨텍스트를 공유한다.
 */

export type AgentRoleKey =
  | 'content_agent'
  | 'legal_agent'
  | 'construction_agent'
  | 'image_agent'
  | 'knowledge_agent'
  | 'pm_agent';

export type AgentRole = {
  key: AgentRoleKey;
  label: string;
  /** 실제 LLM 사용 시 system prompt에 주입되는 페르소나 */
  persona: string;
};

export const AGENT_ROLES: Record<AgentRoleKey, AgentRole> = {
  content_agent: {
    key: 'content_agent',
    label: '콘텐츠팀',
    persona:
      '너는 콘텐츠팀 에이전트다. 블로그, 제안서, 교육자료, SEO 제목, 상담 유도 문구를 전문가 톤으로 작성한다.',
  },
  legal_agent: {
    key: 'legal_agent',
    label: '법규팀',
    persona:
      '너는 법규팀 에이전트다. 건축법, 에너지절약 설계기준, KEC, KCS/KDS 등 공식 근거를 기반으로만 답하고, 출처가 없으면 확답하지 않는다.',
  },
  construction_agent: {
    key: 'construction_agent',
    label: '시공디테일팀',
    persona:
      '너는 시공디테일팀 에이전트다. 방수, 단열, 전기, 철거, 설비, 목공 공법과 하자 리스크를 현장 기준으로 설명한다.',
  },
  image_agent: {
    key: 'image_agent',
    label: '이미지팀',
    persona:
      '너는 이미지팀 에이전트다. 이미지 생성·인페인트 프롬프트, 캡션, 썸네일 문구를 만든다.',
  },
  knowledge_agent: {
    key: 'knowledge_agent',
    label: '지식관리팀',
    persona:
      '너는 지식관리팀 에이전트다. 문서에서 개념·자재·공법·법규 노드를 추출하고 지식베이스를 관리한다.',
  },
  pm_agent: {
    key: 'pm_agent',
    label: 'PM 에이전트',
    persona:
      '너는 PM 에이전트다. 작업 생성, 진행률 정리, 산출물 검수 요청 등 프로젝트 진행을 관리한다.',
  },
};

const IMAGE_KEYWORDS = ['이미지', '사진', '썸네일', '인페인트', '그려'];
const KNOWLEDGE_KEYWORDS = ['지식', '노드', '온톨로지', '지식베이스', '업로드한 자료'];
const PM_KEYWORDS = ['업무', '태스크', 'task', '일정', '진행률', '담당자', '검수 요청'];

/** 메시지를 역할 에이전트로 라우팅한다 */
export function routeAgentRole(message: string): AgentRole {
  const intent = detectQuestionIntent(message);
  if (intent === 'legal') return AGENT_ROLES.legal_agent;
  if (intent === 'construction_detail') return AGENT_ROLES.construction_agent;
  if (IMAGE_KEYWORDS.some((k) => message.includes(k))) return AGENT_ROLES.image_agent;
  if (KNOWLEDGE_KEYWORDS.some((k) => message.includes(k))) return AGENT_ROLES.knowledge_agent;
  if (PM_KEYWORDS.some((k) => message.includes(k))) return AGENT_ROLES.pm_agent;
  return AGENT_ROLES.content_agent;
}
