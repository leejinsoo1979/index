/**
 * 법규/시공(공법) 질문 감지 helper.
 * 이 의도로 분류된 질문은 citation 없는 확답이 금지된다 (CLAUDE.md 규칙 4).
 */

const LEGAL_KEYWORDS = [
  '법규',
  '법령',
  '법적',
  '건축법',
  '소방법',
  '소방시설',
  '주차장법',
  '허가',
  '신고',
  '용적률',
  '건폐율',
  '방화',
  '내화',
  '피난',
  '대피',
  '준공',
  '용도변경',
  '증축',
  '규정',
  '기준',
];

const CONSTRUCTION_KEYWORDS = [
  '시공법',
  '공법',
  '방수',
  '단열',
  '결로',
  '철거',
  '배관',
  '전기 증설',
  '담수',
  '미장',
  '타일 시공',
  '하자',
  '시방서',
];

export type QuestionIntent = 'legal' | 'construction_detail' | 'general';

export function detectQuestionIntent(message: string): QuestionIntent {
  if (LEGAL_KEYWORDS.some((k) => message.includes(k))) return 'legal';
  if (CONSTRUCTION_KEYWORDS.some((k) => message.includes(k))) return 'construction_detail';
  return 'general';
}

/** 법규/공법 질문 여부 (citation 필수 대상) */
export function requiresCitation(message: string): boolean {
  return detectQuestionIntent(message) !== 'general';
}
