import { getAuth } from "firebase-admin/auth";
import { isServerFirestoreConfigured, serverFirestore } from "./_firebaseServer.js";
import type { RegulationSource } from "./_regulations.js";

/**
 * INDEX Wiki as the chatbot's knowledge base. Wiki pages live per owner in Firestore
 * `archiStudio/{uid}/WikiPage/{id}` (src/archi/wiki/repository.ts); only pages an admin
 * marked 검수 완료 (`status: "published"`) are used. Owners: WIKI_OWNER_UIDS (comma-
 * separated) or, by default, the Firebase users of ADMIN_EMAILS. Needs
 * FIREBASE_SERVICE_ACCOUNT; without it the wiki is simply not consulted.
 */
export type WikiDoc = {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  aliases: string[];
  updatedAt: string;
};

export type WikiHit = WikiDoc & { score: number; excerpt: string };

let cache: { at: number; pages: WikiDoc[] } | null = null;
const CACHE_MS = 5 * 60_000;

async function ownerUids(): Promise<string[]> {
  const explicit = (process.env.WIKI_OWNER_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (explicit.length) return explicit;
  const emails = (process.env.ADMIN_EMAILS || "sbbc212@gmail.com").split(",").map((s) => s.trim()).filter(Boolean);
  const users = await Promise.all(emails.map((email) => getAuth().getUserByEmail(email).catch(() => null)));
  return users.filter((u): u is NonNullable<typeof u> => Boolean(u)).map((u) => u.uid);
}

export async function loadPublishedWiki(): Promise<WikiDoc[]> {
  if (!isServerFirestoreConfigured()) return [];
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.pages;
  const db = serverFirestore();
  const pages: WikiDoc[] = [];
  for (const uid of await ownerUids()) {
    const snap = await db.collection(`archiStudio/${uid}/WikiPage`).where("status", "==", "published").get();
    for (const d of snap.docs) {
      const p = d.data() as Partial<WikiDoc>;
      if (!p.title || !p.content) continue;
      pages.push({
        id: d.id,
        title: String(p.title),
        content: String(p.content),
        category: String(p.category ?? ""),
        tags: Array.isArray(p.tags) ? p.tags.map(String) : [],
        aliases: Array.isArray(p.aliases) ? p.aliases.map(String) : [],
        updatedAt: String(p.updatedAt ?? ""),
      });
    }
  }
  cache = { at: Date.now(), pages };
  return pages;
}

// ─── ranking (pure, testable) ───────────────────────────────────────────────

const STOP = new Set(["그리고", "하는", "있는", "어떻게", "무엇", "뭐야", "알려줘", "알려", "주세요", "해주세요", "인가요", "있나요", "되나요", "하나요", "경우", "관련", "대해", "대한"]);
// Common Korean endings stripped from words so "방수층은" matches "방수층".
const PARTICLE = /(은|는|이|가|을|를|에|에서|으로|로|와|과|의|도|만|까지|부터|이나|나|하고|에게|께|이랑|랑)$/;

export function wikiTerms(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((w) => (w.length > 2 ? w.replace(PARTICLE, "") : w))
    .filter((w) => w.length >= 2 && !STOP.has(w));
  return [...new Set(words)];
}

const count = (haystack: string, needle: string) => {
  let n = 0;
  for (let i = haystack.indexOf(needle); i !== -1 && n < 20; i = haystack.indexOf(needle, i + needle.length)) n += 1;
  return n;
};

function bestExcerpt(content: string, terms: string[], max = 900): string {
  const paragraphs = content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return content.slice(0, max);
  const scored = paragraphs.map((p, i) => ({ i, s: terms.reduce((acc, t) => acc + count(p.toLowerCase(), t), 0) }));
  const best = scored.sort((a, b) => b.s - a.s || a.i - b.i)[0]!.i;
  let out = paragraphs[best]!;
  for (let j = best + 1; j < paragraphs.length && out.length < max; j += 1) out += `\n\n${paragraphs[j]}`;
  return out.length > max ? `${out.slice(0, max)}…` : out;
}

export function rankWiki(pages: WikiDoc[], query: string, limit = 4): WikiHit[] {
  const terms = wikiTerms(query);
  if (terms.length === 0) return [];
  return pages
    .map((page) => {
      const title = page.title.toLowerCase();
      const meta = [...page.tags, ...page.aliases, page.category].join(" ").toLowerCase();
      const body = page.content.toLowerCase();
      let score = 0;
      let matched = 0;
      for (const t of terms) {
        const inTitle = title.includes(t);
        const inMeta = meta.includes(t);
        const inBody = count(body, t);
        if (inTitle || inMeta || inBody) matched += 1;
        score += (inTitle ? 6 : 0) + (inMeta ? 3 : 0) + Math.min(inBody, 5);
      }
      // Favour pages covering more of the question's terms.
      score *= matched / terms.length;
      return { ...page, score, excerpt: "" };
    })
    .filter((p) => p.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((p) => ({ ...p, excerpt: bestExcerpt(p.content, terms) }));
}

export async function searchWiki(query: string, limit = 4): Promise<WikiHit[]> {
  return rankWiki(await loadPublishedWiki(), query, limit);
}

/** System-prompt block with the most relevant 검수 완료 wiki excerpts for this question. */
export function wikiContext(hits: WikiHit[]): string {
  if (hits.length === 0) return "";
  const blocks = hits.map((h, i) => `[위키 ${i + 1}] ${h.title}${h.category ? ` (${h.category})` : ""}\n${h.excerpt}`);
  return `INDEX 위키(검수 완료 문서)에서 찾은 관련 내용:
${blocks.join("\n\n")}

위키 내용이 질문에 답하면 이를 우선 근거로 삼고 "(INDEX 위키: 문서 제목)"으로 출처를 밝힌다. 위키에 없는 내용은 지어내지 말고, 법령 조문·수치는 법령 원문 도구로 확인한다. 위키와 법령 원문이 다르면 법령 원문을 따른다.`;
}

export function wikiSources(hits: WikiHit[]): RegulationSource[] {
  const retrievedAt = new Date().toISOString();
  return hits.map((h) => ({
    id: `wiki_${h.id}`,
    title: h.title,
    sourceType: "knowledge_base",
    publisher: "INDEX 위키 (검수 완료)",
    url: "",
    snippet: h.excerpt.slice(0, 300),
    retrievedAt,
  }));
}
