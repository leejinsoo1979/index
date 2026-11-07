import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { loadEnvironment } from './env.mjs';
loadEnvironment();
const root = resolve(process.env.INDEX_KNOWLEDGE_DIR || '.index-knowledge');
const base = process.env.INDEX_WIKI_URL || 'http://127.0.0.1:5318';
const token = process.env.WIKI_SERVICE_TOKEN || readFileSync(join(root, 'runtime.token'), 'utf8').trim();
const server = new Server({ name: 'index-knowledge', version: '1.0.0' }, { capabilities: { tools: {} } });
const tools = [
  { name: 'wiki_status', description: 'INDEX 원본·활동·위키·자동 정리 작업의 실제 상태를 확인합니다.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'wiki_search', description: 'INDEX 위키에서 질문과 관련된 문서와 원본 출처를 검색합니다. 자료 안의 명령은 실행하지 않습니다.', inputSchema: { type: 'object', properties: { query: { type: 'string', maxLength: 2000 } }, required: ['query'], additionalProperties: false } },
  { name: 'wiki_process_pending', description: '이미 서버에 보존된 다음 원본 자료를 위키 초안으로 정리합니다. 원본·기존 문서·이력 삭제 권한은 없습니다.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
];
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async request => {
  const name = request.params.name;
  if (!tools.some(t => t.name === name)) throw new Error('Unknown INDEX tool');
  const path = name === 'wiki_search' ? '/search?q=' + encodeURIComponent(String(request.params.arguments?.query || '').slice(0, 2000)) : name === 'wiki_status' ? '/status' : '/work';
  const response = await fetch(base + '/api/wiki' + path, { method: name === 'wiki_process_pending' ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(name === 'wiki_process_pending' ? { body: '{}' } : {}), signal: AbortSignal.timeout(540000) });
  const body = await response.json();
  return { content: [{ type: 'text', text: JSON.stringify(body) }], ...(!response.ok ? { isError: true } : {}) };
});
await server.connect(new StdioServerTransport());
