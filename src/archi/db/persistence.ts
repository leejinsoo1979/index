import {
  collection,
  deleteDoc,
  doc,
  getDocsFromServer,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import type { Persistence } from "./client";
import { schema } from "./schema.generated";

type ModelName = keyof typeof schema;
type Rec = Record<string, unknown>;
const MODELS = Object.keys(schema) as ModelName[];

/**
 * Firestore layout: archiStudio/{databaseId}/{Model}/{recordId} = { json, updatedAt }.
 * Records are stored as a JSON string because Firestore rejects nested arrays
 * (e.g. table block rows), and Json columns can hold arbitrary shapes.
 */
export function firestorePersistence(db: Firestore, databaseId: string): Persistence {
  const col = (model: ModelName) => collection(db, "archiStudio", databaseId, model);
  // Serialize writes per record so a fast update-then-delete can't land out of order.
  const queues = new Map<string, Promise<void>>();
  const enqueue = (key: string, op: () => Promise<void>) => {
    const next = (queues.get(key) ?? Promise.resolve())
      .then(op)
      .catch((error) => console.error("[archi-db] Firestore write failed", key, error));
    queues.set(key, next);
  };
  return {
    async load() {
      const out: Partial<Record<ModelName, Rec[]>> = {};
      await Promise.all(
        MODELS.map(async (model) => {
          // Server read only: a cache fallback while offline would look like an empty
          // workspace and lead to duplicate users/orgs being created and synced later.
          const snap = await getDocsFromServer(col(model));
          out[model] = snap.docs.map((d) => JSON.parse((d.data() as { json: string }).json) as Rec);
        }),
      );
      return out;
    },
    put(model, record) {
      const id = record.id as string;
      const json = JSON.stringify(record);
      enqueue(`${model}/${id}`, () => setDoc(doc(col(model), id), { json, updatedAt: serverTimestamp() }));
    },
    remove(model, id) {
      enqueue(`${model}/${id}`, () => deleteDoc(doc(col(model), id)));
    },
  };
}

/** Browser-only fallback (local demo without Firebase): one localStorage key per model. */
export function localStoragePersistence(prefix = "archi-db"): Persistence {
  const key = (model: ModelName) => `${prefix}:${model}`;
  const read = (model: ModelName): Record<string, Rec> => {
    try {
      return JSON.parse(window.localStorage.getItem(key(model)) ?? "{}") as Record<string, Rec>;
    } catch {
      return {};
    }
  };
  const write = (model: ModelName, rows: Record<string, Rec>) => {
    try {
      window.localStorage.setItem(key(model), JSON.stringify(rows));
    } catch (error) {
      console.error("[archi-db] localStorage write failed", model, error);
    }
  };
  return {
    async load() {
      return Object.fromEntries(MODELS.map((m) => [m, Object.values(read(m))]));
    },
    put(model, record) {
      const rows = read(model);
      rows[record.id as string] = JSON.parse(JSON.stringify(record)) as Rec;
      write(model, rows);
    },
    remove(model, id) {
      const rows = read(model);
      delete rows[id];
      write(model, rows);
    },
  };
}
