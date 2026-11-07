import { getBytes, getDownloadURL, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';

/**
 * Object storage for the in-browser port. The original wrote to a local `.storage`
 * directory on the server; here files go to Firebase Storage under
 * archi-studio/{uid}/{key} (or memory only when Firebase isn't configured).
 *
 * Files written in this session are also kept in memory: reading bytes back from
 * Firebase Storage in the browser requires bucket CORS configuration, so same-session
 * reads (process an upload, download a fresh export) never depend on it.
 */
type Backend = { storage: FirebaseStorage; root: string } | null;

let backend: Backend = null;
const memory = new Map<string, { data: Uint8Array; url?: string }>();

export function setStorageBackend(storage: FirebaseStorage | null, uid: string | null) {
  backend = storage && uid ? { storage, root: `archi-studio/${uid}` } : null;
}

function assertKey(key: string) {
  if (!key || key.startsWith('/') || key.split('/').some((part) => part === '..' || part === '')) {
    throw new Error('잘못된 storage key 입니다.');
  }
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  html: 'text/html; charset=utf-8',
  json: 'application/json',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export function mimeTypeForKey(key: string): string {
  return MIME_BY_EXT[key.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}

export async function saveStorageFile(key: string, data: Uint8Array): Promise<string> {
  assertKey(key);
  if (backend) {
    await uploadBytes(ref(backend.storage, `${backend.root}/${key}`), data, { contentType: mimeTypeForKey(key) });
  }
  const prev = memory.get(key);
  if (prev?.url) URL.revokeObjectURL(prev.url);
  memory.set(key, { data });
  return key;
}

export async function readStorageFile(key: string): Promise<Uint8Array> {
  assertKey(key);
  const cached = memory.get(key);
  if (cached) return cached.data;
  if (!backend) throw new Error(`storage 파일을 찾을 수 없습니다: ${key}`);
  try {
    const data = new Uint8Array(await getBytes(ref(backend.storage, `${backend.root}/${key}`)));
    memory.set(key, { data });
    return data;
  } catch (error) {
    throw new Error(
      `저장된 파일을 읽지 못했습니다 (${key}). Firebase Storage 버킷의 CORS 설정이 필요할 수 있습니다: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/** A URL the browser can load directly (img src, download link). Prefers a same-session blob URL. */
export async function storageFileUrl(key: string): Promise<string> {
  assertKey(key);
  const entry = memory.get(key);
  if (entry) {
    entry.url ??= URL.createObjectURL(new Blob([entry.data as BlobPart], { type: mimeTypeForKey(key) }));
    return entry.url;
  }
  if (backend) return getDownloadURL(ref(backend.storage, `${backend.root}/${key}`));
  throw new Error(`storage 파일을 찾을 수 없습니다: ${key}`);
}

/** Durable URL (survives reloads) for storing in records or sending to the server. */
export async function storageRemoteUrl(key: string): Promise<string | null> {
  assertKey(key);
  return backend ? getDownloadURL(ref(backend.storage, `${backend.root}/${key}`)) : null;
}

/** Korean font for PDF export, served from /public (4.5MB, loaded only when exporting PDF). */
let fontPromise: Promise<Uint8Array | undefined> | null = null;
export function loadKoreanFontBytes(): Promise<Uint8Array | undefined> {
  fontPromise ??= fetch('/fonts/noto-sans-kr/NotoSansKR-Regular.otf')
    .then(async (res) => (res.ok ? new Uint8Array(await res.arrayBuffer()) : undefined))
    .catch(() => undefined)
    .then((bytes) => {
      if (!bytes) {
        console.warn('[export] 한글 폰트를 찾지 못했습니다. PDF 한글이 깨질 수 있습니다.');
        fontPromise = null;
      }
      return bytes;
    });
  return fontPromise;
}
