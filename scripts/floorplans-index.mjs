/**
 * Build the searchable floor plan index from the collection's list page.
 * Usage: node scripts/floorplans-index.mjs <목록.html> <dup-report.json>
 * Writes ~/.index-floorplans/index.json; only images already uploaded are included.
 * Upload it with: node scripts/floorplans-upload.mjs --put-index ~/.index-floorplans/index.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const [html, report] = process.argv.slice(2);
if (!html || !report) throw new Error('목록.html과 중복 검사 결과 경로가 필요합니다.');
const state = join(homedir(), '.index-floorplans');
const uploaded = new Set(readFileSync(join(state, 'uploaded.txt'), 'utf8').split('\n').filter(Boolean));
const idOf = (path) => path.normalize('NFC').match(/_(\d+)\.jpg/i)?.[1];
const pyeongOf = (type) => Number(type.normalize('NFC').match(/([\d.]+)평/)?.[1] ?? NaN);

// Same image under types whose areas differ by more than 1평: probably the wrong drawing.
const suspect = new Set();
for (const groups of Object.values(JSON.parse(readFileSync(report, 'utf8')).internal)) {
  for (const group of groups) {
    const areas = group.types.map(pyeongOf).filter(Number.isFinite);
    if (areas.length && Math.max(...areas) - Math.min(...areas) > 1) group.files.forEach((file) => suspect.add(idOf(file)));
  }
}

const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const text = readFileSync(html, 'utf8');
const regions = [], regionIndex = new Map(), danji = new Map();
let total = 0, missing = 0;
for (const [, row] of text.matchAll(/<tr><td>([\s\S]*?)<\/tr>/g)) {
  const cells = [...`<td>${row}`.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
  if (cells.length < 12) continue;
  const [region, name, , pyeong, dong, type, supply, exclusive] = cells.map(unescape);
  const id = idOf(unescape(cells[10].match(/href="([^"]+)"/)?.[1] ?? ''));
  const kbId = cells[11].match(/\/c\/(\d+)/)?.[1];
  if (!id || !kbId || !uploaded.has(id)) { missing += 1; continue; }
  if (!regionIndex.has(region)) { regionIndex.set(region, regions.length); regions.push(region); }
  const key = `${region}|${name}|${kbId}`;
  if (!danji.has(key)) danji.set(key, [regionIndex.get(region), name, dong, kbId, []]);
  danji.get(key)[4].push([id, Number(pyeong), type, Number(supply), Number(exclusive), suspect.has(id) ? 1 : 0]);
  total += 1;
}
const rows = [...danji.values()];
rows.forEach((row) => row[4].sort((a, b) => a[4] - b[4] || a[1] - b[1]));
const out = join(state, 'index.json');
writeFileSync(out, JSON.stringify({ v: 1, regions, danji: rows }));
console.log(JSON.stringify({ plans: total, skipped: missing, danji: rows.length, regions: regions.length, suspect: suspect.size, bytes: readFileSync(out).length, out }));
