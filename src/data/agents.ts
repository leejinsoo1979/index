export type AgentPreview = "chat" | "document" | "knowledge" | "graph" | "messenger";

export interface AgentTool {
  id: AgentPreview;
  image: string;
  imageAlt: string;
  category: string;
  title: string;
  description: string;
  to: string;
  access: string;
}

/** Existing tools only: each card links to an implemented application route. */
export const agentTools: AgentTool[] = [
  {
    id: "chat",
    image: "/images/ai/agent-chat",
    imageAlt: "주거인테리어 전문가의 태블릿 상담을 표현한 AI 생성 대표 이미지",
    category: "AI 상담",
    title: "INDEX AI",
    description: "주거공간의 설계·시공·자재·기술에 관해 질문하고, AI와 아이디어를 탐색하며 실무의 다양한 고민을 정리하세요.",
    to: "/",
    access: "바로 이용",
  },
  {
    id: "document",
    image: "/images/ai/agent-document",
    imageAlt: "주거인테리어 기술 문서와 설계 자료 작성을 표현한 AI 생성 대표 이미지",
    category: "문서 작성",
    title: "INDEX Agent Studio",
    description: "블로그, 기술자료, 제안서와 SNS 캡션을 AI와 함께 작성하고, 블록 단위로 편집·내보내기 하세요.",
    to: "/agent-studio",
    access: "관리자 전용",
  },
  {
    id: "knowledge",
    image: "/images/ai/agent-knowledge",
    imageAlt: "주거인테리어 자료와 자재를 정리한 지식 아카이브를 표현한 AI 생성 대표 이미지",
    category: "지식 라이브러리",
    title: "INDEX LLM Wiki",
    description: "문서와 PDF를 지식으로 모으고, 위키 문서·백링크·출처·수정 이력을 한곳에서 탐색하세요.",
    to: "/agent-studio/wiki",
    access: "관리자 전용",
  },
  {
    id: "graph",
    image: "/images/ai/agent-graph",
    imageAlt: "자재와 공법 지식의 연결을 나타내는 입체 네트워크의 AI 생성 대표 이미지",
    category: "지식 시각화",
    title: "위키 그래프",
    description: "위키 문서 사이의 연결을 그래프로 탐색하고, 노드를 선택해 관련 지식과 원문을 읽어보세요.",
    to: "/agent-studio/wiki?view=graph",
    access: "관리자 전용",
  },
  {
    id: "messenger",
    image: "/images/ai/agent-messenger",
    imageAlt: "주거인테리어 프로젝트를 함께 검토하는 전문가 팀을 표현한 AI 생성 대표 이미지",
    category: "에이전트 협업",
    title: "에이전트 메신저",
    description: "대화에서 담당 에이전트를 호출해 업무를 배정하고, 작업 상태와 결과 문서를 한곳에서 관리하세요.",
    to: "/agent-studio/messenger",
    access: "관리자 전용",
  },
];
