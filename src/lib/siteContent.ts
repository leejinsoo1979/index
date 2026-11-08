/**
 * Admin-editable site content (menus, page copy, partner list, footer, …).
 *
 * Each block lives in Firestore `siteContent/{key}` as `{ json, updatedAt, updatedBy }` (the value is
 * stored as a JSON string because Firestore rejects nested arrays such as `[word, weight][]`), readable
 * by everyone and writable only by admins (firestore.rules). Pages read a block with
 * `useSiteContent(key, fallback)`: until an admin saves that block, the fallback — the defaults in
 * `src/data/*` — is shown, so nothing goes blank. Without Firebase (local demo) the same API uses
 * localStorage.
 *
 * Rule: operators change content in /admin, never by editing code. New content features should
 * read through this module and get an admin screen.
 */
import { useEffect, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc, deleteDoc } from "firebase/firestore";
import { firebaseDb, isFirebaseConfigured } from "./firebase";

const LOCAL_PREFIX = "index:siteContent:";

/** Known blocks. Add a key here when a new admin-editable block is introduced. */
export type SiteContentKey = "navigation" | "footer" | "about" | "partners" | "home" | "terms" | (string & {});

type Stored<T> = { value: T; updatedAt?: unknown; updatedBy?: string };
type RemoteDoc = { json?: string; updatedAt?: unknown; updatedBy?: string | null };

function readLocal<T>(key: string): T | undefined {
  try {
    const raw = window.localStorage.getItem(LOCAL_PREFIX + key);
    return raw ? (JSON.parse(raw) as Stored<T>).value : undefined;
  } catch {
    return undefined;
  }
}

/** Live value of a content block; `fallback` until an admin has saved one. */
export function useSiteContent<T>(key: SiteContentKey, fallback: T): { value: T; saved: boolean; loading: boolean } {
  const [state, setState] = useState<{ value: T; saved: boolean; loading: boolean }>(() => {
    if (!isFirebaseConfigured) {
      const local = typeof window === "undefined" ? undefined : readLocal<T>(key);
      return { value: local ?? fallback, saved: local !== undefined, loading: false };
    }
    return { value: fallback, saved: false, loading: true };
  });

  useEffect(() => {
    if (!isFirebaseConfigured || !firebaseDb) {
      const onStorage = (e: StorageEvent) => {
        if (e.key === LOCAL_PREFIX + key) {
          const local = readLocal<T>(key);
          setState({ value: local ?? fallback, saved: local !== undefined, loading: false });
        }
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    }
    return onSnapshot(
      doc(firebaseDb, "siteContent", key),
      (snap) => {
        const data = snap.exists() ? (snap.data() as RemoteDoc) : undefined;
        let value: T | undefined;
        try {
          value = data?.json ? (JSON.parse(data.json) as T) : undefined;
        } catch {
          value = undefined;
        }
        setState({ value: value ?? fallback, saved: value !== undefined, loading: false });
      },
      () => setState({ value: fallback, saved: false, loading: false }),
    );
    // fallback is a static default from src/data; re-subscribing on identity changes is not wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

/** Save a block (admins only — enforced by firestore.rules). */
export async function saveSiteContent<T>(key: SiteContentKey, value: T, updatedBy?: string | null): Promise<void> {
  if (!isFirebaseConfigured || !firebaseDb) {
    window.localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify({ value, updatedBy: updatedBy ?? undefined }));
    window.dispatchEvent(new StorageEvent("storage", { key: LOCAL_PREFIX + key }));
    return;
  }
  await setDoc(doc(firebaseDb, "siteContent", key), { json: JSON.stringify(value), updatedAt: serverTimestamp(), updatedBy: updatedBy ?? null });
}

/** Drop the saved block so the built-in default shows again. */
export async function resetSiteContent(key: SiteContentKey): Promise<void> {
  if (!isFirebaseConfigured || !firebaseDb) {
    window.localStorage.removeItem(LOCAL_PREFIX + key);
    window.dispatchEvent(new StorageEvent("storage", { key: LOCAL_PREFIX + key }));
    return;
  }
  await deleteDoc(doc(firebaseDb, "siteContent", key));
}

/**
 * Saved content over the built-in defaults: objects merge key by key (so fields added to the
 * defaults later still appear), arrays and plain values from the saved copy win.
 */
export function mergeContent<T>(defaults: T, saved: unknown): T {
  if (saved === undefined || saved === null) return defaults;
  if (Array.isArray(defaults) || typeof defaults !== "object" || defaults === null) return saved as T;
  if (typeof saved !== "object" || Array.isArray(saved)) return defaults;
  const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  for (const [k, v] of Object.entries(saved as Record<string, unknown>)) {
    out[k] = k in out ? mergeContent(out[k], v) : v;
  }
  return out as T;
}
