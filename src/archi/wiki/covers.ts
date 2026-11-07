/** Generated editorial photographs are representative imagery, never source evidence. */
export const WIKI_COVERS = {
  waterproofing: { label: '방수·누수', alt: '욕실 바닥과 벽체 접합부에 방수층을 도포하는 장면' },
  'tile-defect': { label: '타일·마감 하자', alt: '들뜬 바닥 타일 아래 접착층과 바탕면을 점검하는 장면' },
  condensation: { label: '결로·단열', alt: '창가 유리의 결로와 창틀 주변 습기를 보여주는 장면' },
  'site-inspection': { label: '현장 점검', alt: '아파트 시공 현장에서 열화상 장비로 창가를 점검하는 장면' },
  materials: { label: '자재·사양', alt: '석재와 목재, 금속, 타일 등 실내건축 자재 샘플' },
  standards: { label: '도면·시공 기준', alt: '건축 상세 도면과 스케일자를 놓고 접합부를 검토하는 장면' },
  interior: { label: '공간·인테리어', alt: '목재 바닥과 밝은 벽체의 접합부가 드러나는 아파트 거실' },
} as const;

export type WikiCoverKey = keyof typeof WIKI_COVERS;
export type WikiCoverChoice = WikiCoverKey | 'auto';

export function coverForPage(page: { title: string; category: string; tags: string[]; cover?: WikiCoverChoice }): WikiCoverKey {
  if (page.cover && page.cover !== 'auto' && Object.hasOwn(WIKI_COVERS, page.cover)) return page.cover;
  const match = (text: string): WikiCoverKey | null => {
    if (/타일|들뜸|박리|마감.*하자/.test(text)) return 'tile-defect';
    if (/결로|곰팡이|단열|열교/.test(text)) return 'condensation';
    if (/방수|누수|욕실|배수/.test(text)) return 'waterproofing';
    if (/법규|법령|규정|기준|인허가|방화/.test(text)) return 'standards';
    if (/자재|사양|샘플|석재|목재|금속/.test(text)) return 'materials';
    if (/점검|현장|검사|검측|진단/.test(text)) return 'site-inspection';
    return null;
  };
  return match(page.title) || match(page.tags.join(' ')) || ({ '공법': 'waterproofing', '하자': 'tile-defect', '공간': 'interior', '자재': 'materials', '법규·기준': 'standards', '현장 기록': 'site-inspection' } as Record<string, WikiCoverKey>)[page.category] || 'interior';
}

export function wikiCoverImage(key: WikiCoverKey) {
  const base = '/images/wiki/' + key;
  return { src: base + '-960-v1.jpg', srcSet: base + '-480-v1.jpg 480w, ' + base + '-960-v1.jpg 960w', alt: WIKI_COVERS[key].alt + ' · AI 생성 대표 이미지' };
}
