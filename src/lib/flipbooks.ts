/**
 * Interactive flipbooks: made in /admin/books, read by anyone at /book/{id} once published.
 *
 * With Firebase, a book is one Firestore document `flipbooks/{id}` and its files live in Cloudflare
 * R2 under `flipbooks/{id}/` (api/flipbook-files.ts signs each upload). Without it (local demo) both
 * are kept in IndexedDB, because page images are far too large for localStorage.
 *
 * Element positions are percentages of the page and text sizes are in page units (a page is 1000
 * wide), so one layout renders the same in the editor, the viewer and a thumbnail. Any element can
 * carry actions (open a link, go to a page, pop something up, show or hide another element).
 */
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { firebaseAuth, firebaseDb, isFirebaseConfigured } from "./firebase";
import type { BookReaderSettings } from "./book-reader";

export type BookAction =
  | { kind: "url"; url: string }
  | { kind: "page"; pageId: string }
  | { kind: "tel"; phone: string }
  | { kind: "play"; targetId: string }
  | { kind: "popupWeb"; url: string }
  | { kind: "popupImage"; src: string }
  | { kind: "popupMessage"; title: string; body: string }
  | { kind: "toggle"; targetId: string }
  | { kind: "popupVideo"; src: string; start?: number; end?: number };

export type BookAnimation = "none" | "fade" | "up" | "left" | "zoom";

type Box = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  opacity?: number;
  /** Starts hidden until a 표시/숨기기 action shows it. */
  hidden?: boolean;
  animation?: BookAnimation;
  /** Seconds. */
  delay?: number;
  duration?: number;
  actions?: BookAction[];
  /** When the actions run. */
  trigger?: "click" | "hover";
  shadow?: boolean;
  /** Page units; on text this is the letter outline. */
  borderWidth?: number;
  borderColor?: string;
  /** 항상 표시: drawn on every page of the book. */
  everyPage?: boolean;
  /** Elements sharing a groupId are selected and moved together. */
  groupId?: string;
  locked?: boolean;
};
export type ImageElement = Box & {
  type: "image";
  src: string;
  fit: "cover" | "contain";
  radius?: number;
  /** Photo frame: a shape name from graphics.ts. */
  mask?: string;
  brightness?: number;
  contrast?: number;
  saturate?: number;
  grayscale?: number;
  sepia?: number;
  blur?: number;
  flipX?: boolean;
  flipY?: boolean;
  /** Crop: 100 is the whole photo; focus is where it stays centred. */
  zoom?: number;
  focusX?: number;
  focusY?: number;
};
export type TextElement = Box & {
  type: "text";
  text: string;
  size: number;
  color: string;
  bold: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  textCase?: "none" | "upper" | "lower";
  align: "left" | "center" | "right" | "justify";
  font?: string;
  vertical?: boolean;
  /** Thousandths of the text size. */
  spacing?: number;
  lineHeight?: number;
  background?: string;
  columns?: number;
  effect?: "none" | "shadow" | "lift" | "neon" | "hollow" | "gradient";
  effectColor?: string;
};
/** One photo slot of a grid; position and size are percentages of the grid. */
export type GridCell = { x: number; y: number; w: number; h: number; src?: string; zoom?: number; focusX?: number; focusY?: number };
export type GridElement = Box & { type: "grid"; cells: GridCell[]; gap: number; radius: number };
export type ShapeElement = Box & { type: "shape"; shape: string; fill: string; fill2?: string; angle?: number; dashed?: boolean };
export type LineElement = Box & { type: "line"; color: string; thickness: number; style: "solid" | "dashed" | "dotted"; arrow: boolean };
export type IconElement = Box & { type: "icon"; name: string; color: string; stroke: number };
export type ChartElement = Box & { type: "chart"; kind: "bar" | "line" | "pie" | "donut"; labels: string[]; values: number[]; color: string; textColor: string };
export type LinkElement = Box & { type: "link" };
export type ButtonElement = Box & { type: "button"; label: string; color: string; textColor: string; radius: number };
/** contain shows the whole video, with bars if the shapes differ; cover shows the chosen area of it, filling the slot. */
export type VideoFit = "cover" | "contain";
/** The chosen area: zoom 100 is the largest that fits; x and y (0-100) are where it sits within the video. */
export type VideoCrop = { fit?: VideoFit; cropZoom?: number; cropX?: number; cropY?: number };

/** The chosen area as fractions of the video frame, for a video and a slot of the given proportions. */
export function cropRect(frameRatio: number, slotRatio: number, crop: VideoCrop) {
  const zoom = (crop.cropZoom ?? 100) / 100;
  const w = (slotRatio > frameRatio ? 1 : slotRatio / frameRatio) / zoom;
  const h = (slotRatio > frameRatio ? frameRatio / slotRatio : 1) / zoom;
  return { w, h, left: (1 - w) * ((crop.cropX ?? 50) / 100), top: (1 - h) * ((crop.cropY ?? 50) / 100) };
}

/** start and end are seconds into the video; autoPlay starts muted, as browsers require. */
export type VideoElement = Box & { type: "video"; src: string; start?: number; end?: number; autoPlay?: boolean; controls?: boolean } & VideoCrop;
export type SlideshowElement = Box & { type: "slideshow"; images: string[]; auto: boolean; variant: "basic" | "peek" };
export type AudioElement = Box & { type: "audio"; src: string; color: string };
export type TableElement = Box & { type: "table"; rows: string[][]; size: number; color: string; headerColor: string };
export type MapElement = Box & { type: "map"; address: string };
export type EmbedElement = Box & { type: "embed"; url: string };
export type TooltipElement = Box & { type: "tooltip"; text: string; color: string };
export type PageNumberElement = Box & { type: "pagenumber"; size: number; color: string; showTotal: boolean };
export type TocElement = Box & { type: "toc"; size: number; color: string };
export type BookElement = GridElement | LineElement | IconElement | ChartElement | ImageElement | TextElement | ShapeElement | LinkElement | ButtonElement | VideoElement | SlideshowElement | AudioElement | TableElement | MapElement | EmbedElement | TooltipElement | PageNumberElement | TocElement;

export type BookPage = { id: string; title?: string; image?: string; background?: string; elements: BookElement[] };

export type Flipbook = {
  id: string;
  title: string;
  /** Page size in editor pixels (A4 is 794 x 1123). */
  width: number;
  height: number;
  /** Colour behind the book in the viewer. */
  background: string;
  /** Reader defaults; omitted in older books. */
  reader?: Partial<BookReaderSettings>;
  pages: BookPage[];
  /** Files uploaded to this book, offered again in the image and video panels. */
  assets: { url: string; kind: "image" | "video" | "audio" }[];
  published: boolean;
  createdAt: number;
  updatedAt: number;
};

export const uid = (size = 10) => {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(size)), (n) => chars[n % chars.length]).join("");
};

export const blankPage = (): BookPage => ({ id: uid(), elements: [] });

export function createFlipbook(title = "제목 없는 책"): Flipbook {
  const now = Date.now();
  return { id: uid(), title, width: 794, height: 1123, background: "#1d2026", pages: [blankPage(), blankPage()], assets: [], published: false, createdAt: now, updatedAt: now };
}

export const bookLink = (id: string) => `${window.location.origin}/book/${id}`;

/** Web address safe to open from a public page: only http(s), mail and phone links. */
export function safeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    return ["http:", "https:", "mailto:", "tel:"].includes(new URL(withScheme).protocol) ? withScheme : null;
  } catch {
    return null;
  }
}

/* Spreads: the front cover sits alone, then facing pairs, and an even page count ends on a lone back cover. */
export type Spread = { left: number | null; right: number | null };

export function buildSpreads(pageCount: number): Spread[] {
  if (pageCount === 0) return [];
  const spreads: Spread[] = [{ left: null, right: 0 }];
  for (let left = 1; left < pageCount; left += 2) spreads.push({ left, right: left + 1 < pageCount ? left + 1 : null });
  return spreads;
}

export const spreadOfPage = (pageIndex: number) => Math.ceil(pageIndex / 2);

/* Local demo store */
const DB_NAME = "index-flipbooks";
function localStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore("books", { keyPath: "id" });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const request = run(db.transaction("books", mode).objectStore("books"));
      request.onsuccess = () => { resolve(request.result); db.close(); };
      request.onerror = () => { reject(request.error); db.close(); };
    };
  });
}

/** Firestore rejects `undefined` fields; a JSON round trip drops them. */
const plain = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

export async function listFlipbooks(): Promise<Flipbook[]> {
  const books = isFirebaseConfigured && firebaseDb
    ? (await getDocs(collection(firebaseDb, "flipbooks"))).docs.map((item) => item.data() as Flipbook)
    : await localStore<Flipbook[]>("readonly", (store) => store.getAll());
  return books.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getFlipbook(id: string): Promise<Flipbook | null> {
  if (isFirebaseConfigured && firebaseDb) {
    const snapshot = await getDoc(doc(firebaseDb, "flipbooks", id));
    return snapshot.exists() ? (snapshot.data() as Flipbook) : null;
  }
  return (await localStore<Flipbook | undefined>("readonly", (store) => store.get(id))) ?? null;
}

export async function saveFlipbook(book: Flipbook): Promise<void> {
  const next = plain({ ...book, updatedAt: Date.now() });
  if (isFirebaseConfigured && firebaseDb) await setDoc(doc(firebaseDb, "flipbooks", book.id), next);
  else await localStore("readwrite", (store) => store.put(next));
}

export async function deleteFlipbook(id: string): Promise<void> {
  if (isFirebaseConfigured && firebaseDb) {
    await fileRequest<{ deleted: number }>({ action: "delete", bookId: id });
    await deleteDoc(doc(firebaseDb, "flipbooks", id));
    return;
  }
  await localStore("readwrite", (store) => store.delete(id));
}

export const MAX_MEDIA_BYTES = 100 * 1024 * 1024; // keep in step with api/flipbook-files.ts

/** POST to an admin-only function with the signed-in user's ID token. */
export async function adminRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const token = await firebaseAuth?.currentUser?.getIdToken();
  if (!token) throw new Error("관리자 로그인이 필요합니다.");
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((result as { error?: string }).error || "서버에 연결하지 못했습니다.");
  return result as T;
}

const fileRequest = <T,>(body: Record<string, unknown>) => adminRequest<T>("/api/flipbook-files", body);

/** Stores one file of a book (image, video, audio) and returns the address to put in the book. */
export async function uploadBookFile(bookId: string, file: Blob): Promise<string> {
  if (file.size >= MAX_MEDIA_BYTES) throw new Error("파일은 100MB보다 작아야 합니다.");
  if (isFirebaseConfigured) {
    const { uploadUrl, publicUrl, cacheControl } = await fileRequest<{ uploadUrl: string; publicUrl: string; cacheControl: string }>({ action: "sign", bookId, contentType: file.type, size: file.size });
    const upload = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type, "Cache-Control": cacheControl }, body: file });
    if (!upload.ok) throw new Error(`파일을 올리지 못했습니다 (${upload.status}).`);
    return publicUrl;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  const toBlob = (type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  const webp = await toBlob("image/webp", 0.86);
  if (webp?.type === "image/webp") return webp;
  // Safari can't encode WebP and silently hands back a PNG.
  const jpeg = await toBlob("image/jpeg", 0.88);
  if (!jpeg) throw new Error("이미지를 변환하지 못했습니다.");
  return jpeg;
}

const MAX_PAGE_SIDE = 2000;

/** Renders each PDF page and hands it over in order, so a long book can fill in as it converts. */
export async function convertPdf(
  file: File,
  onPage: (page: { image: Blob; width: number; height: number; index: number; total: number }) => Promise<void>,
): Promise<void> {
  const [pdfjs, { default: workerUrl }] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: MAX_PAGE_SIDE / Math.max(base.width, base.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("PDF를 그리지 못했습니다.");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, canvas, viewport }).promise;
      page.cleanup();
      await onPage({ image: await encode(canvas), width: base.width, height: base.height, index: number - 1, total: pdf.numPages });
    }
  } finally {
    await pdf.destroy();
  }
}

/** Shrinks a picked image to a sensible size; animated or vector files are kept as they are. */
export async function prepareImage(file: File): Promise<{ image: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = bitmap;
    if (file.type === "image/gif" || file.type === "image/svg+xml") return { image: file, width, height };
    const scale = Math.min(1, MAX_PAGE_SIDE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이미지를 처리하지 못했습니다.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { image: await encode(canvas), width, height };
  } finally {
    bitmap.close();
  }
}

/** The video id if this is a YouTube address, whichever form it was pasted in. */
export function youtubeId(url: string): string | null {
  return /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/.exec(url)?.[1] ?? null;
}

/** Typefaces offered for text. Google-hosted ones are only requested when a book uses them. */
export const BOOK_FONTS: { value: string; label: string; google?: string }[] = [
  { value: "inherit", label: "기본 서체" },
  { value: "'Noto Sans KR'", label: "노토 산스", google: "Noto+Sans+KR:wght@400;700" },
  { value: "'Noto Serif KR'", label: "노토 세리프", google: "Noto+Serif+KR:wght@400;700" },
  { value: "'Nanum Gothic'", label: "나눔고딕", google: "Nanum+Gothic:wght@400;700" },
  { value: "'Nanum Myeongjo'", label: "나눔명조", google: "Nanum+Myeongjo:wght@400;700" },
  { value: "'Gowun Dodum'", label: "고운돋움", google: "Gowun+Dodum" },
  { value: "'Black Han Sans'", label: "검은고딕", google: "Black+Han+Sans" },
  { value: "'Jua'", label: "주아", google: "Jua" },
  { value: "'Montserrat'", label: "Montserrat", google: "Montserrat:wght@400;700" },
  { value: "'Playfair Display'", label: "Playfair Display", google: "Playfair+Display:wght@400;700" },
];

export function loadBookFonts(values: Iterable<string>) {
  const wanted = new Set(values);
  const families = BOOK_FONTS.filter((font) => font.google && wanted.has(font.value)).map((font) => `family=${font.google}`);
  if (families.length === 0) return;
  const href = `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

export const fontsInBook = (book: Flipbook) => book.pages.flatMap((page) => page.elements).flatMap((element) => (element.type === "text" && element.font ? [element.font] : []));

/** A page's name in the table of contents: its title, or the first text on it. */
export function pageLabel(page: BookPage): string | null {
  if (page.title?.trim()) return page.title.trim();
  const text = page.elements.find((element) => element.type === "text" && element.text.trim());
  return text?.type === "text" ? text.text.trim().split("\n")[0].slice(0, 40) : null;
}

export type VideoSource = { kind: "youtube" | "vimeo"; id: string; urlStart?: number; vertical?: boolean } | { kind: "file"; url: string };

/** Reads "1:23", "1:02:03" or "83" as seconds; null when it isn't a time. */
export function parseTime(value: string): number | null {
  const parts = value.trim().split(":");
  if (parts.length > 3 || parts.some((part) => !/^\d+(\.\d+)?$/.test(part))) return null;
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

export function formatTime(seconds?: number): string {
  if (seconds === undefined) return "";
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

/** A link's own start time, as in youtu.be/abc?t=90 or &t=1m30s. */
function linkStart(url: string): number | undefined {
  const match = /[?&#]t=(?:(\d+)h)?(?:(\d+)m)?(\d+)?s?(?:&|$)/.exec(url);
  if (!match || !(match[1] || match[2] || match[3])) return undefined;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

/** What a pasted video address points to; null when it can't be played. */
export function videoSource(raw: string): VideoSource | null {
  const url = raw.trim();
  if (!url) return null;
  const youtube = youtubeId(url);
  if (youtube) return { kind: "youtube", id: youtube, urlStart: linkStart(url), vertical: url.includes("/shorts/") };
  const vimeo = /vimeo\.com\/(?:video\/)?(\d{6,})/.exec(url)?.[1];
  if (vimeo) return { kind: "vimeo", id: vimeo, urlStart: linkStart(url) };
  if (url.startsWith("data:video/")) return { kind: "file", url };
  if (/^https?:\/\/[^\s]+\.(mp4|m4v|webm|ogv|mov)(\?[^\s]*)?(#[^\s]*)?$/i.test(url)) return { kind: "file", url: url.split("#")[0] };
  return null;
}

/**
 * Player address for YouTube and Vimeo. Vimeo's embed has no end time. autoPlay starts at once;
 * muted is needed when no one has clicked yet. controls off keeps the picture clean.
 */
export function videoEmbedUrl(source: Extract<VideoSource, { id: string }>, options: { start?: number; end?: number; autoPlay?: boolean; muted?: boolean; controls?: boolean }): string {
  const start = Math.floor(options.start ?? source.urlStart ?? 0);
  if (source.kind === "vimeo") {
    const params = new URLSearchParams({ title: "0", byline: "0", portrait: "0" });
    if (options.autoPlay) params.set("autoplay", "1");
    if (options.muted) params.set("muted", "1");
    if (!options.controls) params.set("controls", "0");
    return `https://player.vimeo.com/video/${source.id}?${params}${start ? `#t=${start}s` : ""}`;
  }
  const params = new URLSearchParams({ rel: "0", playsinline: "1", iv_load_policy: "3", enablejsapi: "1", origin: window.location.origin, controls: options.controls ? "1" : "0" });
  if (!options.controls) params.set("fs", "0");
  if (start) params.set("start", String(start));
  if (options.end && options.end > start) params.set("end", String(Math.ceil(options.end)));
  if (options.autoPlay) params.set("autoplay", "1");
  if (options.muted) params.set("mute", "1");
  return `https://www.youtube-nocookie.com/embed/${source.id}?${params}`;
}
