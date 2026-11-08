/**
 * 게시판 (Case Library posts) — shared by the public case pages and /admin/boards.
 *
 * With Firebase configured, posts live in Firestore `posts/{id}` (`board: "cases"`), read through
 * realtime listeners: the public pages query `visible == true`, the admin screen reads everything
 * (firestore.rules: anyone may read visible posts, only admins may read hidden ones or write).
 * Without Firebase (local demo) the same API is backed by localStorage.
 *
 * The body is Markdown; `## ` headings become the article's sections (table of contents), GFM
 * tables become tables and `> ` lines become callouts, so the detail page keeps its layout.
 * Until an admin imports or writes posts, the site shows the original sample cases
 * (src/data/cases.ts) — imported with their old numeric ids so /cases/1 links keep working.
 */
import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { firebaseDb, isFirebaseConfigured } from "./firebase";
import { caseArticle, cases as sampleCases, type ArticleBlock, type ArticleSection, type CaseItem } from "../data/cases";

export const POST_GROUPS = ["방수", "마감", "설비", "단열", "전기", "기타"] as const;
export type PostGroup = (typeof POST_GROUPS)[number];

export type Post = {
  id: string;
  board: "cases";
  title: string;
  group: PostGroup;
  category: string;
  /** YYYY.MM.DD (as shown on the site) */
  date: string;
  excerpt: string;
  image: string;
  /** Markdown */
  body: string;
  visible: boolean;
  views: number;
  createdAt: number;
  updatedAt: number;
  updatedBy?: string;
};
export type PostInput = Pick<Post, "title" | "group" | "category" | "date" | "excerpt" | "image" | "body" | "visible">;

type Live<T> = { data: T; loading: boolean; error: string | null };

const LOCAL_KEY = "index:posts:v1";
const firestoreEnabled = () => Boolean(isFirebaseConfigured && firebaseDb);

// ── Markdown ⇄ article sections ───────────────────────────────────────────────

export function sectionsToMarkdown(sections: ArticleSection[]): string {
  const block = (b: ArticleBlock) => {
    if (b.type === "paragraph") return b.text;
    if (b.type === "callout") return b.text.split("\n").map((l) => `> ${l}`).join("\n");
    const row = (cells: string[]) => `| ${cells.map((c) => c.replace(/\|/g, "\\|")).join(" | ")} |`;
    return [row(b.headers), row(b.headers.map(() => "---")), ...b.rows.map(row)].join("\n");
  };
  return sections.map((s) => [`## ${s.heading}`, ...s.blocks.map(block)].join("\n\n")).join("\n\n");
}

export function markdownToSections(md: string): ArticleSection[] {
  const sections: ArticleSection[] = [];
  let current: ArticleSection | null = null;
  const ensure = () => {
    if (!current) {
      current = { id: `sec-${sections.length + 1}`, heading: "본문", blocks: [] };
      sections.push(current);
    }
    return current;
  };
  const chunks = md.replace(/\r\n/g, "\n").split(/\n{2,}/);
  for (const raw of chunks) {
    const chunk = raw.trim();
    if (!chunk) continue;
    const heading = chunk.match(/^#{1,3}\s+(.+)$/m);
    if (heading && chunk.startsWith("#")) {
      current = { id: `sec-${sections.length + 1}`, heading: heading[1]!.trim(), blocks: [] };
      sections.push(current);
      const rest = chunk.split("\n").slice(1).join("\n").trim();
      if (rest) current.blocks.push({ type: "paragraph", text: rest });
      continue;
    }
    const lines = chunk.split("\n");
    if (lines.every((l) => l.trim().startsWith(">"))) {
      ensure().blocks.push({ type: "callout", text: lines.map((l) => l.replace(/^\s*>\s?/, "")).join("\n") });
      continue;
    }
    if (lines.length >= 2 && lines.every((l) => l.trim().startsWith("|")) && /^\s*\|?\s*:?-{2,}/.test(lines[1]!)) {
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
      ensure().blocks.push({ type: "table", headers: cells(lines[0]!), rows: lines.slice(2).map(cells) });
      continue;
    }
    ensure().blocks.push({ type: "paragraph", text: chunk });
  }
  return sections;
}

// ── samples / normalisation ───────────────────────────────────────────────────

const sampleBody = sectionsToMarkdown(caseArticle);

export function samplePosts(): Post[] {
  return sampleCases.map((c) => ({
    id: String(c.id),
    board: "cases",
    title: c.title,
    group: c.group,
    category: c.category,
    date: c.date,
    excerpt: c.excerpt,
    image: c.image,
    body: sampleBody,
    visible: true,
    views: c.views ?? 0,
    createdAt: 0,
    updatedAt: 0,
  }));
}

function normalize(id: string, raw: Record<string, unknown>): Post {
  const group = (POST_GROUPS as readonly string[]).includes(raw.group as string) ? (raw.group as PostGroup) : "기타";
  return {
    id,
    board: "cases",
    title: String(raw.title ?? ""),
    group,
    category: String(raw.category ?? group),
    date: String(raw.date ?? ""),
    excerpt: String(raw.excerpt ?? ""),
    image: String(raw.image ?? ""),
    body: String(raw.body ?? ""),
    visible: raw.visible !== false,
    views: Number(raw.views ?? 0),
    createdAt: Number(raw.createdAt ?? 0),
    updatedAt: Number(raw.updatedAt ?? 0),
    updatedBy: (raw.updatedBy as string) || undefined,
  };
}

const byDate = (a: Post, b: Post) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt;

/** A post as the case cards/detail page expect it (NEW = written in the last 30 days). */
export function toCaseItem(p: Post): CaseItem {
  const d = new Date(p.date.replace(/\./g, "-"));
  const isNew = !Number.isNaN(d.getTime()) && Date.now() - d.getTime() < 30 * 864e5;
  return { id: p.id, title: p.title, group: p.group, category: p.category, date: p.date, excerpt: p.excerpt, image: p.image, views: p.views, isNew };
}

// ── local fallback ────────────────────────────────────────────────────────────

const localListeners = new Set<() => void>();
function readLocal(): Post[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (raw) return (JSON.parse(raw) as Post[]).map((p) => normalize(p.id, p as unknown as Record<string, unknown>));
  } catch {
    // fall through
  }
  return samplePosts();
}
function writeLocal(rows: Post[]) {
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(rows));
  localListeners.forEach((fn) => fn());
}
function subscribeLocal(fn: () => void) {
  localListeners.add(fn);
  const onStorage = (e: StorageEvent) => e.key === LOCAL_KEY && fn();
  window.addEventListener("storage", onStorage);
  fn();
  return () => {
    localListeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

// ── reads ─────────────────────────────────────────────────────────────────────

/**
 * Live post list. `usingSamples` is true while the board has no stored posts yet (the site then
 * shows the original sample cases; the admin screen offers to import them).
 */
export function usePosts(options: { includeHidden?: boolean } = {}): Live<Post[]> & { usingSamples: boolean } {
  const { includeHidden = false } = options;
  const [state, setState] = useState<Live<Post[]> & { usingSamples: boolean }>({ data: [], loading: true, error: null, usingSamples: false });

  useEffect(() => {
    if (!firestoreEnabled()) {
      return subscribeLocal(() => {
        const rows = readLocal().filter((p) => includeHidden || p.visible);
        setState({ data: rows.sort(byDate), loading: false, error: null, usingSamples: !window.localStorage.getItem(LOCAL_KEY) });
      });
    }
    const col = collection(firebaseDb!, "posts");
    const q = includeHidden ? query(col, where("board", "==", "cases")) : query(col, where("board", "==", "cases"), where("visible", "==", true));
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => normalize(d.id, d.data()));
        const empty = rows.length === 0;
        setState({ data: (empty ? samplePosts() : rows).sort(byDate), loading: false, error: null, usingSamples: empty });
      },
      (error) => setState({ data: samplePosts().sort(byDate), loading: false, error: error.message, usingSamples: true }),
    );
  }, [includeHidden]);

  return state;
}

export function usePost(id: string | undefined): Live<Post | null> {
  const { data, loading, error } = usePosts();
  return { data: id ? data.find((p) => p.id === id) ?? null : null, loading, error };
}

// ── writes (admins) ───────────────────────────────────────────────────────────

const clean = (input: PostInput): PostInput => ({
  title: input.title.trim(),
  group: input.group,
  category: input.category.trim() || input.group,
  date: input.date.trim(),
  excerpt: input.excerpt.trim(),
  image: input.image.trim(),
  body: input.body.trim(),
  visible: input.visible,
});

export async function savePost(input: PostInput, id: string | undefined, updatedBy?: string | null): Promise<string> {
  const data = clean(input);
  if (!data.title) throw new Error("제목을 입력해 주세요.");
  if (!/^\d{4}\.\d{2}\.\d{2}$/.test(data.date)) throw new Error("날짜는 2026.11.08 형식으로 입력해 주세요.");
  const now = Date.now();
  if (!firestoreEnabled()) {
    const rows = readLocal();
    const existing = id ? rows.find((p) => p.id === id) : undefined;
    const post: Post = { ...(existing ?? { id: `p${now}`, board: "cases", views: 0, createdAt: now }), ...data, updatedAt: now, updatedBy: updatedBy ?? undefined } as Post;
    writeLocal(existing ? rows.map((p) => (p.id === post.id ? post : p)) : [post, ...rows]);
    return post.id;
  }
  const ref = id ? doc(firebaseDb!, "posts", id) : doc(collection(firebaseDb!, "posts"));
  if (id) await updateDoc(ref, { ...data, updatedAt: now, updatedBy: updatedBy ?? null });
  else await setDoc(ref, { ...data, board: "cases", views: 0, createdAt: now, updatedAt: now, updatedBy: updatedBy ?? null });
  return ref.id;
}

export async function setPostVisible(id: string, visible: boolean): Promise<void> {
  if (!firestoreEnabled()) {
    writeLocal(readLocal().map((p) => (p.id === id ? { ...p, visible, updatedAt: Date.now() } : p)));
    return;
  }
  await updateDoc(doc(firebaseDb!, "posts", id), { visible, updatedAt: Date.now() });
}

export async function deletePost(id: string): Promise<void> {
  if (!firestoreEnabled()) {
    writeLocal(readLocal().filter((p) => p.id !== id));
    return;
  }
  await deleteDoc(doc(firebaseDb!, "posts", id));
}

/** Copy the original sample cases into the board (same ids, so old links keep working). */
export async function importSamplePosts(): Promise<number> {
  const rows = samplePosts().map((p) => ({ ...p, createdAt: Date.now(), updatedAt: Date.now() }));
  if (!firestoreEnabled()) {
    writeLocal(rows);
    return rows.length;
  }
  const batch = writeBatch(firebaseDb!);
  for (const { id, ...data } of rows) batch.set(doc(firebaseDb!, "posts", id), data);
  await batch.commit();
  return rows.length;
}
