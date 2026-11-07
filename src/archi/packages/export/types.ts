/** Export Adapter 인터페이스 (ARCHITECTURE.md 6.4) */

export type ExportBlock = {
  id: string;
  type: string;
  sortOrder: number;
  content: Record<string, unknown>;
  parentId?: string | null;
};

/**
 * 블록을 트리로 묶는다. parentId가 없는(null/undefined) 최상위 블록을 sortOrder 순으로 반환하며,
 * 각 블록의 직접 자식(parentId === block.id)을 sortOrder 순으로 함께 담는다.
 */
export function buildBlockTree(
  blocks: ExportBlock[],
): { block: ExportBlock; children: ExportBlock[] }[] {
  const childrenByParent = new Map<string, ExportBlock[]>();
  for (const block of blocks) {
    if (block.parentId != null) {
      const list = childrenByParent.get(block.parentId) ?? [];
      list.push(block);
      childrenByParent.set(block.parentId, list);
    }
  }
  const topLevel = blocks
    .filter((b) => b.parentId == null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return topLevel.map((block) => ({
    block,
    children: (childrenByParent.get(block.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
  }));
}

export type DocumentForExport = {
  id: string;
  title: string;
  blocks: ExportBlock[];
};

export type ExportFormat = 'txt' | 'markdown' | 'pdf' | 'docx' | 'html' | 'json';

export type ExportOptions = {
  /** PDF 한글 렌더링용 폰트 바이트 (호출자가 주입) */
  fontBytes?: Uint8Array;
};

export type ExportResult = {
  filename: string;
  mimeType: string;
  data: Uint8Array;
};

export interface Exporter {
  readonly format: ExportFormat;
  export(document: DocumentForExport, options?: ExportOptions): Promise<ExportResult>;
}

/** 파일명에 쓸 수 없는 문자 제거 */
export function safeFilename(title: string, ext: string): string {
  const base = title.replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 80) || 'document';
  return `${base}.${ext}`;
}

type SourceRefContent = { title?: string; summary?: string; citations?: string[] };
type ChecklistItem = { text: string; checked: boolean };

/** 블록들을 공용 중간 표현으로 변환하며 출처 목록을 분리 수집한다 */
export function collectSources(blocks: ExportBlock[]): {
  bodyBlocks: ExportBlock[];
  sources: SourceRefContent[];
} {
  const sources: SourceRefContent[] = [];
  for (const block of blocks) {
    if (block.type === 'source_reference') {
      sources.push(block.content as SourceRefContent);
    }
  }
  return { bodyBlocks: blocks, sources };
}

export function checklistItems(content: Record<string, unknown>): ChecklistItem[] {
  return Array.isArray(content.items) ? (content.items as ChecklistItem[]) : [];
}

export type ChartData = {
  chartType: string;
  title?: string;
  labels: string[];
  series: { name?: string; values: number[] }[];
};

export function chartData(content: Record<string, unknown>): ChartData | null {
  const labels = Array.isArray(content.labels) ? (content.labels as string[]) : [];
  const series = Array.isArray(content.series)
    ? (content.series as { name?: string; values: number[] }[])
    : [];
  if (labels.length === 0 || series.length === 0) return null;
  return {
    chartType: String(content.chartType ?? 'bar'),
    title: typeof content.title === 'string' ? content.title : undefined,
    labels,
    series,
  };
}

export const CHART_TYPE_LABELS: Record<string, string> = {
  bar: '막대',
  line: '선',
  pie: '파이',
};

export type TableData = { title?: string; headers: string[]; rows: string[][] };

export function tableData(content: Record<string, unknown>): TableData | null {
  const headers = Array.isArray(content.headers) ? (content.headers as string[]) : [];
  const rows = Array.isArray(content.rows) ? (content.rows as string[][]) : [];
  if (headers.length === 0) return null;
  return {
    title: typeof content.title === 'string' ? content.title : undefined,
    headers,
    rows,
  };
}

export type FormulaData = {
  title?: string;
  expression: string;
  variables: { symbol: string; meaning: string; unit?: string }[];
  result?: string;
};

export function formulaData(content: Record<string, unknown>): FormulaData | null {
  if (typeof content.expression !== 'string' || !content.expression) return null;
  return {
    title: typeof content.title === 'string' ? content.title : undefined,
    expression: content.expression,
    variables: Array.isArray(content.variables)
      ? (content.variables as FormulaData['variables'])
      : [],
    result: typeof content.result === 'string' && content.result ? content.result : undefined,
  };
}

export type DocMetaData = {
  docCode?: string;
  version?: string;
  author?: string;
  publishedAt?: string;
  reviewStatus?: string;
};

export const REVIEW_STATUS_LABELS: Record<string, string> = {
  draft: '작성 중',
  review: '검수 대기',
  approved: '검수 완료',
};

export function docMetaEntries(content: Record<string, unknown>): [string, string][] {
  const c = content as DocMetaData;
  const entries: [string, string][] = [];
  if (c.docCode) entries.push(['문서코드', c.docCode]);
  if (c.version) entries.push(['버전', c.version]);
  if (c.author) entries.push(['작성자', c.author]);
  if (c.publishedAt) entries.push(['발행일', c.publishedAt]);
  if (c.reviewStatus) {
    entries.push(['검수 상태', REVIEW_STATUS_LABELS[c.reviewStatus] ?? c.reviewStatus]);
  }
  return entries;
}

export type QnaItem = { question: string; answer: string; basis?: string };

export function qnaItems(content: Record<string, unknown>): QnaItem[] {
  return Array.isArray(content.items) ? (content.items as QnaItem[]) : [];
}

export type LawReferenceData = {
  law: string;
  article?: string;
  clause?: string;
  summary?: string;
  link?: string;
};

export function lawReferenceData(content: Record<string, unknown>): LawReferenceData | null {
  if (typeof content.law !== 'string' || !content.law) return null;
  return {
    law: content.law,
    article: typeof content.article === 'string' && content.article ? content.article : undefined,
    clause: typeof content.clause === 'string' && content.clause ? content.clause : undefined,
    summary: typeof content.summary === 'string' && content.summary ? content.summary : undefined,
    link: typeof content.link === 'string' && content.link ? content.link : undefined,
  };
}

/** "{law} {article} {clause}" 형태의 머리말 문자열 */
export function lawReferenceHeading(data: LawReferenceData): string {
  return [data.law, data.article, data.clause].filter(Boolean).join(' ');
}

export type CalloutData = { variant: string; title?: string; text: string };

export const CALLOUT_VARIANT_LABELS: Record<string, string> = {
  info: '정보',
  warning: '주의',
  tip: '팁',
  danger: '경고',
};

export function calloutData(content: Record<string, unknown>): CalloutData {
  return {
    variant: typeof content.variant === 'string' ? content.variant : 'info',
    title: typeof content.title === 'string' && content.title ? content.title : undefined,
    text: typeof content.text === 'string' ? content.text : '',
  };
}

export type QuoteData = { text: string; attribution?: string };

export function quoteData(content: Record<string, unknown>): QuoteData {
  return {
    text: typeof content.text === 'string' ? content.text : '',
    attribution:
      typeof content.attribution === 'string' && content.attribution
        ? content.attribution
        : undefined,
  };
}

export type CodeData = { language?: string; code: string };

export function codeData(content: Record<string, unknown>): CodeData {
  return {
    language:
      typeof content.language === 'string' && content.language ? content.language : undefined,
    code: typeof content.code === 'string' ? content.code : '',
  };
}

export type CostTableItem = {
  name: string;
  spec?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
};

export type CostTableData = {
  title?: string;
  currency: string;
  items: CostTableItem[];
  note?: string;
  /** 헤더와 본문/합계 행을 표 형태로 계산해 둔 결과 */
  headers: string[];
  rows: string[][];
  total: number;
};

const COST_TABLE_HEADERS = ['항목', '규격', '수량', '단위', '단가', '금액'];

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function costTableData(content: Record<string, unknown>): CostTableData {
  const currency =
    typeof content.currency === 'string' && content.currency ? content.currency : '원';
  const items: CostTableItem[] = Array.isArray(content.items)
    ? (content.items as Record<string, unknown>[]).map((it) => ({
        name: typeof it.name === 'string' ? it.name : '',
        spec: typeof it.spec === 'string' && it.spec ? it.spec : undefined,
        quantity: num(it.quantity),
        unit: typeof it.unit === 'string' && it.unit ? it.unit : undefined,
        unitPrice: num(it.unitPrice),
      }))
    : [];
  let total = 0;
  const rows: string[][] = items.map((it) => {
    const amount = it.quantity * it.unitPrice;
    total += amount;
    return [
      it.name,
      it.spec ?? '',
      it.quantity.toLocaleString('ko-KR'),
      it.unit ?? '',
      it.unitPrice.toLocaleString('ko-KR'),
      amount.toLocaleString('ko-KR'),
    ];
  });
  rows.push(['합계', '', '', '', '', total.toLocaleString('ko-KR')]);
  return {
    title: typeof content.title === 'string' && content.title ? content.title : undefined,
    currency,
    items,
    note: typeof content.note === 'string' && content.note ? content.note : undefined,
    headers: COST_TABLE_HEADERS,
    rows,
    total,
  };
}

export type ConstructionDetailData = {
  title?: string;
  imageUrl?: string;
  imagePrompt?: string;
  steps: string[];
  notes?: string;
};

export function constructionDetailData(
  content: Record<string, unknown>,
): ConstructionDetailData {
  return {
    title: typeof content.title === 'string' && content.title ? content.title : undefined,
    imageUrl:
      typeof content.imageUrl === 'string' && content.imageUrl ? content.imageUrl : undefined,
    imagePrompt:
      typeof content.imagePrompt === 'string' && content.imagePrompt
        ? content.imagePrompt
        : undefined,
    steps: Array.isArray(content.steps)
      ? (content.steps as unknown[]).filter((s): s is string => typeof s === 'string')
      : [],
    notes: typeof content.notes === 'string' && content.notes ? content.notes : undefined,
  };
}

function optStr(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

export type RichTextData = { text: string; format?: string };

export function richTextData(content: Record<string, unknown>): RichTextData {
  return {
    text: typeof content.text === 'string' ? content.text : '',
    format: optStr(content.format),
  };
}

export type GalleryImage = { url?: string; caption?: string; prompt?: string };

export type ImageGalleryData = { title?: string; images: GalleryImage[] };

export function imageGalleryData(content: Record<string, unknown>): ImageGalleryData {
  return {
    title: optStr(content.title),
    images: Array.isArray(content.images)
      ? (content.images as Record<string, unknown>[]).map((img) => ({
          url: optStr(img.url),
          caption: optStr(img.caption),
          prompt: optStr(img.prompt),
        }))
      : [],
  };
}

export type BeforeAfterImage = { url?: string; label: string; prompt?: string };

export type BeforeAfterData = {
  title?: string;
  before: BeforeAfterImage;
  after: BeforeAfterImage;
};

function beforeAfterImage(value: unknown, fallbackLabel: string): BeforeAfterImage {
  const v = (value ?? {}) as Record<string, unknown>;
  return {
    url: optStr(v.url),
    label: typeof v.label === 'string' && v.label ? v.label : fallbackLabel,
    prompt: optStr(v.prompt),
  };
}

export function beforeAfterData(content: Record<string, unknown>): BeforeAfterData {
  return {
    title: optStr(content.title),
    before: beforeAfterImage(content.before, '시공 전'),
    after: beforeAfterImage(content.after, '시공 후'),
  };
}

export type DiagramData = { title?: string; source: string; imageUrl?: string };

export function diagramData(content: Record<string, unknown>): DiagramData {
  return {
    title: optStr(content.title),
    source: typeof content.source === 'string' ? content.source : '',
    imageUrl: optStr(content.imageUrl),
  };
}

export type ConstructionStandardClause = { no?: string; text: string };

export type ConstructionStandardData = {
  title?: string;
  standardCode?: string;
  clauses: ConstructionStandardClause[];
};

export function constructionStandardData(
  content: Record<string, unknown>,
): ConstructionStandardData {
  return {
    title: optStr(content.title),
    standardCode: optStr(content.standardCode),
    clauses: Array.isArray(content.clauses)
      ? (content.clauses as Record<string, unknown>[]).map((cl) => ({
          no: optStr(cl.no),
          text: typeof cl.text === 'string' ? cl.text : '',
        }))
      : [],
  };
}

/** construction_standard 조항을 "{no}. {text}" 라벨로 변환 */
export function constructionStandardHeading(data: ConstructionStandardData): string {
  return [data.title ?? '시공 표준', data.standardCode ? `(${data.standardCode})` : '']
    .filter(Boolean)
    .join(' ');
}

export type MaterialSpecData = {
  material: string;
  headers: string[];
  rows: string[][];
};

const MATERIAL_SPEC_HEADERS = ['항목', '값'];

export function materialSpecData(content: Record<string, unknown>): MaterialSpecData {
  const specs = Array.isArray(content.specs)
    ? (content.specs as Record<string, unknown>[])
    : [];
  return {
    material: typeof content.material === 'string' ? content.material : '',
    headers: MATERIAL_SPEC_HEADERS,
    rows: specs.map((s) => [
      typeof s.key === 'string' ? s.key : '',
      typeof s.value === 'string' ? s.value : '',
    ]),
  };
}

export type ScheduleData = { title?: string; headers: string[]; rows: string[][] };

const SCHEDULE_HEADERS = ['공정', '시작', '종료', '담당'];

export function scheduleData(content: Record<string, unknown>): ScheduleData {
  const items = Array.isArray(content.items)
    ? (content.items as Record<string, unknown>[])
    : [];
  return {
    title: optStr(content.title),
    headers: SCHEDULE_HEADERS,
    rows: items.map((it) => [
      typeof it.task === 'string' ? it.task : '',
      typeof it.start === 'string' ? it.start : '',
      typeof it.end === 'string' ? it.end : '',
      typeof it.owner === 'string' ? it.owner : '',
    ]),
  };
}

export type RiskWarningData = {
  severity: string;
  severityLabel: string;
  title?: string;
  risk: string;
  mitigation?: string;
};

export const RISK_SEVERITY_LABELS: Record<string, string> = {
  low: '낮음',
  medium: '보통',
  high: '높음',
};

export function riskWarningData(content: Record<string, unknown>): RiskWarningData {
  const severity = typeof content.severity === 'string' ? content.severity : 'low';
  return {
    severity,
    severityLabel: RISK_SEVERITY_LABELS[severity] ?? severity,
    title: optStr(content.title),
    risk: typeof content.risk === 'string' ? content.risk : '',
    mitigation: optStr(content.mitigation),
  };
}

export type SeoMetaData = {
  title?: string;
  description?: string;
  keywords: string[];
  slug?: string;
};

export function seoMetaData(content: Record<string, unknown>): SeoMetaData {
  return {
    title: optStr(content.title),
    description: optStr(content.description),
    keywords: Array.isArray(content.keywords)
      ? (content.keywords as unknown[]).filter((k): k is string => typeof k === 'string')
      : [],
    slug: optStr(content.slug),
  };
}

/** seo_meta를 라벨/값 쌍으로 변환 (빈 값은 생략) */
export function seoMetaEntries(data: SeoMetaData): [string, string][] {
  const entries: [string, string][] = [];
  if (data.title) entries.push(['SEO 제목', data.title]);
  if (data.description) entries.push(['설명', data.description]);
  if (data.keywords.length > 0) entries.push(['키워드', data.keywords.join(', ')]);
  if (data.slug) entries.push(['슬러그', data.slug]);
  return entries;
}

export type BlogSectionData = { heading: string; body: string };

export function blogSectionData(content: Record<string, unknown>): BlogSectionData {
  return {
    heading: typeof content.heading === 'string' ? content.heading : '',
    body: typeof content.body === 'string' ? content.body : '',
  };
}

export type TechnicalSectionData = {
  heading: string;
  body: string;
  references: string[];
};

export function technicalSectionData(content: Record<string, unknown>): TechnicalSectionData {
  return {
    heading: typeof content.heading === 'string' ? content.heading : '',
    body: typeof content.body === 'string' ? content.body : '',
    references: Array.isArray(content.references)
      ? (content.references as unknown[]).filter((r): r is string => typeof r === 'string')
      : [],
  };
}

export type OntologySummaryData = { title: string; nodes: string[] };

export function ontologySummaryData(content: Record<string, unknown>): OntologySummaryData {
  return {
    title: typeof content.title === 'string' ? content.title : '',
    nodes: Array.isArray(content.nodes)
      ? (content.nodes as unknown[]).filter((n): n is string => typeof n === 'string')
      : [],
  };
}
