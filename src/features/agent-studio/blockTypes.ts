import type { AgentBlockType } from "../../lib/agentStudioStore";

export const BLOCK_TYPE_LABELS: Record<AgentBlockType, string> = {
  heading: "제목", paragraph: "문단", image: "이미지", checklist: "체크리스트",
  source_reference: "출처", cta: "CTA", chart: "차트", table: "표", formula: "수식",
  doc_meta: "문서 정보", qna: "Q&A", law_reference: "법규 인용", callout: "강조",
  quote: "인용문", code: "코드", cost_table: "비용표", construction_detail: "시공 상세",
  container: "컨테이너", rich_text: "서식 문단", image_gallery: "이미지 갤러리",
  before_after: "전후 비교", diagram: "다이어그램", construction_standard: "시공 기준",
  material_spec: "자재 사양", schedule: "일정", risk_warning: "위험 경고",
  seo_meta: "SEO 정보", blog_section: "블로그 섹션", technical_section: "기술 섹션",
  ontology_summary: "온톨로지 요약", divider: "구분선",
};
