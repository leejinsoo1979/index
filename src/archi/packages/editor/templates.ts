import type { BlockInput } from './blocks';

/**
 * 문서 유형별 블록 템플릿 (제안서: 문서 유형 선택 시 AI가 문서코드/목차/블록 구조 자동 제안).
 * 문서 생성 시 withTemplate 옵션으로 초기 블록 구조를 구성한다.
 */

export type DocumentTypeKey =
  | 'BLOG_POST'
  | 'PROPOSAL'
  | 'REPORT'
  | 'SNS_CAPTION'
  | 'KNOWLEDGE_NOTE';

export const DOCUMENT_TYPE_LABELS: Record<DocumentTypeKey, string> = {
  BLOG_POST: '블로그',
  PROPOSAL: '제안서',
  REPORT: '기술자료/보고서',
  SNS_CAPTION: 'SNS 캡션',
  KNOWLEDGE_NOTE: '지식 노트',
};

export const documentTemplates: Record<DocumentTypeKey, BlockInput[]> = {
  BLOG_POST: [
    { type: 'heading', content: { level: 1, text: '' } },
    { type: 'image', content: { url: '', caption: '대표 이미지' } },
    { type: 'paragraph', content: { text: '', tone: 'professional' } },
    { type: 'heading', content: { level: 2, text: '시공 포인트' } },
    { type: 'checklist', content: { title: '핵심 체크리스트', items: [{ text: '', checked: false }] } },
    { type: 'paragraph', content: { text: '' } },
    { type: 'cta', content: { text: '', buttonLabel: '무료 상담 신청', url: '' } },
  ],
  PROPOSAL: [
    {
      type: 'doc_meta',
      content: { docCode: '', version: 'v1.0', author: '', publishedAt: '', reviewStatus: 'draft' },
    },
    { type: 'heading', content: { level: 1, text: '' } },
    { type: 'paragraph', content: { text: '제안 개요를 작성하세요.' } },
    { type: 'heading', content: { level: 2, text: '제안 범위' } },
    { type: 'table', content: { title: '제안 범위', headers: ['구분', '내용', '비고'], rows: [['', '', '']] } },
    { type: 'heading', content: { level: 2, text: '예상 비용' } },
    {
      type: 'chart',
      content: {
        chartType: 'pie',
        title: '공정별 비용 비중',
        labels: ['철거', '설비', '목공', '마감'],
        series: [{ name: '비용', values: [0, 0, 0, 0] }],
      },
    },
    { type: 'cta', content: { text: '', buttonLabel: '계약 문의', url: '' } },
  ],
  REPORT: [
    {
      type: 'doc_meta',
      content: { docCode: '', version: 'v1.0', author: '', publishedAt: '', reviewStatus: 'draft' },
    },
    { type: 'heading', content: { level: 1, text: '' } },
    { type: 'paragraph', content: { text: '문제 정의와 적용 범위를 작성하세요.' } },
    { type: 'heading', content: { level: 2, text: '법규·기준' } },
    { type: 'source_reference', content: { title: '관련 법규 검토', summary: '', citations: [] } },
    { type: 'heading', content: { level: 2, text: '계산 기준' } },
    { type: 'formula', content: { title: '', expression: '', variables: [], result: '' } },
    { type: 'heading', content: { level: 2, text: '기준표' } },
    { type: 'table', content: { title: '', headers: ['항목', '기준', '비고'], rows: [['', '', '']] } },
    { type: 'heading', content: { level: 2, text: '시공 절차' } },
    { type: 'checklist', content: { title: '시공 체크리스트', items: [{ text: '', checked: false }] } },
    { type: 'qna', content: { title: '현장 Q&A', items: [{ question: '', answer: '', basis: '' }] } },
  ],
  SNS_CAPTION: [
    { type: 'paragraph', content: { text: '', tone: 'casual' } },
    { type: 'image', content: { url: '', caption: '' } },
    { type: 'cta', content: { text: '', buttonLabel: '프로필 링크', url: '' } },
  ],
  KNOWLEDGE_NOTE: [
    { type: 'heading', content: { level: 1, text: '' } },
    { type: 'paragraph', content: { text: '핵심 개념을 정리하세요.' } },
    { type: 'qna', content: { title: '현장 Q&A', items: [{ question: '', answer: '', basis: '' }] } },
    { type: 'source_reference', content: { title: '출처', summary: '', citations: [] } },
  ],
};

export function getTemplateBlocks(type: DocumentTypeKey): BlockInput[] {
  return documentTemplates[type] ?? [];
}

/* ────────────────────────────────────────────────────────────────────────
 * 전문 템플릿 (9종) — container 기반 구조화 문서.
 * 컨테이너 노드는 children으로 자식 블록을 가지며, 생성 시 parentId로 연결된다.
 * ──────────────────────────────────────────────────────────────────────── */

export type TemplateNode = BlockInput & { children?: BlockInput[] };

export type ProfessionalTemplate = {
  id: string;
  label: string;
  description: string;
  documentType: DocumentTypeKey;
  nodes: TemplateNode[];
};

const h = (level: number, text: string): BlockInput => ({ type: 'heading', content: { level, text } });
const p = (text: string): BlockInput => ({ type: 'paragraph', content: { text } });
const container = (title: string, children: BlockInput[]): TemplateNode => ({
  type: 'container',
  content: { title },
  children,
});

export const professionalTemplates: ProfessionalTemplate[] = [
  {
    id: 'blog-construction-case',
    label: '네이버 블로그 시공사례',
    description: '대표 이미지 + 비포/애프터 + 시공 포인트 + 상담 CTA',
    documentType: 'BLOG_POST',
    nodes: [
      h(1, '34평 아파트 거실 리모델링 시공사례'),
      { type: 'image', content: { caption: '시공 후 거실', prompt: '모던하고 따뜻한 거실 인테리어 렌더' } },
      p('의뢰 배경과 공간의 문제점을 간단히 소개하세요.'),
      container('시공 포인트', [
        h(2, '디자인 포인트'),
        { type: 'checklist', content: { title: '핵심 포인트', items: [
          { text: '우드 템바보드 + 간접조명 포인트 벽면', checked: false },
          { text: '대형 아트월로 고급스러운 분위기', checked: false },
        ] } },
        { type: 'image', content: { caption: '포인트 벽면', prompt: '간접조명 우드 포인트 벽' } },
      ]),
      { type: 'cta', content: { text: '무료 현장 실측 상담', buttonLabel: '상담 신청', url: '' } },
    ],
  },
  {
    id: 'interior-tech-doc',
    label: '인테리어 기술자료',
    description: '개요 + 법규/계산/표/상세도 컨테이너 구조',
    documentType: 'REPORT',
    nodes: [
      { type: 'doc_meta', content: { docCode: 'ARC-TEC-001', version: 'v1.0', reviewStatus: 'draft' } },
      h(1, '단열두께 설계 기준 기술자료'),
      p('적용 범위와 목적을 작성하세요.'),
      container('단열두께 설계 기준', [
        p('개요: 지역·부위별 단열 성능 기준 정리'),
        { type: 'law_reference', content: { law: '건축물의 에너지절약설계기준', article: '제2조', summary: '' } },
        { type: 'formula', content: { title: '열관류율', expression: 'U = 1 / Rtotal', variables: [
          { symbol: 'U', meaning: '열관류율', unit: 'W/m²K' }, { symbol: 'Rtotal', meaning: '전체 열저항', unit: 'm²K/W' },
        ], result: '' } },
        { type: 'table', content: { title: '지역별 열관류율 기준', headers: ['지역', '외벽', '지붕', '바닥'], rows: [['중부1', '', '', '']] } },
        { type: 'construction_detail', content: { title: '결로방지 상세', steps: ['바탕면 정리', '단열재 부착', '기밀 테이프 마감'], notes: '열교 부위 이격 주의' } },
      ]),
      { type: 'qna', content: { title: '현장 Q&A', items: [{ question: '', answer: '', basis: '' }] } },
      { type: 'source_reference', content: { title: '출처', summary: '', citations: [] } },
    ],
  },
  {
    id: 'construction-standard',
    label: '시공기준서',
    description: '공종별 시공 절차 + 품질 기준 + 체크리스트',
    documentType: 'REPORT',
    nodes: [
      { type: 'doc_meta', content: { docCode: 'ARC-STD-001', version: 'v1.0', reviewStatus: 'draft' } },
      h(1, '도장 공사 시공기준서'),
      container('시공 절차', [
        { type: 'construction_detail', content: { title: '표준 시공 절차', steps: ['바탕 처리', '프라이머', '중도', '상도'], notes: '온습도 조건 준수' } },
        { type: 'callout', content: { variant: 'warning', title: '주의', text: '도막 두께·건조 시간 준수' } },
      ]),
      container('품질 기준', [
        { type: 'table', content: { title: '품질 기준', headers: ['항목', '기준', '검사 방법'], rows: [['도막두께', '', '']] } },
        { type: 'checklist', content: { title: '준공 체크리스트', items: [{ text: '도막 균일성 확인', checked: false }] } },
      ]),
    ],
  },
  {
    id: 'law-commentary',
    label: '법규해설서',
    description: '조문 인용 + 해설 + 적용 사례',
    documentType: 'REPORT',
    nodes: [
      h(1, '방화구획 법규 해설'),
      container('관련 법규', [
        { type: 'law_reference', content: { law: '건축법 시행령', article: '제46조', summary: '방화구획 설치 기준' } },
        p('조문 해설을 작성하세요.'),
        { type: 'callout', content: { variant: 'info', title: '적용 사례', text: '' } },
      ]),
      { type: 'qna', content: { title: '자주 묻는 질문', items: [{ question: '', answer: '', basis: '' }] } },
      { type: 'source_reference', content: { title: '법제처 원문', summary: '', citations: [] } },
    ],
  },
  {
    id: 'client-proposal',
    label: '고객 제안서',
    description: '제안 개요 + 범위표 + 비용 차트 + CTA',
    documentType: 'PROPOSAL',
    nodes: [
      { type: 'doc_meta', content: { docCode: 'ARC-PRP-001', version: 'v1.0', reviewStatus: 'draft' } },
      h(1, '인테리어 리모델링 제안서'),
      p('제안 개요와 고객 니즈를 요약하세요.'),
      container('제안 내용', [
        h(2, '제안 범위'),
        { type: 'table', content: { title: '제안 범위', headers: ['구분', '내용', '비고'], rows: [['', '', '']] } },
        h(2, '예상 비용'),
        { type: 'chart', content: { chartType: 'pie', title: '공정별 비용 비중', labels: ['철거', '설비', '목공', '마감'], series: [{ name: '비용', values: [0, 0, 0, 0] }] } },
      ]),
      { type: 'cta', content: { text: '계약 문의', buttonLabel: '문의하기', url: '' } },
    ],
  },
  {
    id: 'material-comparison',
    label: '자재 비교표 문서',
    description: '자재 후보 비교표 + 추천 근거',
    documentType: 'REPORT',
    nodes: [
      h(1, '바닥재 자재 비교'),
      container('자재 비교', [
        { type: 'table', content: { title: '자재 비교표', headers: ['자재', '내구성', '단가', '시공성', '비고'], rows: [['강마루', '', '', '', '']] } },
        { type: 'callout', content: { variant: 'tip', title: '추천', text: '용도·예산 기준 추천 근거를 작성하세요.' } },
      ]),
      { type: 'source_reference', content: { title: '제조사 사양', summary: '', citations: [] } },
    ],
  },
  {
    id: 'defect-analysis',
    label: '하자 분석 보고서',
    description: '하자 현상 + 원인 분석 + 보수 방안',
    documentType: 'REPORT',
    nodes: [
      { type: 'doc_meta', content: { docCode: 'ARC-DEF-001', version: 'v1.0', reviewStatus: 'draft' } },
      h(1, '결로·곰팡이 하자 분석 보고서'),
      container('하자 분석', [
        h(2, '현상'),
        { type: 'image', content: { caption: '하자 부위', prompt: '벽체 결로 곰팡이 사진' } },
        h(2, '원인'),
        p('열교·환기 부족 등 원인을 분석하세요.'),
        h(2, '보수 방안'),
        { type: 'construction_detail', content: { title: '보수 절차', steps: ['오염 제거', '방수·단열 보강', '마감'], notes: '' } },
      ]),
      { type: 'qna', content: { title: '현장 Q&A', items: [{ question: '', answer: '', basis: '' }] } },
    ],
  },
  {
    id: 'schedule-doc',
    label: '공정표 문서',
    description: '공정별 일정 표 + 마일스톤',
    documentType: 'REPORT',
    nodes: [
      h(1, '리모델링 공정표'),
      container('공정 계획', [
        { type: 'table', content: { title: '공정표', headers: ['공정', '시작', '종료', '비고'], rows: [['철거', '', '', '']] } },
        { type: 'checklist', content: { title: '마일스톤', items: [{ text: '착공', checked: false }, { text: '준공', checked: false }] } },
      ]),
    ],
  },
  {
    id: 'estimate-doc',
    label: '견적 설명 문서',
    description: '견적표(수량·단가·합계) + 설명',
    documentType: 'PROPOSAL',
    nodes: [
      { type: 'doc_meta', content: { docCode: 'ARC-EST-001', version: 'v1.0', reviewStatus: 'draft' } },
      h(1, '거실 리모델링 견적 설명'),
      container('견적 내역', [
        { type: 'cost_table', content: { title: '견적 내역', currency: '원', items: [
          { name: '철거', spec: '', quantity: 1, unit: '식', unitPrice: 0 },
          { name: '목공', spec: '', quantity: 1, unit: '식', unitPrice: 0 },
        ] } },
        { type: 'callout', content: { variant: 'info', title: '비고', text: '부가세 별도 등 조건을 명시하세요.' } },
      ]),
      { type: 'cta', content: { text: '견적 문의', buttonLabel: '문의하기', url: '' } },
    ],
  },
];

/** 컨테이너 children을 펼쳐 (block, parentIndex) 플랫 목록으로 변환 — parentIndex는 같은 배열 내 컨테이너 위치 */
export function flattenTemplate(
  nodes: TemplateNode[],
): { block: BlockInput; parentIndex: number | null }[] {
  const out: { block: BlockInput; parentIndex: number | null }[] = [];
  for (const node of nodes) {
    const { children, ...block } = node;
    const idx = out.length;
    out.push({ block: block as BlockInput, parentIndex: null });
    for (const child of children ?? []) {
      out.push({ block: child, parentIndex: idx });
    }
  }
  return out;
}

export function getProfessionalTemplate(id: string): ProfessionalTemplate | undefined {
  return professionalTemplates.find((t) => t.id === id);
}

export function listProfessionalTemplates(): { id: string; label: string; description: string }[] {
  return professionalTemplates.map((t) => ({ id: t.id, label: t.label, description: t.description }));
}
