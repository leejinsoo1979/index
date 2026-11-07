import type { SearchOptions, SearchProvider, SearchResult } from './search-provider';

/**
 * Mock 검색 provider. 실제 법령 API/KCSC/웹검색 어댑터로 교체 가능하다.
 * 'NO_RESULTS' 가 포함된 질의는 빈 결과를 반환한다 (citation 없는 답변 차단 테스트용).
 */
export class MockSearchProvider implements SearchProvider {
  readonly name = 'mock';

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    if (query.includes('NO_RESULTS')) return [];

    const now = new Date().toISOString();
    const all: SearchResult[] = [
      {
        id: 'src_law_1',
        title: '건축법 시행령 제46조(방화구획 등의 설치)',
        sourceType: 'official_law',
        publisher: '법제처 국가법령정보센터',
        url: 'https://www.law.go.kr/법령/건축법시행령',
        snippet:
          '주요구조부가 내화구조 또는 불연재료로 된 건축물로서 연면적이 1천 제곱미터를 넘는 것은 방화구획을 하여야 한다.',
        retrievedAt: now,
      },
      {
        id: 'src_kcsc_1',
        title: 'KCS 41 40 00 방수공사 표준시방서',
        sourceType: 'kcsc',
        publisher: '국가건설기준센터(KCSC)',
        url: 'https://www.kcsc.re.kr/',
        snippet:
          '욕실 방수층 시공 후 담수시험은 최소 24시간 이상 실시하며, 누수 여부를 확인한 후 후속 공정을 진행한다.',
        retrievedAt: now,
      },
      {
        id: 'src_law_2',
        title: '소방시설 설치 및 관리에 관한 법률 시행령',
        sourceType: 'official_law',
        publisher: '법제처 국가법령정보센터',
        url: 'https://www.law.go.kr/법령/소방시설법시행령',
        snippet: '특정소방대상물의 용도변경 시 소방시설의 설치 기준을 다시 적용한다.',
        retrievedAt: now,
      },
    ];

    const filtered = options?.sourceTypes
      ? all.filter((r) => options.sourceTypes?.includes(r.sourceType))
      : all;
    return filtered.slice(0, options?.limit ?? 5);
  }
}
