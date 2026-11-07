import { z } from 'zod';

/**
 * 문서 블록 스키마. DATA_MODEL.md 2장 Block Content JSON 참조.
 * DB에는 type(string) + content(Json)로 저장되고, 앱 레이어에서 이 스키마로 검증한다.
 */

export const BlockTypes = {
  HEADING: 'heading',
  PARAGRAPH: 'paragraph',
  IMAGE: 'image',
  CHECKLIST: 'checklist',
  SOURCE_REFERENCE: 'source_reference',
  CTA: 'cta',
  CHART: 'chart',
  TABLE: 'table',
  FORMULA: 'formula',
  DOC_META: 'doc_meta',
  QNA: 'qna',
  LAW_REFERENCE: 'law_reference',
  CALLOUT: 'callout',
  QUOTE: 'quote',
  CODE: 'code',
  COST_TABLE: 'cost_table',
  CONSTRUCTION_DETAIL: 'construction_detail',
  CONTAINER: 'container',
  RICH_TEXT: 'rich_text',
  IMAGE_GALLERY: 'image_gallery',
  BEFORE_AFTER: 'before_after',
  DIAGRAM: 'diagram',
  CONSTRUCTION_STANDARD: 'construction_standard',
  MATERIAL_SPEC: 'material_spec',
  SCHEDULE: 'schedule',
  RISK_WARNING: 'risk_warning',
  SEO_META: 'seo_meta',
  BLOG_SECTION: 'blog_section',
  TECHNICAL_SECTION: 'technical_section',
  ONTOLOGY_SUMMARY: 'ontology_summary',
} as const;

export type BlockType = (typeof BlockTypes)[keyof typeof BlockTypes];

export const headingContentSchema = z.object({
  level: z.number().int().min(1).max(3),
  text: z.string(),
});

export const paragraphContentSchema = z.object({
  text: z.string(),
  tone: z.string().optional(),
  seoKeywords: z.array(z.string()).optional(),
});

export const imageContentSchema = z.object({
  imageAssetId: z.string().optional(),
  versionId: z.string().optional(),
  url: z.string().optional(),
  caption: z.string().optional(),
  /** AI가 생성할 이미지 프롬프트. url이 없고 prompt가 있으면 삽입 시 실제 이미지를 생성한다. */
  prompt: z.string().optional(),
});

export const checklistContentSchema = z.object({
  title: z.string().optional(),
  items: z.array(
    z.object({
      text: z.string(),
      checked: z.boolean().default(false),
    }),
  ),
});

export const sourceReferenceContentSchema = z.object({
  title: z.string(),
  summary: z.string().optional(),
  citations: z.array(z.string()).default([]),
});

export const ctaContentSchema = z.object({
  text: z.string(),
  buttonLabel: z.string().optional(),
  url: z.string().optional(),
});

/** 차트/그래프 블록: 데이터는 블록에 내장, 렌더링은 SVG (모노톤) */
export const chartContentSchema = z.object({
  chartType: z.enum(['bar', 'line', 'pie']),
  title: z.string().optional(),
  labels: z.array(z.string()).min(1, '라벨이 최소 1개 필요합니다.'),
  series: z
    .array(
      z.object({
        name: z.string().optional(),
        values: z.array(z.number()).min(1),
      }),
    )
    .min(1, '데이터 시리즈가 최소 1개 필요합니다.'),
});

/** 기준표/비교표 블록 (제안서: 자재 비교표, 규격표, 공정표) */
export const tableContentSchema = z.object({
  title: z.string().optional(),
  headers: z.array(z.string()).min(1, '표 헤더가 최소 1개 필요합니다.'),
  rows: z.array(z.array(z.string())).min(1, '표 행이 최소 1개 필요합니다.'),
});

/** 계산식 블록 (제안서: 열관류율, TDR, 단가·물량 산식) */
export const formulaContentSchema = z.object({
  title: z.string().optional(),
  expression: z.string().min(1, '계산식을 입력해 주세요.'),
  variables: z
    .array(
      z.object({
        symbol: z.string(),
        meaning: z.string(),
        unit: z.string().optional(),
      }),
    )
    .default([]),
  result: z.string().optional(),
});

/** 문서 메타 블록 (제안서: 문서코드, 버전, 발행일, 작성자, 검수 상태) */
export const docMetaContentSchema = z.object({
  docCode: z.string().optional(),
  version: z.string().optional(),
  author: z.string().optional(),
  publishedAt: z.string().optional(),
  reviewStatus: z.enum(['draft', 'review', 'approved']).default('draft'),
});

/** 현장 Q&A 블록 (제안서: 질문, 답변, 근거) */
export const qnaContentSchema = z.object({
  title: z.string().optional(),
  items: z
    .array(
      z.object({
        question: z.string(),
        answer: z.string(),
        basis: z.string().optional(),
      }),
    )
    .min(1, 'Q&A 항목이 최소 1개 필요합니다.'),
});

/** 법규 인용 블록 (법규해설서: 법령/조항 + 요약 + 원문 링크). 법규 답변의 citation 근거. */
export const lawReferenceContentSchema = z.object({
  law: z.string().min(1, '법령명을 입력해 주세요.'),
  article: z.string().optional(),
  clause: z.string().optional(),
  summary: z.string().optional(),
  link: z.string().optional(),
});

/** 강조 박스(콜아웃): 정보/주의/팁/경고 */
export const calloutContentSchema = z.object({
  variant: z.enum(['info', 'warning', 'tip', 'danger']).default('info'),
  title: z.string().optional(),
  text: z.string(),
});

/** 인용구 블록 */
export const quoteContentSchema = z.object({
  text: z.string(),
  attribution: z.string().optional(),
});

/** 코드 블록 */
export const codeContentSchema = z.object({
  language: z.string().optional(),
  code: z.string(),
});

/** 견적/비용표: 항목별 수량·단가, 합계는 렌더·내보내기에서 자동 계산 */
export const costTableContentSchema = z.object({
  title: z.string().optional(),
  currency: z.string().default('원'),
  items: z
    .array(
      z.object({
        name: z.string(),
        spec: z.string().optional(),
        quantity: z.number().default(0),
        unit: z.string().optional(),
        unitPrice: z.number().default(0),
      }),
    )
    .default([]),
  note: z.string().optional(),
});

/** 시공 상세: 상세도 이미지 + 단계별 시공 절차 + 주의사항 */
export const constructionDetailContentSchema = z.object({
  title: z.string().optional(),
  imageUrl: z.string().optional(),
  imagePrompt: z.string().optional(),
  steps: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

/** 컨테이너 블록: 자식 블록들을 묶는 그룹. 자식은 DocumentBlock.parentId로 연결된다. */
export const containerContentSchema = z.object({
  title: z.string().default(''),
  collapsed: z.boolean().optional(),
});

/** 리치 텍스트(마크다운 허용 본문) */
export const richTextContentSchema = z.object({
  text: z.string(),
  format: z.enum(['markdown', 'plain']).default('markdown'),
});

/** 이미지 갤러리: 여러 장 */
export const imageGalleryContentSchema = z.object({
  title: z.string().optional(),
  images: z
    .array(z.object({ url: z.string().optional(), caption: z.string().optional(), prompt: z.string().optional() }))
    .default([]),
});

/** 시공 전/후 비교 */
export const beforeAfterContentSchema = z.object({
  title: z.string().optional(),
  before: z.object({ url: z.string().optional(), label: z.string().default('시공 전'), prompt: z.string().optional() }),
  after: z.object({ url: z.string().optional(), label: z.string().default('시공 후'), prompt: z.string().optional() }),
});

/** 다이어그램: 텍스트 소스(mermaid 등) + 선택 이미지 */
export const diagramContentSchema = z.object({
  title: z.string().optional(),
  source: z.string().default(''),
  imageUrl: z.string().optional(),
});

/** 시공 표준(기준서 조항) */
export const constructionStandardContentSchema = z.object({
  title: z.string().optional(),
  standardCode: z.string().optional(),
  clauses: z.array(z.object({ no: z.string().optional(), text: z.string() })).default([]),
});

/** 자재 사양서(키-값) */
export const materialSpecContentSchema = z.object({
  material: z.string().default(''),
  specs: z.array(z.object({ key: z.string(), value: z.string() })).default([]),
});

/** 공정 일정 */
export const scheduleContentSchema = z.object({
  title: z.string().optional(),
  items: z
    .array(z.object({ task: z.string(), start: z.string().optional(), end: z.string().optional(), owner: z.string().optional() }))
    .default([]),
});

/** 위험 경고(심각도 + 위험 + 대응) */
export const riskWarningContentSchema = z.object({
  severity: z.enum(['low', 'medium', 'high']).default('medium'),
  title: z.string().optional(),
  risk: z.string(),
  mitigation: z.string().optional(),
});

/** SEO 메타 */
export const seoMetaContentSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  keywords: z.array(z.string()).default([]),
  slug: z.string().optional(),
});

/** 블로그 섹션(제목 + 본문) */
export const blogSectionContentSchema = z.object({
  heading: z.string().default(''),
  body: z.string().default(''),
});

/** 기술 섹션(제목 + 본문 + 참고) */
export const technicalSectionContentSchema = z.object({
  heading: z.string().default(''),
  body: z.string().default(''),
  references: z.array(z.string()).default([]),
});

/** 온톨로지 요약(관련 지식 노드 라벨 목록) */
export const ontologySummaryContentSchema = z.object({
  title: z.string().default('관련 지식'),
  nodes: z.array(z.string()).default([]),
});

export const blockContentSchemas: Record<BlockType, z.ZodTypeAny> = {
  heading: headingContentSchema,
  paragraph: paragraphContentSchema,
  image: imageContentSchema,
  checklist: checklistContentSchema,
  source_reference: sourceReferenceContentSchema,
  cta: ctaContentSchema,
  chart: chartContentSchema,
  table: tableContentSchema,
  formula: formulaContentSchema,
  doc_meta: docMetaContentSchema,
  qna: qnaContentSchema,
  law_reference: lawReferenceContentSchema,
  callout: calloutContentSchema,
  quote: quoteContentSchema,
  code: codeContentSchema,
  cost_table: costTableContentSchema,
  construction_detail: constructionDetailContentSchema,
  container: containerContentSchema,
  rich_text: richTextContentSchema,
  image_gallery: imageGalleryContentSchema,
  before_after: beforeAfterContentSchema,
  diagram: diagramContentSchema,
  construction_standard: constructionStandardContentSchema,
  material_spec: materialSpecContentSchema,
  schedule: scheduleContentSchema,
  risk_warning: riskWarningContentSchema,
  seo_meta: seoMetaContentSchema,
  blog_section: blogSectionContentSchema,
  technical_section: technicalSectionContentSchema,
  ontology_summary: ontologySummaryContentSchema,
};

export const blockTypeSchema = z.enum([
  'heading',
  'paragraph',
  'image',
  'checklist',
  'source_reference',
  'cta',
  'chart',
  'table',
  'formula',
  'doc_meta',
  'qna',
  'law_reference',
  'callout',
  'quote',
  'code',
  'cost_table',
  'construction_detail',
  'container',
  'rich_text',
  'image_gallery',
  'before_after',
  'diagram',
  'construction_standard',
  'material_spec',
  'schedule',
  'risk_warning',
  'seo_meta',
  'blog_section',
  'technical_section',
  'ontology_summary',
]);

export const blockInputSchema = z
  .object({
    type: blockTypeSchema,
    content: z.record(z.unknown()),
    metadata: z.record(z.unknown()).optional(),
  })
  .superRefine((value, ctx) => {
    const schema = blockContentSchemas[value.type];
    const result = schema.safeParse(value.content);
    if (!result.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `'${value.type}' 블록 내용이 올바르지 않습니다.`,
        path: ['content'],
        params: { issues: result.error.issues },
      });
    }
  });

export type BlockInput = z.infer<typeof blockInputSchema>;

export type HeadingContent = z.infer<typeof headingContentSchema>;
export type ParagraphContent = z.infer<typeof paragraphContentSchema>;
export type ImageContent = z.infer<typeof imageContentSchema>;
export type ChecklistContent = z.infer<typeof checklistContentSchema>;
export type SourceReferenceContent = z.infer<typeof sourceReferenceContentSchema>;
export type CtaContent = z.infer<typeof ctaContentSchema>;
export type ChartContent = z.infer<typeof chartContentSchema>;
export type TableContent = z.infer<typeof tableContentSchema>;
export type FormulaContent = z.infer<typeof formulaContentSchema>;
export type DocMetaContent = z.infer<typeof docMetaContentSchema>;
export type QnaContent = z.infer<typeof qnaContentSchema>;
export type LawReferenceContent = z.infer<typeof lawReferenceContentSchema>;
export type CalloutContent = z.infer<typeof calloutContentSchema>;
export type QuoteContent = z.infer<typeof quoteContentSchema>;
export type CodeContent = z.infer<typeof codeContentSchema>;
export type CostTableContent = z.infer<typeof costTableContentSchema>;
export type ConstructionDetailContent = z.infer<typeof constructionDetailContentSchema>;
export type ContainerContent = z.infer<typeof containerContentSchema>;
export type RichTextContent = z.infer<typeof richTextContentSchema>;
export type ImageGalleryContent = z.infer<typeof imageGalleryContentSchema>;
export type BeforeAfterContent = z.infer<typeof beforeAfterContentSchema>;
export type DiagramContent = z.infer<typeof diagramContentSchema>;
export type ConstructionStandardContent = z.infer<typeof constructionStandardContentSchema>;
export type MaterialSpecContent = z.infer<typeof materialSpecContentSchema>;
export type ScheduleContent = z.infer<typeof scheduleContentSchema>;
export type RiskWarningContent = z.infer<typeof riskWarningContentSchema>;
export type SeoMetaContent = z.infer<typeof seoMetaContentSchema>;
export type BlogSectionContent = z.infer<typeof blogSectionContentSchema>;
export type TechnicalSectionContent = z.infer<typeof technicalSectionContentSchema>;
export type OntologySummaryContent = z.infer<typeof ontologySummaryContentSchema>;

/** 검증된 블록 내용 파싱. 실패 시 한국어 메시지 에러를 던진다. */
export function parseBlockContent(type: string, content: unknown) {
  const blockType = blockTypeSchema.safeParse(type);
  if (!blockType.success) {
    throw new Error(`지원하지 않는 블록 타입입니다: ${type}`);
  }
  const result = blockContentSchemas[blockType.data].safeParse(content);
  if (!result.success) {
    throw new Error(`'${type}' 블록 내용이 올바르지 않습니다.`);
  }
  return result.data as unknown;
}
