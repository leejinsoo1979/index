/** Search Provider Adapter (ARCHITECTURE.md 6.2) */

export type SearchSourceType = 'official_law' | 'kcsc' | 'web' | 'knowledge_base';

export type SearchResult = {
  id: string;
  title: string;
  sourceType: SearchSourceType;
  publisher: string;
  url: string;
  snippet: string;
  retrievedAt: string;
};

export type SearchOptions = {
  sourceTypes?: SearchSourceType[];
  limit?: number;
};

export interface SearchProvider {
  readonly name: string;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}
