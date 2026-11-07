import { MockSearchProvider, type SearchOptions, type SearchProvider, type SearchResult } from '@archi/ai';
import { callArchiServer, getServerStatus } from './server-proxy';

/**
 * SearchProvider backed by the public regulation APIs (법제처 법령·해석례, 건축물대장,
 * 토지이용규제, KDS/KCS) through api/archi-llm → api/_regulations.ts, where the API keys live.
 */
export class ServerRegulationSearchProvider implements SearchProvider {
  readonly name = 'public-regulation';

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    let results: SearchResult[];
    try {
      ({ results } = await callArchiServer<{ results: SearchResult[] }>('regulation-search', {
        query,
        limit: options?.limit ?? 8,
      }));
    } catch (error) {
      // No made-up sources on failure: an empty result keeps the agent's "no citation, no firm answer" rule.
      console.warn('[archi] regulation search failed', error);
      return [];
    }
    return options?.sourceTypes?.length ? results.filter((r) => options.sourceTypes!.includes(r.sourceType)) : results;
  }
}

/**
 * Real search when the server has regulation API keys; otherwise the original's mock
 * provider (same fallback rule as the LLM: plain `vite` dev without the functions → mock).
 */
export async function getSearchProvider(): Promise<SearchProvider> {
  const status = await getServerStatus();
  return status.available && status.regulationSearch ? new ServerRegulationSearchProvider() : new MockSearchProvider();
}
