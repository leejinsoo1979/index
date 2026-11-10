/**
 * Puts this Mac's INDEX knowledge server (127.0.0.1:5318) on the internet through a Cloudflare
 * quick tunnel, so the deployed site's personal AI can reach it while this Mac is on.
 *
 * The tunnel address changes every start, so each new address and the server's runtime token
 * (encrypted) go to the private bucket as config/knowledge-endpoint.json; the deployed functions
 * read it (api/_apiKeys.ts). Stopping this script clears the address so the site reports the
 * server as offline instead of timing out. Keeps the Mac from idle-sleeping while it runs.
 *
 * Usage: npm run knowledge:tunnel   (needs `cloudflared`, FLOORPLAN_R2_* and R2_ACCOUNT_ID in .env.local)
 * Interim measure until the knowledge server moves to a cloud server (deploy/knowledge).
 */
import { spawn } from 'node:child_process';
import { createCipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf8').split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const { R2_ACCOUNT_ID: account, FLOORPLAN_R2_ACCESS_KEY_ID: accessKey, FLOORPLAN_R2_SECRET_ACCESS_KEY: secret, FLOORPLAN_R2_BUCKET: bucket } = env;
if (!account || !accessKey || !secret || !bucket) throw new Error('.env.local에 FLOORPLAN_R2_* 키가 없습니다.');
const knowledgeDir = process.env.INDEX_KNOWLEDGE_DIR || join(root, '.index-knowledge');
const token = readFileSync(join(knowledgeDir, 'runtime.token'), 'utf8').trim();
const LOCAL = `http://127.0.0.1:${process.env.WIKI_PORT || 5318}`;
const KEY = 'config/knowledge-endpoint.json';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const hmac = (k, s) => createHmac('sha256', k).update(s).digest();
async function put(body) {
  const host = `${account}.r2.cloudflarestorage.com`;
  const path = `/${bucket}/${KEY}`;
  const amz = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '');
  const day = amz.slice(0, 8);
  const payload = sha(body);
  const headers = `host:${host}\nx-amz-content-sha256:${payload}\nx-amz-date:${amz}\n`;
  const signed = 'host;x-amz-content-sha256;x-amz-date';
  const scope = `${day}/auto/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amz, scope, sha(['PUT', path, '', headers, signed, payload].join('\n'))].join('\n');
  const key = hmac(hmac(hmac(hmac('AWS4' + secret, day), 'auto'), 's3'), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  const response = await fetch(`https://${host}${path}`, { method: 'PUT', body, headers: { 'x-amz-date': amz, 'x-amz-content-sha256': payload, 'content-type': 'application/json', authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signed}, Signature=${signature}` } });
  if (!response.ok) throw new Error(`주소를 저장하지 못했습니다 (${response.status}).`);
}

/** Same scheme as api/_apiKeys.ts sealEndpointToken. */
function seal(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(`index-knowledge-endpoint:${secret}`).digest(), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64')).join('.');
}
const publish = (url) => put(JSON.stringify({ url, token: url ? seal(token) : null, updatedAt: new Date().toISOString() }));
const log = (...parts) => console.log(new Date().toISOString(), ...parts);

async function waitHealthy(url, tries = 30) {
  for (let i = 0; i < tries; i += 1) {
    const ok = await fetch(`${url}/api/wiki/health`, { signal: AbortSignal.timeout(5000) }).then((r) => r.ok).catch(() => false);
    if (ok) return true;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return false;
}

let child = null;
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  log('stopping; clearing the published address');
  child?.kill('SIGTERM');
  await publish(null).catch((error) => log('could not clear the address:', error.message));
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

// Keep the Mac from idle sleep for as long as this runs.
spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore', detached: true }).unref();

if (!(await fetch(`${LOCAL}/api/wiki/health`).then((r) => r.ok).catch(() => false))) log(`warning: the knowledge server is not answering on ${LOCAL}; start it with npm run wiki:server`);

let delay = 2000;
while (!stopping) {
  const started = Date.now();
  await new Promise((resolveRun) => {
    child = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', LOCAL], { stdio: ['ignore', 'pipe', 'pipe'] });
    let published = false;
    const scan = async (chunk) => {
      const found = !published && String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (!found) return;
      published = true;
      const url = found[0];
      // Published right away: this Mac's DNS often learns a new tunnel name later than the internet does.
      await publish(url).then(() => log('published', url), (error) => log(error.message));
      log(await waitHealthy(url) ? 'reachable through the tunnel' : 'not reachable from this Mac yet (DNS); the site may still reach it');
    };
    child.stdout.on('data', scan);
    child.stderr.on('data', scan);
    child.on('exit', (code) => { log('cloudflared exited', code); resolveRun(); });
  });
  if (stopping) break;
  await publish(null).catch(() => undefined);
  delay = Date.now() - started > 60_000 ? 2000 : Math.min(delay * 2, 60_000);
  log(`restarting the tunnel in ${delay / 1000}s`);
  await new Promise((resolve) => setTimeout(resolve, delay));
}
