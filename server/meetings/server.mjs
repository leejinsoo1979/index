/**
 * INDEX 회의록 AI — local meeting service (port 5320).
 *
 *   npm run meetings:server
 *
 * Audio is kept on this machine (.index-meetings/), transcribed one meeting at a time by
 * WhisperX (transcribe.py, Python venv at MEETINGS_PYTHON or ~/.index-meetings/venv), then
 * analysed by the tool model (DeepSeek by default). Executive meetings write a "회의 기억" page
 * into every participating executive's personal wiki plus a cumulative "임원 관계 기억" page, so
 * each executive agent recalls what was said, decided and owed — and with whom.
 *
 * Every route needs a Firebase ID token; meetings are visible only to the member who recorded them.
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { loadEnvironment } from '../wiki/env.mjs';

loadEnvironment();
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.env.INDEX_MEETINGS_DIR || '.index-meetings');
const PORT = Number(process.env.MEETINGS_PORT || 5320);
const PYTHON = process.env.MEETINGS_PYTHON || join(homedir(), '.index-meetings', 'venv', 'bin', 'python');
const MAX_AUDIO = 1024 * 1024 * 1024; // 1GB ≈ 8h of browser opus
const KINDS = ['general', 'executive', 'site'];
mkdirSync(join(ROOT, 'meetings'), { recursive: true, mode: 0o700 });

const { verifyFirebaseUser, memberAccess } = await import('../../api/_firebaseAdmin.ts');
const { personaService } = await import('../../api/_personaService.ts');
const { analyseMeeting, hasMeetingModel } = await import('./analysis.ts');

// ─── storage ────────────────────────────────────────────────────────────────

const dirOf = id => join(ROOT, 'meetings', id);
const safeId = id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);
const readJson = (path, fallback = null) => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; } };
function writeJson(path, value) { const tmp = path + '.' + process.pid + '.tmp'; writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 }); renameSync(tmp, path); }
const meta = id => readJson(join(dirOf(id), 'meta.json'));
function saveMeta(m) { m.updatedAt = new Date().toISOString(); writeJson(join(dirOf(m.id), 'meta.json'), m); return m; }
const transcript = id => readJson(join(dirOf(id), 'transcript.json'));
const analysis = id => readJson(join(dirOf(id), 'analysis.json'));
function allMeta() { return readdirSync(join(ROOT, 'meetings')).filter(safeId).map(meta).filter(Boolean); }

const text = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
function cleanParticipants(list) {
  return (Array.isArray(list) ? list : []).slice(0, 20).map(p => ({ name: text(p?.name, 60), role: text(p?.role, 80), personaId: /^[\w-]{1,100}$/.test(p?.personaId || '') ? p.personaId : '' })).filter(p => p.name);
}
function cleanSpeakers(map, participants) {
  const out = {};
  for (const [k, v] of Object.entries(map && typeof map === 'object' ? map : {})) if (/^SPEAKER_\d{2}$/.test(k)) { const i = Number(v); out[k] = Number.isInteger(i) && i >= 0 && i < participants.length ? i : -1; }
  return out;
}

// ─── transcription queue ────────────────────────────────────────────────────

const queue = [];
let busy = false;
function enqueue(id) { if (!queue.includes(id)) queue.push(id); void drain(); }
async function drain() {
  if (busy) return;
  const id = queue.shift();
  if (!id) return;
  busy = true;
  try { await transcribe(id); } catch (e) { console.error('[meetings]', id, e); }
  busy = false;
  void drain();
}

function transcribe(id) {
  const m = meta(id);
  if (!m) return Promise.resolve();
  const dir = dirOf(id);
  Object.assign(m, { status: 'transcribing', stage: 'loading', progress: 1, error: '' });
  saveMeta(m);
  const speakers = m.kind === 'executive' || m.participants.length > 1 ? m.participants.length : 0;
  const args = [join(HERE, 'transcribe.py'), '--audio', join(dir, m.audio.file), '--out', join(dir, 'transcript.tmp.json'), '--language', 'ko'];
  if (speakers > 1) args.push('--speakers', String(speakers));
  return new Promise(done => {
    const child = spawn(PYTHON, args, { env: { ...process.env, PYTHONUNBUFFERED: '1', TOKENIZERS_PARALLELISM: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let buffer = '', lastError = '', warning = '', lastSave = 0;
    child.stdout.on('data', chunk => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl); buffer = buffer.slice(nl + 1);
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.stage === 'error') lastError = msg.message || '';
        if (msg.warning) warning = msg.warning;
        if (msg.duration) m.duration = msg.duration;
        if (msg.stage && msg.stage !== 'error') { m.stage = msg.stage; if (msg.progress != null) m.progress = msg.progress; }
        if (Date.now() - lastSave > 1500 || msg.stage === 'done') { lastSave = Date.now(); saveMeta(m); }
      }
    });
    let stderrTail = '';
    child.stderr.on('data', chunk => { stderrTail = (stderrTail + chunk).slice(-2000); if (process.env.MEETINGS_DEBUG) process.stderr.write(chunk); });
    child.on('error', e => { lastError = `WhisperX를 실행하지 못했습니다: ${e.message}`; });
    child.on('close', async code => {
      const result = code === 0 ? readJson(join(dir, 'transcript.tmp.json')) : null;
      if (!result) {
        if (!lastError) console.error('[meetings] transcribe failed', id, stderrTail);
        Object.assign(m, { status: 'error', error: lastError || '음성 인식에 실패했습니다.', stage: '', progress: 0 });
        saveMeta(m);
        return done();
      }
      renameSync(join(dir, 'transcript.tmp.json'), join(dir, 'transcript.json'));
      const labels = [...new Set(result.segments.map(s => s.speaker))].sort();
      // Speakers come out in first-heard order; map them onto the participant list in that order.
      const firstHeard = [...new Set(result.segments.map(s => s.speaker))];
      m.speakers = Object.fromEntries(labels.map(l => [l, m.speakers?.[l] ?? (firstHeard.indexOf(l) < m.participants.length ? firstHeard.indexOf(l) : -1)]));
      Object.assign(m, { diarized: result.diarized, duration: result.duration, warning, progress: 100 });
      saveMeta(m);
      await analyse(id).catch(() => {});
      done();
    });
  });
}

// ─── analysis ───────────────────────────────────────────────────────────────

function speakerName(m, label) {
  const i = m.speakers?.[label];
  return i != null && i >= 0 && m.participants[i] ? m.participants[i].name : `화자 ${Number(label.slice(8)) + 1}`;
}
function linesFor(m, t) { return t.segments.map(s => ({ ...s, name: s.name || speakerName(m, s.speaker) })); }

async function analyse(id) {
  const m = meta(id), t = transcript(id);
  if (!m || !t) return;
  if (!hasMeetingModel()) { Object.assign(m, { status: 'ready', stage: '', analysisError: 'AI 모델 키가 없어 요약·분석을 건너뛰었습니다.' }); saveMeta(m); return; }
  Object.assign(m, { status: 'analyzing', stage: 'analyzing', analysisError: '' });
  saveMeta(m);
  try {
    const previous = m.previousId && meta(m.previousId)?.ownerUid === m.ownerUid ? analysis(m.previousId) : null;
    const result = await analyseMeeting({
      title: m.title, kind: m.kind, date: m.date, participants: m.participants,
      lines: linesFor(m, t), diarized: Boolean(m.diarized),
      previousActions: previous?.actions ?? [],
    });
    writeJson(join(dirOf(id), 'analysis.json'), { ...result, analysedAt: new Date().toISOString() });
    Object.assign(m, { status: 'ready', stage: '' });
  } catch (e) {
    Object.assign(m, { status: 'ready', stage: '', analysisError: `요약·분석에 실패했습니다: ${e.message}` });
  }
  saveMeta(m);
}

// ─── saving into personal wikis (executive memory) ──────────────────────────

const fmtTime = s => { const t = Math.max(0, Math.floor(s)); const h = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60; return (h ? h + ':' : '') + String(mm).padStart(h ? 2 : 1, '0') + ':' + String(ss).padStart(2, '0'); };
const bullet = list => (list?.length ? list.map(v => `- ${v}`).join('\n') : '- 없음');
/** Korean subject particle: 받침 → 이, else 가 (non-Hangul names fall back to 이(가)). */
const iga = name => { const c = name.charCodeAt(name.length - 1); return c >= 0xac00 && c <= 0xd7a3 ? name + ((c - 0xac00) % 28 ? '이' : '가') : name + '이(가)'; };
const KIND_LABEL = { general: '일반 회의', executive: '임원 회의', site: '현장·고객 미팅' };

function memoryPage(m, a, lines, person) {
  const me = person.name;
  const mine = a.people?.find(p => p.name === me);
  const myActions = (a.actions ?? []).filter(x => x.owner === me);
  const myRelations = (a.relations ?? []).filter(r => r.from === me || r.to === me);
  const said = lines.filter(l => l.name === me).slice(0, 40).map(l => `- [${fmtTime(l.start)}] ${l.text}`);
  const others = m.participants.filter(p => p.name !== me).map(p => p.name + (p.role ? `(${p.role})` : ''));
  return [
    `${m.date} ${KIND_LABEL[m.kind]} 「${m.title}」에 참석한 기록입니다. 함께한 사람: ${others.join(', ') || '없음'}.`,
    '## 회의 요약', bullet(a.summary),
    '## 내 입장과 발언 요지', mine ? [mine.stance && `입장: ${mine.stance}`, bullet(mine.points)].filter(Boolean).join('\n') : '- 이 회의에서 정리된 발언이 없습니다.',
    mine?.concerns?.length ? `## 내가 우려한 점\n${bullet(mine.concerns)}` : '',
    '## 내가 맡은 일', myActions.length ? myActions.map(x => `- ${x.task}${x.due ? ` (기한 ${x.due})` : ''}${x.note ? ` — ${x.note}` : ''}`).join('\n') : '- 없음',
    '## 결정된 사항', bullet((a.decisions ?? []).map(d => d.text + (d.by ? ` (${d.by})` : ''))),
    '## 다른 사람과 오간 것', myRelations.length ? myRelations.map(r => `- ${r.from === me ? `나 → ${r.to}` : `${r.from} → 나`} · ${r.type}: ${r.note}`).join('\n') : '- 없음',
    (a.nextAgenda ?? []).length ? `## 다음 회의 안건\n${bullet(a.nextAgenda)}` : '',
    said.length ? `## 내가 실제로 한 말 (발췌)\n${said.join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

function relationPage(personaId, name) {
  // Rebuilt from every saved meeting that included this executive, newest first.
  const byPerson = new Map();
  const meetings = allMeta().filter(m => m.saved?.personas?.[personaId] && m.participants.some(p => p.personaId === personaId)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  for (const m of meetings) {
    const a = analysis(m.id);
    for (const r of a?.relations ?? []) {
      if (r.from !== name && r.to !== name) continue;
      const other = r.from === name ? r.to : r.from;
      if (!other || other === name) continue;
      const role = m.participants.find(p => p.name === other)?.role || '';
      if (!byPerson.has(other)) byPerson.set(other, { role, items: [] });
      byPerson.get(other).items.push(`- ${m.date} 「${m.title}」 ${r.from === name ? `나 → ${other}` : `${other} → 나`} · ${r.type}: ${r.note}`);
    }
    for (const p of m.participants) if (p.name !== name && !byPerson.has(p.name)) byPerson.set(p.name, { role: p.role, items: [] });
    for (const p of m.participants) if (p.name !== name) byPerson.get(p.name).met = (byPerson.get(p.name).met || 0) + 1;
  }
  const blocks = [...byPerson.entries()].sort((a, b) => (b[1].met || 0) - (a[1].met || 0)).map(([other, v]) => `## ${other}${v.role ? ` · ${v.role}` : ''}\n함께한 회의 ${v.met || 0}회\n${v.items.slice(0, 30).join('\n') || '- 아직 정리된 상호작용이 없습니다.'}`);
  return `${iga(name)} 회의에서 다른 사람들과 맺어 온 관계를 회의록에서 모은 기억입니다. 회의를 저장할 때마다 다시 정리됩니다.\n\n${blocks.join('\n\n') || '아직 저장된 회의가 없습니다.'}`;
}

/** The personal wiki assigns page ids on first save, so an existing page is found by `find`. */
async function upsertPersonaPage(actor, personaId, find, draft) {
  const pages = await personaService({ action: 'pages', actor, personId: personaId });
  const old = pages.find(find);
  return personaService({ action: 'savePage', actor, personId: personaId, draft: { ...(old ?? {}), ...draft }, options: { ...(old ? { id: old.id } : {}), expectedVersion: old?.version ?? 0, reason: '회의록 AI 저장' } });
}
const isMeetingPage = id => p => p.sources?.some(s => s.kind === 'meeting' && s.id === id);
const isRelationPage = p => p.category === '회의 기억' && p.tags?.includes('관계도');

async function saveToPersonas(m, user, access) {
  const a = analysis(m.id), t = transcript(m.id);
  if (!a || !t) throw Object.assign(new Error('요약·분석이 끝난 회의만 저장할 수 있습니다.'), { status: 409 });
  const people = m.participants.filter(p => p.personaId);
  if (!people.length) throw Object.assign(new Error('참석자에 임원(에이전트)을 지정해 주세요.'), { status: 400 });
  // Executives may file a meeting they attended into every attendee's memory; admins may file any.
  const owners = {};
  for (const p of people) {
    try { owners[p.personaId] = (await personaService({ action: 'settings', actor: { uid: 'meetings', admin: true }, personId: p.personaId })).ownerUid || ''; } catch { owners[p.personaId] = ''; }
  }
  if (!access.admin && !people.some(p => owners[p.personaId] === user.uid)) throw Object.assign(new Error('참석 임원 본인이나 관리자만 임원들의 개인 위키에 저장할 수 있습니다.'), { status: 403 });
  const actor = { uid: user.uid, email: user.email, name: user.name || user.email, admin: true };
  const lines = linesFor(m, t);
  const results = {};
  m.saved = { ...(m.saved ?? {}), personas: { ...(m.saved?.personas ?? {}) } };
  for (const p of people) {
    try {
      const page = await upsertPersonaPage(actor, p.personaId, isMeetingPage(m.id), {
        title: `회의 기억 · ${m.title} (${m.date})`,
        content: memoryPage(m, a, lines, p),
        category: '회의 기억', tags: ['회의록', KIND_LABEL[m.kind], ...m.participants.filter(x => x.name !== p.name).map(x => x.name)].slice(0, 20),
        status: 'published', entryType: 'note', cover: 'auto', pinned: false, aliases: [m.title],
        sources: [{ id: m.id, kind: 'meeting', title: m.title, storage: 'server', excerpt: `${m.date} 회의록 AI` }],
      });
      m.saved.personas[p.personaId] = page.id;
      results[p.personaId] = { ok: true, name: p.name };
    } catch (e) { results[p.personaId] = { ok: false, name: p.name, error: e.message }; }
  }
  saveMeta(m);
  for (const p of people) {
    if (!results[p.personaId].ok) continue;
    try {
      await upsertPersonaPage(actor, p.personaId, isRelationPage, { title: `임원 관계 기억 · ${p.name}`, content: relationPage(p.personaId, p.name), category: '회의 기억', tags: ['관계도', '회의록'], status: 'published', entryType: 'note', cover: 'auto', pinned: true, aliases: ['관계도', '임원 관계'] });
    } catch (e) { results[p.personaId].relationError = e.message; }
  }
  return results;
}

async function saveToWiki(m) {
  const a = analysis(m.id), t = transcript(m.id);
  if (!a || !t) throw Object.assign(new Error('요약·분석이 끝난 회의만 보낼 수 있습니다.'), { status: 409 });
  let token = process.env.WIKI_SERVICE_TOKEN;
  if (!token) try { token = readFileSync(resolve(process.env.INDEX_KNOWLEDGE_DIR || '.index-knowledge', 'runtime.token'), 'utf8').trim(); } catch { throw Object.assign(new Error('INDEX 지식 서버 연결이 설정되지 않았습니다.'), { status: 503 }); }
  const body = `# ${m.title}\n\n${m.date} · ${KIND_LABEL[m.kind]} · 참석 ${m.participants.map(p => p.name).join(', ')}\n\n${markdown(m, a, t, false)}`;
  const res = await fetch((process.env.INDEX_WIKI_URL || 'http://127.0.0.1:5318').replace(/\/$/, '') + '/api/wiki/sources', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `회의록 · ${m.title} (${m.date})`, name: `meeting-${m.id}.md`, kind: 'file', content: body }), signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (!res?.ok) throw Object.assign(new Error('INDEX 지식 서버에 보내지 못했습니다.'), { status: 502 });
  const out = await res.json();
  m.saved = { ...(m.saved ?? {}), wiki: out.source?.id || true };
  saveMeta(m);
  return out.source?.id;
}

function markdown(m, a, t, withTranscript = true) {
  const parts = [
    '## 세 줄 요약', bullet(a.summary),
    '## 결정 사항', bullet((a.decisions ?? []).map(d => d.text + (d.by ? ` (${d.by})` : ''))),
    '## 할 일', (a.actions ?? []).length ? a.actions.map(x => `- ${x.task} — ${x.owner || '담당 미정'}${x.due ? `, ${x.due}까지` : ''}`).join('\n') : '- 없음',
    (a.carryOver ?? []).length ? `## 지난 회의 할 일 점검\n${a.carryOver.map(x => `- ${x.task} (${x.owner || '담당 미정'}): ${x.status}${x.note ? ` — ${x.note}` : ''}`).join('\n')}` : '',
    '## 쟁점·위험', bullet((a.issues ?? []).map(i => i.text)),
  ];
  const site = a.site ?? {};
  const siteRows = [['고객 요구 변경', site.requirementChanges], ['자재·사양 변경', site.specChanges], ['추가 비용', (site.costs ?? []).map(c => `${c.item}${c.amount ? ` ${c.amount}` : ''}${c.note ? ` — ${c.note}` : ''}`)], ['일정 변경', site.scheduleChanges], ['하자·민원', site.defects]].filter(([, v]) => v?.length);
  if (siteRows.length) parts.push('## 현장 체크', siteRows.map(([k, v]) => `**${k}**\n${bullet(v)}`).join('\n\n'));
  if ((a.nextAgenda ?? []).length) parts.push('## 다음 회의 안건', bullet(a.nextAgenda));
  if (withTranscript) parts.push('## 회의록 원문', linesFor(m, t).map(l => `[${fmtTime(l.start)}] ${l.name}: ${l.text}`).join('\n'));
  return parts.filter(Boolean).join('\n\n');
}

// ─── HTTP ───────────────────────────────────────────────────────────────────

const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); };
async function readBody(req, limit = 2 * 1024 * 1024) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > limit) throw Object.assign(new Error('요청이 너무 큽니다.'), { status: 413 }); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw Object.assign(new Error('올바른 JSON 요청이 필요합니다.'), { status: 400 }); }
}
function view(m, full = false) {
  const base = { id: m.id, title: m.title, kind: m.kind, date: m.date, participants: m.participants, status: m.status, stage: m.stage, progress: m.progress, error: m.error, duration: m.duration, createdAt: m.createdAt, updatedAt: m.updatedAt, saved: m.saved ?? {} };
  if (!full) return base;
  return { ...base, speakers: m.speakers ?? {}, diarized: Boolean(m.diarized), warning: m.warning || '', analysisError: m.analysisError || '', previousId: m.previousId || '', audio: { mime: m.audio.mime, size: m.audio.size }, transcript: transcript(m.id), analysis: analysis(m.id), queuePosition: queue.indexOf(m.id) + 1 };
}
const AUDIO_EXT = { 'audio/webm': 'webm', 'video/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/aac': 'aac', 'audio/flac': 'flac', 'audio/aiff': 'aiff', 'audio/x-aiff': 'aiff', 'video/mp4': 'mp4', 'video/quicktime': 'mov' };

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const parts = url.pathname.replace(/^\/api\/meetings\/?/, '').split('/').filter(Boolean);
  if (!url.pathname.startsWith('/api/meetings')) return json(res, 404, { error: 'Not found' });
  if (parts[0] === 'health') return json(res, 200, { ok: true, engine: existsSync(PYTHON), diarization: Boolean(process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN), llm: hasMeetingModel(), busy, queued: queue.length });
  if (req.headers.origin) { try { if (new URL(req.headers.origin).host !== req.headers.host) return json(res, 403, { error: '허용되지 않은 요청 출처입니다.' }); } catch { return json(res, 403, { error: 'Invalid origin' }); } }
  let user, access;
  try { user = await verifyFirebaseUser(req); access = await memberAccess(user); if (access.suspended) throw new Error('suspended'); }
  catch { return json(res, 401, { error: '회원 로그인 후 사용할 수 있습니다.' }); }
  try {
    if (parts[0] === 'personas' && req.method === 'GET') {
      const { profiles } = await personaService({ action: 'directory', actor: { uid: user.uid, email: user.email, admin: access.admin } });
      return json(res, 200, { personas: profiles.map(p => ({ id: p.id, name: p.name, role: p.role })) });
    }
    if (!parts[0] && req.method === 'GET') return json(res, 200, { meetings: allMeta().filter(m => m.ownerUid === user.uid).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(m => view(m)) });
    if (!parts[0] && req.method === 'POST') {
      const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const ext = AUDIO_EXT[mime];
      if (!ext) return json(res, 415, { error: '녹음 파일 형식을 읽을 수 없습니다. webm, m4a, mp3, wav 파일을 올려 주세요.' });
      const info = JSON.parse(Buffer.from(String(req.headers['x-meeting'] || ''), 'base64').toString('utf8') || '{}');
      const participants = cleanParticipants(info.participants);
      const id = randomUUID(), dir = dirOf(id);
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      let size = 0;
      const out = createWriteStream(join(dir, 'audio.' + ext), { mode: 0o600 });
      try {
        await pipeline(req, async function* (source) { for await (const c of source) { size += c.length; if (size > MAX_AUDIO) throw Object.assign(new Error('녹음 파일은 1GB까지 올릴 수 있습니다.'), { status: 413 }); yield c; } }, out);
      } catch (e) { rmSync(dir, { recursive: true, force: true }); throw e; }
      if (size < 1000) { rmSync(dir, { recursive: true, force: true }); return json(res, 400, { error: '녹음된 소리가 없습니다.' }); }
      const prev = safeId(info.previousId) && meta(info.previousId)?.ownerUid === user.uid ? info.previousId : '';
      const m = saveMeta({ id, ownerUid: user.uid, ownerEmail: user.email || '', title: text(info.title, 120) || `${new Date().toLocaleDateString('ko-KR')} 회의`, kind: KINDS.includes(info.kind) ? info.kind : 'general', date: /^\d{4}-\d{2}-\d{2}$/.test(info.date) ? info.date : new Date().toISOString().slice(0, 10), participants, speakers: {}, previousId: prev, audio: { file: 'audio.' + ext, mime, size }, status: 'queued', stage: '', progress: 0, createdAt: new Date().toISOString() });
      enqueue(id);
      return json(res, 200, view(m, true));
    }
    const id = parts[0];
    if (!safeId(id)) return json(res, 404, { error: '회의를 찾지 못했습니다.' });
    const m = meta(id);
    if (!m || m.ownerUid !== user.uid) return json(res, 404, { error: '회의를 찾지 못했습니다.' });
    if (!parts[1] && req.method === 'GET') return json(res, 200, view(m, true));
    if (parts[1] === 'audio' && req.method === 'GET') {
      const path = join(dirOf(id), m.audio.file);
      res.writeHead(200, { 'Content-Type': m.audio.mime, 'Content-Length': statSync(path).size, 'Cache-Control': 'private, no-store' });
      return void createReadStream(path).pipe(res);
    }
    if (!parts[1] && req.method === 'PATCH') {
      const body = await readBody(req);
      if (body.title != null) m.title = text(body.title, 120) || m.title;
      if (body.date != null && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) m.date = body.date;
      if (body.kind != null && KINDS.includes(body.kind)) m.kind = body.kind;
      if (body.participants != null) m.participants = cleanParticipants(body.participants);
      if (body.speakers != null) m.speakers = cleanSpeakers(body.speakers, m.participants);
      if (Array.isArray(body.segments)) {
        // per-line corrections: speaker label reassignment and text fixes
        const t = transcript(id);
        if (t) {
          for (const e of body.segments.slice(0, 5000)) {
            const s = t.segments[e?.index];
            if (!s) continue;
            if (typeof e.text === 'string' && e.text.trim()) s.text = e.text.trim().slice(0, 2000);
            if (typeof e.speaker === 'string' && /^SPEAKER_\d{2}$/.test(e.speaker)) { s.speaker = e.speaker; if (!(e.speaker in m.speakers)) m.speakers[e.speaker] = -1; }
          }
          writeJson(join(dirOf(id), 'transcript.json'), t);
        }
      }
      saveMeta(m);
      return json(res, 200, view(m, true));
    }
    if (parts[1] === 'analyze' && req.method === 'POST') {
      if (!transcript(id)) return json(res, 409, { error: '음성 인식이 끝난 뒤 분석할 수 있습니다.' });
      void analyse(id);
      return json(res, 202, { accepted: true });
    }
    if (parts[1] === 'retry' && req.method === 'POST') {
      if (!['error'].includes(m.status)) return json(res, 409, { error: '실패한 회의만 다시 변환할 수 있습니다.' });
      m.status = 'queued'; m.error = ''; saveMeta(m); enqueue(id);
      return json(res, 202, { accepted: true });
    }
    if (parts[1] === 'save' && req.method === 'POST') {
      const body = await readBody(req);
      const out = {};
      if (body.personas) out.personas = await saveToPersonas(m, user, access);
      if (body.wiki) { if (!access.admin) return json(res, 403, { error: '협회 위키로 보내기는 관리자만 할 수 있습니다.' }); out.wiki = await saveToWiki(m); }
      return json(res, 200, { ...out, meeting: view(meta(id), true) });
    }
    if (parts[1] === 'markdown' && req.method === 'GET') {
      const a = analysis(id), t = transcript(id);
      if (!t) return json(res, 409, { error: '아직 변환 중입니다.' });
      return json(res, 200, { markdown: `# ${m.title}\n\n${m.date} · ${KIND_LABEL[m.kind]} · 참석 ${m.participants.map(p => p.name).join(', ') || '-'}\n\n${a ? markdown(m, a, t) : ''}` });
    }
    if (!parts[1] && req.method === 'DELETE') {
      if (busy && m.status === 'transcribing') return json(res, 409, { error: '변환 중인 회의는 끝난 뒤 삭제해 주세요.' });
      const i = queue.indexOf(id); if (i >= 0) queue.splice(i, 1);
      rmSync(dirOf(id), { recursive: true, force: true });
      return json(res, 200, { deleted: true });
    }
    return json(res, 404, { error: 'Not found' });
  } catch (e) {
    if (!res.headersSent) json(res, e.status || 500, { error: e.status ? e.message : '요청을 처리하지 못했습니다.' });
    if (!e.status) console.error('[meetings]', e);
  }
});

// Resume work interrupted by a restart.
for (const m of allMeta()) {
  if (m.status === 'queued' || m.status === 'transcribing') enqueue(m.id);
  else if (m.status === 'analyzing') void analyse(m.id);
}
server.requestTimeout = 0; // long uploads
server.listen(PORT, '127.0.0.1', () => console.log(`INDEX 회의록 서버 http://127.0.0.1:${PORT}/api/meetings (engine ${existsSync(PYTHON) ? 'WhisperX' : '없음'}, 화자 분리 ${process.env.HF_TOKEN ? '켜짐' : '꺼짐 — HF_TOKEN 필요'})`));
