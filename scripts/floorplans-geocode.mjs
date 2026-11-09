/**
 * Find coordinates for each apartment complex in the floor plan index (Kakao keyword search).
 * Usage: node scripts/floorplans-geocode.mjs [--sample N]
 * Resumable: results are appended to ~/.index-floorplans/geo.jsonl (outside the repo).
 * Then: node scripts/floorplans-geocode.mjs --build (writes geo.json for the map, without low-confidence
 * matches, which would put a pin on the wrong building)
 * and:  node scripts/floorplans-upload.mjs --put-geo ~/.index-floorplans/geo.json
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const sample = args.includes('--sample') ? Number(args[args.indexOf('--sample') + 1]) : 0;
const state = join(homedir(), '.index-floorplans');
const { regions, danji } = JSON.parse(readFileSync(join(state, 'index.json'), 'utf8'));
const out = join(state, 'geo.jsonl');
const rows = existsSync(out) ? readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];

if (args.includes('--build')) {
  const latest = new Map(rows.map((row) => [row.kbId, row]));
  const usable = [...latest.values()].filter((row) => row.confidence === 'high' || row.confidence === 'medium');
  const round = (n) => Math.round(n * 100000) / 100000;
  const counts = Object.groupBy([...latest.values()], (row) => row.confidence);
  writeFileSync(join(state, 'geo.json'), JSON.stringify({ v: 1, spots: usable.map((row) => [row.kbId, round(row.lat), round(row.lng)]) }));
  console.log(JSON.stringify({ danji: danji.length, geocoded: latest.size, spots: usable.length, high: counts.high?.length ?? 0, medium: counts.medium?.length ?? 0, low: counts.low?.length ?? 0, none: counts.none?.length ?? 0 }));
  process.exit(0);
}

const key = readFileSync(new URL('../.env.local', import.meta.url), 'utf8').match(/^KAKAO_REST_API_KEY=(.*)$/m)?.[1]?.trim();
if (!key) throw new Error('.env.local에 KAKAO_REST_API_KEY가 없습니다.');
const done = new Set(rows.map((row) => row.kbId));
const norm = (s) => s.normalize('NFC').toLowerCase().replace(/아파트|[\s()[\]·.,_-]/g, '');

async function search(query) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const r = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?size=10&query=${encodeURIComponent(query)}`, { headers: { Authorization: `KakaoAK ${key}` }, signal: AbortSignal.timeout(15000) }).catch(() => null);
    if (r?.ok) return (await r.json()).documents;
    if (r && (r.status === 401 || r.status === 403)) throw new Error(`Kakao 키 오류 ${r.status}: ${(await r.text()).slice(0, 160)}`);
    await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
  }
  return [];
}

/** Only an apartment in the right neighbourhood whose name matches counts as found. */
function pick(docs, name, dong, region) {
  const want = norm(name), place = region.split(' ').at(-1);
  const scored = docs
    .filter((d) => /아파트|주거시설/.test(d.category_name) && !/(상가|관리사무소|경로당|어린이집|\d+동$)/.test(d.place_name))
    .map((d) => {
      const got = norm(d.place_name);
      const inDong = d.address_name.includes(dong), inRegion = d.address_name.includes(place);
      const nums = (want.match(/\d+/g) ?? []).every((n) => (got.match(/\d+/g) ?? []).includes(n));
      const nameHit = got.includes(want) || want.includes(got);
      return { d, inDong, inRegion, nums, nameHit, score: (inDong ? 4 : 0) + (inRegion ? 2 : 0) + (nameHit ? 4 : 0) + (nums ? 1 : 0) };
    })
    .filter((c) => c.inRegion || c.inDong)
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return null;
  const confidence = best.inDong && best.nameHit && best.nums ? 'high' : best.nums && (best.inDong || best.nameHit) ? 'medium' : 'low';
  return { d: best.d, confidence };
}

let list = danji.filter((row) => !done.has(row[3]));
if (sample) list = [...list].sort(() => Math.random() - 0.5).slice(0, sample);
const counts = { high: 0, medium: 0, low: 0, none: 0 };
let next = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (next < list.length) {
    const [r, name, dong, kbId] = list[next++];
    const region = regions[r];
    const plain = name.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
    let found = pick(await search(`${region.split(' ').at(-1)} ${dong} ${plain}`), name, dong, region);
    if (!found || found.confidence === 'low') {
      const retry = pick(await search(`${dong} ${plain} 아파트`), name, dong, region);
      if (retry && (!found || retry.confidence !== 'low')) found = retry;
    }
    const row = found
      ? { kbId, lat: Number(found.d.y), lng: Number(found.d.x), place: found.d.place_name, address: found.d.road_address_name || found.d.address_name, confidence: found.confidence }
      : { kbId, lat: null, lng: null, confidence: 'none' };
    counts[row.confidence] += 1;
    if (sample) console.log(`${row.confidence.padEnd(6)} ${region} ${dong} ${name} -> ${row.place ?? '-'} | ${row.address ?? ''}`);
    else {
      appendFileSync(out, JSON.stringify(row) + '\n');
      if ((counts.high + counts.medium + counts.low + counts.none) % 1000 === 0) console.log(JSON.stringify(counts));
    }
  }
}));
console.log(JSON.stringify({ processed: list.length, ...counts }));
