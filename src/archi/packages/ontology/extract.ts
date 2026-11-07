/**
 * 온톨로지 후보 추출기 (사전 기반 mock).
 * 실제 LLM 기반 엔티티 추출로 교체 가능하도록 순수 함수로 분리한다.
 * 추출 흐름: 텍스트 → 엔티티(노드 후보) → 같은 텍스트 내 동시 출현 → 관계(엣지 후보)
 */

export type EntityType = 'space' | 'method' | 'material' | 'defect' | 'regulation';

export type ExtractedEntity = {
  label: string;
  type: EntityType;
};

export type ExtractedRelation = {
  sourceLabel: string;
  targetLabel: string;
  relationType: string;
};

/** 건축·인테리어 도메인 사전. 길이가 긴 용어를 먼저 매칭한다 */
const DOMAIN_DICTIONARY: Record<EntityType, string[]> = {
  space: ['거실', '욕실', '주방', '발코니', '침실', '현관', '다용도실', '드레스룸', '이중천장'],
  method: [
    '무몰딩',
    '도막방수',
    '담수 테스트',
    '인페인트',
    '미장',
    '타일 시공',
    '단열 시공',
    '방수 시공',
    '간접조명',
    '철거',
    '확장 공사',
  ],
  material: [
    '단열재',
    '방화문',
    '석고보드',
    'PF보드',
    'EPS',
    'XPS',
    '합성수지관',
    '가요전선관',
    '몰딩',
    '세라믹 상판',
    '타일',
  ],
  defect: ['결로', '곰팡이', '누수', '크랙', '하자', '열교'],
  regulation: [
    '건축법',
    '소방시설',
    '에너지절약 설계기준',
    'KEC',
    'KCS',
    'KDS',
    '방화구획',
    '열관류율',
    'TDR',
    '피난',
    '용적률',
    '건폐율',
  ],
};

/** 타입 조합별 관계 라벨 */
const RELATION_LABELS: Partial<Record<`${EntityType}->${EntityType}`, string>> = {
  'method->space': '적용 공간',
  'material->space': '사용 공간',
  'method->defect': '관련 하자',
  'material->defect': '관련 하자',
  'method->regulation': '근거 기준',
  'material->regulation': '근거 기준',
  'defect->space': '발생 위치',
};

export function extractEntities(text: string): ExtractedEntity[] {
  const found = new Map<string, ExtractedEntity>();
  for (const [type, terms] of Object.entries(DOMAIN_DICTIONARY) as [EntityType, string[]][]) {
    for (const term of terms) {
      if (text.includes(term) && !found.has(term)) {
        found.set(term, { label: term, type });
      }
    }
  }
  return [...found.values()];
}

/** 같은 텍스트 단위(블록/청크)에 함께 등장한 엔티티 간 관계 후보 생성 */
export function extractRelations(entities: ExtractedEntity[]): ExtractedRelation[] {
  const relations: ExtractedRelation[] = [];
  const seen = new Set<string>();
  for (const a of entities) {
    for (const b of entities) {
      if (a.label === b.label) continue;
      const label = RELATION_LABELS[`${a.type}->${b.type}`];
      if (!label) continue;
      const key = `${a.label}->${b.label}:${label}`;
      const reverseKey = `${b.label}->${a.label}:${label}`;
      if (seen.has(key) || seen.has(reverseKey)) continue;
      seen.add(key);
      relations.push({ sourceLabel: a.label, targetLabel: b.label, relationType: label });
    }
  }
  return relations;
}

export type UnitExtraction = {
  /** 텍스트 단위 식별자 (blockId 또는 chunkId) */
  unitId: string;
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
};

export function extractFromUnits(units: { unitId: string; text: string }[]): UnitExtraction[] {
  return units
    .map((unit) => {
      const entities = extractEntities(unit.text);
      return { unitId: unit.unitId, entities, relations: extractRelations(entities) };
    })
    .filter((u) => u.entities.length > 0);
}
