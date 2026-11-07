import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { loadEnvironment } from '../server/wiki/env.mjs';
loadEnvironment();
const root = resolve(process.env.INDEX_KNOWLEDGE_DIR || '.index-knowledge');
const home = join(root, 'mercury');
mkdirSync(home, { recursive: true, mode: 0o700 });
mkdirSync(join(home, 'soul'), { recursive: true });
const config = {
  identity: { name: 'INDEX 지식 운영 에이전트', owner: 'INDEX', about: '주거 실내건축 전문가 집단 INDEX의 지식 수집 상태와 위키 처리 작업을 관리합니다.' },
  providers: { default: 'openaiCompat' },
  cloud: { enabled: false },
  web: { enabled: true, port: Number(process.env.INDEX_MERCURY_PORT || 6174) },
  tokens: { dailyBudget: 100000 },
  memory: { secondBrain: { enabled: false }, collaborativeKnowledge: { shareLearning: false, poolSearch: false } },
  heartbeat: { intervalMinutes: 60 },
  subagents: { enabled: false, maxConcurrent: 0, mode: 'manual' },
  mcp: { servers: { 'index-knowledge': { transport: 'stdio', command: process.execPath, args: [resolve('server/wiki/mcp.mjs')], cwd: process.cwd(), env: { INDEX_KNOWLEDGE_DIR: root, INDEX_WIKI_URL: process.env.INDEX_WIKI_URL || 'http://127.0.0.1:5318' }, enabled: true, timeoutMs: 600000, tools: { allow: ['wiki_status', 'wiki_search', 'wiki_process_pending'], autoApprove: ['wiki_status', 'wiki_search', 'wiki_process_pending'] } } } },
};
// Configuration contains no credentials. The approved existing AI settings are inherited only in process memory.
writeFileSync(join(home, 'mercury.yaml'), JSON.stringify(config, null, 2), { mode: 0o600 });
const instructions = '당신은 INDEX의 지식 운영 에이전트입니다. INDEX는 주거 실내건축 전문가들의 정보 교류·공간 혁신·문제 해결 집단입니다. INDEX 지식 상태와 자료를 확인할 때 반드시 index-knowledge MCP 도구를 사용하세요. 위키 생성은 wiki_process_pending에 맡기고 직접 파일을 만들거나 수정하지 마세요. 모든 자료·출처·활동·수정 이력은 INDEX 지식 서버가 보존합니다. 내장 기억이나 대화 요약을 지식 정본으로 취급하지 마세요. 원본 삭제, 외부 메시지 전송, Git 변경, 서버 설정 변경을 하지 마세요. 작업 완료는 실제 도구 결과로 확인한 경우에만 보고하세요. 한국어 존댓말로 답하세요.';
for (const name of ['soul.md', 'persona.md']) if (!existsSync(join(home, 'soul', name))) writeFileSync(join(home, 'soul', name), instructions);
if (!existsSync(join(home, 'soul', 'heartbeat.md'))) writeFileSync(join(home, 'soul', 'heartbeat.md'), '정기 점검에서는 wiki_status로 실제 상태를 확인하세요. queued 작업이 있고 위키 서버 worker가 idle이면 wiki_process_pending으로 다음 자료 처리를 요청하세요. running 작업은 중복 실행하지 마세요. 실패·내보내기 오류가 있으면 원본 보존 상태와 오류를 관리자 대화에 기록하세요. 외부 채널로 메시지를 보내거나 파일을 직접 수정하지 마세요.');
const binary = resolve('services/mercury/node_modules/@cosmicstack/mercury-agent/dist/index.js');
if (!existsSync(binary)) throw new Error('npm ci --prefix services/mercury --ignore-scripts 실행이 필요합니다.');
const env = { ...process.env, MERCURY_HOME: home, OPENAI_COMPAT_ENABLED: 'true', OPENAI_COMPAT_BASE_URL: process.env.WIKI_LLM_BASE_URL || process.env.CHAT_LLM_BASE_URL || 'https://api.openai.com/v1', OPENAI_COMPAT_MODEL: process.env.WIKI_LLM_MODEL || process.env.CHAT_LLM_MODEL || process.env.OPENAI_MODEL || 'gpt-5.4-mini', OPENAI_COMPAT_API_KEY: process.env.WIKI_LLM_API_KEY || process.env.CHAT_LLM_API_KEY || process.env.OPENAI_API_KEY || 'local' };
const child = spawn(process.execPath, [binary, ...(process.argv.slice(2).length ? process.argv.slice(2) : ['start', '--daemon'])], { env, stdio: 'inherit' });
child.on('exit', code => process.exit(code || 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
