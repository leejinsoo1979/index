/**
 * Upload the apartment floor plan images to the private R2 bucket `floorplan`.
 * Usage: node scripts/floorplans-upload.mjs <apartment-plans dir> [--filter 단지명] [--dry-run]
 *        node scripts/floorplans-upload.mjs --put-index <index.json>
 * Reads FLOORPLAN_R2_* and R2_ACCOUNT_ID from .env.local. Object key: plans/<numeric id>.jpg.
 * Resumable: finished ids are appended to ~/.index-floorplans/uploaded.txt (outside the repo).
 */
import { readFileSync, readdirSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash, createHmac } from 'node:crypto';

const args = process.argv.slice(2);
const indexFile = args.includes('--put-index') ? args[args.indexOf('--put-index') + 1] : '';
const root = args.find((a, i) => !a.startsWith('--') && !['--filter', '--put-index'].includes(args[i - 1]));
if (!root && !indexFile) throw new Error('apartment-plans 폴더 경로가 필요합니다.');
const filter = args.includes('--filter') ? args[args.indexOf('--filter') + 1].normalize('NFC') : '';
const dryRun = args.includes('--dry-run');
const CONCURRENCY = 16;

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const { R2_ACCOUNT_ID: account, FLOORPLAN_R2_ACCESS_KEY_ID: accessKey, FLOORPLAN_R2_SECRET_ACCESS_KEY: secret, FLOORPLAN_R2_BUCKET: bucket } = env;
if (!account || !accessKey || !secret || !bucket) throw new Error('.env.local에 FLOORPLAN_R2_* 키가 없습니다.');
const host = `${account}.r2.cloudflarestorage.com`;
const sha = (b) => createHash('sha256').update(b).digest('hex');
const hmac = (k, s) => createHmac('sha256', k).update(s).digest();

async function s3(method, path, body, contentType = 'image/jpeg') {
  const amz = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '');
  const day = amz.slice(0, 8);
  const payload = body ? sha(body) : 'UNSIGNED-PAYLOAD';
  const headers = `host:${host}\nx-amz-content-sha256:${payload}\nx-amz-date:${amz}\n`;
  const signed = 'host;x-amz-content-sha256;x-amz-date';
  const scope = `${day}/auto/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amz, scope, sha([method, path, '', headers, signed, payload].join('\n'))].join('\n');
  const key = hmac(hmac(hmac(hmac('AWS4' + secret, day), 'auto'), 's3'), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return fetch(`https://${host}${path}`, { method, body, headers: { 'x-amz-date': amz, 'x-amz-content-sha256': payload, ...(body ? { 'content-type': contentType } : {}), authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signed}, Signature=${signature}` } });
}

if (indexFile) {
  const r = await s3('PUT', `/${bucket}/index/index.json`, readFileSync(indexFile), 'application/json');
  console.log('index upload', r.status);
  process.exit(r.ok ? 0 : 1);
}

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('._')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.toLowerCase().endsWith('.jpg')) yield p;
  }
}

const state = join(homedir(), '.index-floorplans');
mkdirSync(state, { recursive: true });
const log = join(state, 'uploaded.txt');
const done = new Set(existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []);
const files = [...walk(root)].filter((p) => !filter || p.normalize('NFC').includes(filter));
const seen = new Map();
let uploaded = 0, skipped = 0, failed = 0, invalid = 0, duplicateIds = 0;

async function put(path) {
  const id = path.normalize('NFC').match(/_(\d+)\.jpg$/i)?.[1];
  if (!id) { invalid += 1; console.error('NO_ID', path); return; }
  if (seen.has(id)) { duplicateIds += 1; console.error('DUP_ID', id, path); return; }
  seen.set(id, path);
  if (done.has(id)) { skipped += 1; return; }
  const body = readFileSync(path);
  if (body[0] !== 0xff || body[1] !== 0xd8 || body[2] !== 0xff) { invalid += 1; console.error('NOT_JPEG', path); return; }
  if (dryRun) return;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const r = await s3('PUT', `/${bucket}/plans/${id}.jpg`, body);
      if (r.ok) { appendFileSync(log, id + '\n'); uploaded += 1; if (uploaded % 1000 === 0) console.log(`uploaded ${uploaded}`); return; }
      if (attempt === 4 || r.status === 403) { failed += 1; console.error('FAIL', r.status, id); return; }
    } catch (error) { if (attempt === 4) { failed += 1; console.error('FAIL', id, error.message); return; } }
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }
}

let next = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => { while (next < files.length) await put(files[next++]); }));
console.log(JSON.stringify({ found: files.length, uploaded, skipped, failed, invalid, duplicateIds, dryRun }));
