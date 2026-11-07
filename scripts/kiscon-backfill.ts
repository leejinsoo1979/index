// One-shot backfill of the KISCON 건설업 공시 index (api/_kiscon.ts) from 2003 to yesterday.
// Needs DATA_GO_KR_SERVICE_KEY and FIREBASE_SERVICE_ACCOUNT in the environment or .env.local.
// Resumable: it continues from kisconSync/state.syncedThrough. Run: npm run kiscon:backfill
import { runKisconSync } from "../api/_kiscon.js";

const report = await runKisconSync(Number.POSITIVE_INFINITY, (msg) => console.log(msg));
console.log(report.done ? `완료: ${report.syncedThrough}까지 반영` : `중단: ${report.syncedThrough}까지 반영`, report);
