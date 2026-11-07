import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync, createReadStream } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEnvironment } from './env.mjs';
import { WikiStore } from './store.mjs';
import { compileSource, answerQuestion, modelConfig, complete } from './llm.mjs';
import { legacyApi } from './legacy-api.mjs';
import { retrieve, reindex, scheduleReindex } from './retrieval/index.mjs';

loadEnvironment();
const safeEqual = (a, b) => typeof a === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function createWikiServer({ root = process.env.INDEX_KNOWLEDGE_DIR || '.index-knowledge', testAuth, call, worker = true } = {}) {
  const store = new WikiStore(root);
  if (worker) scheduleReindex(store, 1500);
  let active = false, stopped = false;
  const shutdown = new AbortController();
  const tick = async () => {
    if (active || stopped) return;
    active = true;
    try {
      store.flushExports();
      const job = store.claim();
      if (job) {
        const heartbeat = setInterval(() => store.db.prepare("UPDATE jobs SET lease_until=? WHERE id=? AND state='running'").run(Date.now() + 10 * 60 * 1000, job.id), 30000);
        try { store.finish(job.id, await compileSource(store, store.source(job.source_id), call || ((messages, json) => complete(messages, json, shutdown.signal)))); }
        catch (error) { store.fail(job, error); }
        finally { clearInterval(heartbeat); }
      }
    } finally { active = false; }
  };
  const interval = worker ? setInterval(() => void tick().catch(() => {}), 1500) : null;
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); };
  async function authorize(req) {
    const bearer = req.headers.authorization?.replace(/^Bearer /, '');
    if (safeEqual(bearer, process.env.WIKI_SERVICE_TOKEN || store.token)) return { uid: 'index-service', email: 'INDEX Server' };
    if (testAuth) return testAuth(req);
    const { requireAgentAdmin } = await import('../../api/_firebaseAdmin.ts');
    return requireAgentAdmin(req);
  }
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === '/api/wiki/health') return json(res, 200, { ok: true, service: 'index-knowledge', version: 1 });
    if (!url.pathname.startsWith('/api/wiki/')) {
      const api = url.pathname.match(/^\/api\/([a-z0-9-]+)\/?$/i);
      if (api) {
        try { await legacyApi(req, res, api[1]); } catch { if (!res.headersSent) json(res, 500, { error: 'API 요청 처리에 실패했습니다.' }); }
        return;
      }
      if (!process.env.WIKI_SERVE_WEB || req.method !== 'GET') return json(res, 404, { error: 'Not found' });
      const root = resolve('dist'), path = resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!path.startsWith(root + '/') && path !== root) return json(res, 400, { error: 'Invalid path' });
      const target = existsSync(path) && extname(path) ? path : join(root, 'index.html');
      if (!existsSync(target)) return json(res, 404, { error: 'Run npm run build first' });
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
      res.writeHead(200, { 'Content-Type': mime[extname(target)] || 'application/octet-stream' }); createReadStream(target).pipe(res); return;
    }
    let actor;
    try { actor = await authorize(req); } catch { return json(res, 401, { error: '관리자 로그인이 필요합니다.' }); }
    // Browser writes are same-origin only. Service callers use bearer authentication, never cookies.
    if (req.headers.origin) {
      try { if (new URL(req.headers.origin).host !== req.headers.host) return json(res, 403, { error: '허용되지 않은 요청 출처입니다.' }); } catch { return json(res, 403, { error: 'Invalid origin' }); }
    }
    try {
      let body = {};
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        let length = 0; const chunks = [];
        for await (const chunk of req) { length += chunk.length; if (length > 29 * 1024 * 1024) { const e = new Error('업로드 크기 제한을 초과했습니다.'); e.status = 413; throw e; } chunks.push(chunk); }
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { const e = new Error('올바른 JSON 요청이 필요합니다.'); e.status = 400; throw e; }
      }
      const parts = url.pathname.slice('/api/wiki/'.length).split('/').filter(Boolean);
      const who = actor.email || actor.uid;
      if (req.method === 'GET' && parts[0] === 'status') {
        let model; try { model = modelConfig().model; } catch { model = null; }
        return json(res, 200, { ...store.status(), model, worker: active ? 'running' : 'idle' });
      }
      if (req.method === 'GET' && parts[0] === 'pages' && !parts[1]) return json(res, 200, store.pages());
      if (req.method === 'GET' && parts[0] === 'pages' && parts[2] === 'history') return json(res, 200, store.history(parts[1]));
      if (req.method === 'POST' && parts[0] === 'pages') { const saved = store.savePage(body.draft, body.options || {}, who); scheduleReindex(store); return json(res, 200, saved); }
      if (req.method === 'POST' && parts[0] === 'events') {
        const events = Array.isArray(body.events) ? body.events : [body];
        if (events.length > 100) throw new Error('한 번에 100개까지 기록할 수 있습니다.');
        return json(res, 200, { results: events.map(event => store.capture(event, who)) });
      }
      if (req.method === 'GET' && parts[0] === 'sources') return json(res, 200, store.sources());
      if (req.method === 'GET' && parts[0] === 'search') return json(res, 200, store.search((url.searchParams.get('q') || '').slice(0, 2000), true));
      if (req.method === 'POST' && parts[0] === 'sources') {
        if (body.base64 && !/\.(pdf|md|txt|json)$/i.test(body.name || '')) throw new Error('PDF, Markdown, TXT, JSON 자료만 업로드할 수 있습니다.');
        if (!body.base64 && typeof body.content !== 'string') throw new Error('원본 자료가 필요합니다.');
        const result = store.addSource({ title: body.title, name: body.name, kind: body.kind || 'file', mime: /\.pdf$/i.test(body.name || '') ? 'application/pdf' : 'text/plain', ...(body.base64 ? { bytes: Buffer.from(body.base64, 'base64') } : { content: body.content }), originalRefs: Array.isArray(body.originalRefs) ? body.originalRefs : [] }, who);
        scheduleReindex(store);
        store.capture({ model: 'KnowledgeSource', eventId: `upload:${result.source.id}`, entityId: result.source.id, data: { title: result.source.title, sourceId: result.source.id }, operation: 'upload' }, who);
        return json(res, 202, result);
      }
      if (req.method === 'GET' && parts[0] === 'originals') {
        const source = store.source(parts[1]);
        if (!source) return json(res, 404, { error: '원본을 찾지 못했습니다.' });
        const file = join(store.root, source.path);
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(source.name)}`, 'X-Content-Type-Options': 'nosniff' }); createReadStream(file).pipe(res); return;
      }
      if (req.method === 'POST' && parts[0] === 'jobs' && parts[2] === 'retry') { store.retry(parts[1]); return json(res, 200, { accepted: true }); }
      // Second-brain retrieval: passages with citations for any agent/channel (see retrieval/index.mjs).
      if (req.method === 'POST' && parts[0] === 'retrieve') {
        if (typeof body.query !== 'string' || !body.query.trim() || body.query.length > 2000) throw new Error('검색어는 1~2,000자로 입력해 주세요.');
        return json(res, 200, await retrieve(store, body.query, { k: Math.min(Math.max(Number(body.k) || 6, 1), 20), includeReview: body.includeReview !== false }));
      }
      if (req.method === 'POST' && parts[0] === 'reindex') return json(res, 200, await reindex(store));
      if (req.method === 'POST' && parts[0] === 'query') {
        const result = await answerQuestion(store, body.question, Boolean(body.includeDrafts), call);
        store.capture({ model: 'ChatMessage', entityId: 'wiki-query', data: { title: body.question.slice(0, 200), question: body.question, ...result, aiGenerated: true } }, who);
        return json(res, 200, result);
      }
      if (req.method === 'POST' && parts[0] === 'work') { await tick(); return json(res, 200, store.status()); }
      return json(res, 404, { error: 'Not found' });
    } catch (error) { json(res, error.status || 400, { error: String(error.message || '작업을 처리하지 못했습니다.').replace(/sk-[\w-]+/g, '[redacted]') }); }
  });
  // Exactly one API/worker process owns this data volume. A new listener resumes its previous interrupted work.
  server.once('listening', () => store.db.prepare("UPDATE jobs SET state='queued',available_at=0,lease_until=NULL WHERE state='running'").run());
  return { server, store, tick, async close() { stopped = true; shutdown.abort(); if (interval) clearInterval(interval); while (active) await new Promise(r => setTimeout(r, 50)); await new Promise(r => server.close(r)); store.close(); } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const runtime = createWikiServer();
  const port = Number(process.env.WIKI_PORT || 5318);
  runtime.server.listen(port, process.env.WIKI_HOST || '127.0.0.1', () => console.log(`INDEX knowledge server listening on :${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => void runtime.close().then(() => process.exit(0)));
}
