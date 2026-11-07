/**
 * 메신저 @agent mention 파서.
 * 예: "@콘텐츠에이전트 무몰딩 블로그 초안 작성" → { agent: 'content_agent', instruction: '무몰딩 블로그 초안 작성' }
 */

export const AGENT_ALIASES: Record<string, string> = {
  콘텐츠에이전트: 'content_agent',
  콘텐츠: 'content_agent',
  content: 'content_agent',
  이미지에이전트: 'image_agent',
  이미지: 'image_agent',
  image: 'image_agent',
  법규에이전트: 'legal_agent',
  법규: 'legal_agent',
  legal: 'legal_agent',
  지식에이전트: 'knowledge_agent',
  지식: 'knowledge_agent',
};

export const AGENT_LABELS: Record<string, string> = {
  content_agent: '콘텐츠 에이전트',
  image_agent: '이미지 에이전트',
  legal_agent: '법규 에이전트',
  knowledge_agent: '지식 에이전트',
};

export type AgentMention = {
  agent: string;
  /** mention을 제외한 지시 내용 */
  instruction: string;
};

const MENTION_PATTERN = /@([\w가-힣]+)/;

export function parseAgentMention(text: string): AgentMention | null {
  const match = text.match(MENTION_PATTERN);
  if (!match) return null;
  const alias = match[1] ?? '';
  const agent = AGENT_ALIASES[alias];
  if (!agent) return null;
  const instruction = text.replace(match[0], '').trim();
  if (!instruction) return null;
  return { agent, instruction };
}
