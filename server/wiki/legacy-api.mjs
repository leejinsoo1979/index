import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
/** Serve the existing Vercel handlers when the entire INDEX site runs on this VM. */
export async function legacyApi(req, res, name) {
  const file = resolve('.index-runtime/api/' + name + '.mjs');
  if (!existsSync(file)) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: '서버 API 빌드가 필요합니다: npm run wiki:build' })); return; }
  let length = 0; const chunks = [];
  for await (const chunk of req) { length += chunk.length; if (length > 30 * 1024 * 1024) throw new Error('요청 크기가 너무 큽니다.'); chunks.push(chunk); }
  const raw = Buffer.concat(chunks).toString('utf8');
  Object.assign(req, { body: raw ? JSON.parse(raw) : {}, query: Object.fromEntries(new URL(req.url, 'http://localhost').searchParams) });
  const vres = Object.assign(res, { status(code) { res.statusCode = code; return vres; }, json(body) { if (!res.headersSent) res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); return vres; }, send(body) { res.end(body); return vres; } });
  const mod = await import(pathToFileURL(file).href);
  await mod.default(req, vres);
}
