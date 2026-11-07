import { captureKnowledge } from '@/lib/knowledgeCapture';

/**
 * In-browser, Prisma-compatible data client for the ported ARCHI Agent Studio.
 *
 * The original app ran its services on Prisma + Postgres. To keep those services
 * close to verbatim, this implements the subset of the Prisma Client API they use
 * (find/create/update/upsert/delete/count, where/orderBy/select/include/_count,
 * nested create, increment, cascades, $transaction) over in-memory tables that
 * are hydrated from — and written through to — a pluggable persistence layer
 * (Firestore in production, localStorage when Firebase is not configured).
 */
import { schema, delegateToModel, type ModelRows } from "./schema.generated";

type ModelName = keyof typeof schema;
type Rec = Record<string, unknown>;
type FieldDef = {
  type: string;
  list: boolean;
  optional: boolean;
  kind: "scalar" | "enum" | "relation";
  id?: boolean;
  unique?: boolean;
  updatedAt?: boolean;
  default?: { fn?: "cuid" | "now"; value?: unknown };
  relationName?: string;
  fields?: readonly string[];
  references?: readonly string[];
  onDelete?: string;
  backFields?: readonly string[];
  backReferences?: readonly string[];
};

export interface Persistence {
  load(): Promise<Partial<Record<ModelName, Rec[]>>>;
  put(model: ModelName, record: Rec): void;
  remove(model: ModelName, id: string): void;
}

/** Prisma-style known request error (subset). */
export class PrismaClientKnownRequestError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "PrismaClientKnownRequestError";
  }
}

const fieldsOf = (model: ModelName) => schema[model].fields as unknown as Record<string, FieldDef>;

let idCounter = 0;
export function cuid(): string {
  idCounter = (idCounter + 1) % 1_679_616;
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => (b % 36).toString(36)).join("");
  return `c${Date.now().toString(36)}${idCounter.toString(36).padStart(4, "0")}${rand}`;
}

const clone = <T>(value: T): T => (value === undefined ? value : structuredClone(value));

function isPlainObject(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  const av = a instanceof Date ? a.getTime() : a;
  const bv = b instanceof Date ? b.getTime() : b;
  if (typeof av === "string" && typeof bv === "string") return av < bv ? -1 : av > bv ? 1 : 0;
  return (av as number) < (bv as number) ? -1 : (av as number) > (bv as number) ? 1 : 0;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    const at = a instanceof Date ? a.getTime() : a instanceof Object ? NaN : new Date(a as string).getTime();
    const bt = b instanceof Date ? b.getTime() : b instanceof Object ? NaN : new Date(b as string).getTime();
    return at === bt;
  }
  if (isPlainObject(a) || Array.isArray(a)) return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}

/** Revive DateTime fields after JSON round-trips. */
export function reviveRecord(model: ModelName, raw: Rec): Rec {
  const out: Rec = { ...raw };
  for (const [name, f] of Object.entries(fieldsOf(model))) {
    if (f.kind === "scalar" && f.type === "DateTime" && typeof out[name] === "string") {
      out[name] = new Date(out[name] as string);
    }
  }
  return out;
}

class Store {
  tables = new Map<ModelName, Map<string, Rec>>();
  private readyPromise: Promise<void> | null = null;

  constructor(private persistence: Persistence | null) {
    for (const name of Object.keys(schema) as ModelName[]) this.tables.set(name, new Map());
  }

  setPersistence(persistence: Persistence | null) {
    this.persistence = persistence;
    this.readyPromise = null;
    for (const table of this.tables.values()) table.clear();
  }

  ready(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = (async () => {
        if (!this.persistence) return;
        const data = await this.persistence.load();
        for (const [model, rows] of Object.entries(data) as [ModelName, Rec[]][]) {
          const table = this.tables.get(model);
          if (!table) continue;
          for (const row of rows) table.set(row.id as string, reviveRecord(model, row));
        }
      })();
      // Let a later call retry after a failed load (e.g. rules deployed, network back).
      this.readyPromise.catch(() => {
        this.readyPromise = null;
      });
    }
    return this.readyPromise;
  }

  table(model: ModelName) {
    return this.tables.get(model)!;
  }

  save(model: ModelName, rec: Rec) {
    this.table(model).set(rec.id as string, rec);
    this.persistence?.put(model, rec);
    captureKnowledge(model, String(rec.id), rec);
  }

  drop(model: ModelName, id: string) {
    captureKnowledge(model, id, this.table(model).get(id) || { id }, 'delete');
    this.table(model).delete(id);
    this.persistence?.remove(model, id);
  }
}

class Engine {
  constructor(private store: Store) {}

  // ── relations ────────────────────────────────────────────────
  related(model: ModelName, rec: Rec, relField: string): Rec | Rec[] | null {
    const f = fieldsOf(model)[relField];
    if (!f || f.kind !== "relation") throw new Error(`Unknown relation ${model}.${relField}`);
    const target = f.type as ModelName;
    const rows = [...this.store.table(target).values()];
    if (f.fields) {
      const refs = f.references!;
      if (f.fields.some((k) => rec[k] === null || rec[k] === undefined)) return null;
      return rows.find((r) => f.fields!.every((k, i) => r[refs[i]!] === rec[k])) ?? null;
    }
    const matches = rows.filter((r) => f.backFields!.every((k, i) => r[k] === rec[f.backReferences![i]!]));
    return f.list ? matches : (matches[0] ?? null);
  }

  // ── where ────────────────────────────────────────────────────
  matches(model: ModelName, rec: Rec, where: Rec | undefined): boolean {
    if (!where) return true;
    const fields = fieldsOf(model);
    for (const [key, cond] of Object.entries(where)) {
      if (cond === undefined) continue;
      if (key === "AND") {
        const list = Array.isArray(cond) ? cond : [cond];
        if (!list.every((w) => this.matches(model, rec, w as Rec))) return false;
        continue;
      }
      if (key === "OR") {
        if (!(cond as Rec[]).some((w) => this.matches(model, rec, w))) return false;
        continue;
      }
      if (key === "NOT") {
        const list = Array.isArray(cond) ? cond : [cond];
        if (list.some((w) => this.matches(model, rec, w as Rec))) return false;
        continue;
      }
      const f = fields[key];
      if (!f) {
        // Compound unique selector, e.g. userId_organizationId: { userId, organizationId }
        if (isPlainObject(cond) && key.includes("_")) {
          if (!Object.entries(cond).every(([k, v]) => sameValue(rec[k], v))) return false;
          continue;
        }
        throw new Error(`Unknown field in where: ${model}.${key}`);
      }
      if (f.kind === "relation") {
        if (!this.matchRelation(model, rec, key, f, cond)) return false;
        continue;
      }
      if (!this.matchScalar(rec[key], cond)) return false;
    }
    return true;
  }

  private matchRelation(model: ModelName, rec: Rec, key: string, f: FieldDef, cond: unknown): boolean {
    const target = f.type as ModelName;
    const rel = this.related(model, rec, key);
    if (f.list) {
      const list = (rel as Rec[]) ?? [];
      const c = cond as Rec;
      if (c.some !== undefined && !list.some((r) => this.matches(target, r, c.some as Rec))) return false;
      if (c.every !== undefined && !list.every((r) => this.matches(target, r, c.every as Rec))) return false;
      if (c.none !== undefined && list.some((r) => this.matches(target, r, c.none as Rec))) return false;
      return true;
    }
    const one = rel as Rec | null;
    if (cond === null) return one === null;
    const c = cond as Rec;
    if ("is" in c || "isNot" in c) {
      if ("is" in c) {
        if (c.is === null ? one !== null : !one || !this.matches(target, one, c.is as Rec)) return false;
      }
      if ("isNot" in c) {
        if (c.isNot === null ? one === null : !!one && this.matches(target, one, c.isNot as Rec)) return false;
      }
      return true;
    }
    return !!one && this.matches(target, one, c);
  }

  private matchScalar(value: unknown, cond: unknown): boolean {
    if (cond === null) return value === null || value === undefined;
    if (!isPlainObject(cond)) return sameValue(value, cond);
    const insensitive = cond.mode === "insensitive";
    const norm = (v: unknown) => (insensitive && typeof v === "string" ? v.toLowerCase() : v);
    for (const [op, arg] of Object.entries(cond)) {
      if (arg === undefined || op === "mode") continue;
      switch (op) {
        case "equals":
          if (!(arg === null ? value == null : sameValue(norm(value), norm(arg)))) return false;
          break;
        case "in":
          if (!(arg as unknown[]).some((a) => sameValue(norm(value), norm(a)))) return false;
          break;
        case "notIn":
          if ((arg as unknown[]).some((a) => sameValue(norm(value), norm(a)))) return false;
          break;
        case "not":
          if (isPlainObject(arg) ? this.matchScalar(value, arg) : arg === null ? value == null : sameValue(value, arg))
            return false;
          break;
        case "lt":
          if (value == null || compareValues(value, arg) >= 0) return false;
          break;
        case "lte":
          if (value == null || compareValues(value, arg) > 0) return false;
          break;
        case "gt":
          if (value == null || compareValues(value, arg) <= 0) return false;
          break;
        case "gte":
          if (value == null || compareValues(value, arg) < 0) return false;
          break;
        case "contains":
          if (typeof value !== "string" || !(norm(value) as string).includes(norm(arg) as string)) return false;
          break;
        case "startsWith":
          if (typeof value !== "string" || !(norm(value) as string).startsWith(norm(arg) as string)) return false;
          break;
        case "endsWith":
          if (typeof value !== "string" || !(norm(value) as string).endsWith(norm(arg) as string)) return false;
          break;
        default:
          throw new Error(`Unsupported filter operator: ${op}`);
      }
    }
    return true;
  }

  // ── reading ──────────────────────────────────────────────────
  query(model: ModelName, args: Rec = {}): Rec[] {
    let rows = [...this.store.table(model).values()].filter((r) => this.matches(model, r, args.where as Rec));
    if (args.orderBy) rows = this.sort(model, rows, args.orderBy);
    if (typeof args.skip === "number") rows = rows.slice(args.skip);
    if (typeof args.take === "number") {
      rows = args.take >= 0 ? rows.slice(0, args.take) : rows.slice(args.take);
    }
    if (Array.isArray(args.distinct)) {
      const seen = new Set<string>();
      rows = rows.filter((r) => {
        const k = JSON.stringify((args.distinct as string[]).map((d) => r[d]));
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
    return rows;
  }

  private sort(model: ModelName, rows: Rec[], orderBy: unknown): Rec[] {
    const specs = (Array.isArray(orderBy) ? orderBy : [orderBy]) as Rec[];
    const keyed = specs.flatMap((spec) => Object.entries(spec));
    return [...rows].sort((a, b) => {
      for (const [field, dirRaw] of keyed) {
        let av: unknown;
        let bv: unknown;
        let dir = dirRaw;
        const f = fieldsOf(model)[field];
        if (f?.kind === "relation" && isPlainObject(dirRaw)) {
          if ("_count" in dirRaw) {
            av = ((this.related(model, a, field) as Rec[]) ?? []).length;
            bv = ((this.related(model, b, field) as Rec[]) ?? []).length;
            dir = dirRaw._count;
          } else {
            const [[sub, subDir]] = Object.entries(dirRaw) as [[string, unknown]];
            av = (this.related(model, a, field) as Rec | null)?.[sub];
            bv = (this.related(model, b, field) as Rec | null)?.[sub];
            dir = subDir;
          }
        } else {
          av = a[field];
          bv = b[field];
          if (isPlainObject(dirRaw)) dir = dirRaw.sort;
        }
        const c = compareValues(av, bv);
        if (c !== 0) return dir === "desc" ? -c : c;
      }
      return 0;
    });
  }

  project(model: ModelName, rec: Rec, args: Rec = {}): Rec {
    const fields = fieldsOf(model);
    const out: Rec = {};
    const select = args.select as Rec | undefined;
    const include = args.include as Rec | undefined;
    if (select) {
      for (const [key, spec] of Object.entries(select)) {
        if (!spec) continue;
        if (key === "_count") out._count = this.counts(model, rec, spec);
        else if (fields[key]?.kind === "relation") out[key] = this.projectRelation(model, rec, key, spec);
        else out[key] = clone(rec[key]);
      }
      return out;
    }
    for (const [key, f] of Object.entries(fields)) if (f.kind !== "relation") out[key] = clone(rec[key]);
    if (include) {
      for (const [key, spec] of Object.entries(include)) {
        if (!spec) continue;
        if (key === "_count") out._count = this.counts(model, rec, spec);
        else out[key] = this.projectRelation(model, rec, key, spec);
      }
    }
    return out;
  }

  private projectRelation(model: ModelName, rec: Rec, key: string, spec: unknown): unknown {
    const f = fieldsOf(model)[key]!;
    const target = f.type as ModelName;
    const nested = isPlainObject(spec) ? spec : {};
    const rel = this.related(model, rec, key);
    if (f.list) {
      let list = (rel as Rec[]).filter((r) => this.matches(target, r, nested.where as Rec));
      if (nested.orderBy) list = this.sort(target, list, nested.orderBy);
      if (typeof nested.skip === "number") list = list.slice(nested.skip);
      if (typeof nested.take === "number") list = list.slice(0, nested.take);
      return list.map((r) => this.project(target, r, nested));
    }
    return rel ? this.project(target, rel as Rec, nested) : null;
  }

  private counts(model: ModelName, rec: Rec, spec: unknown): Record<string, number> {
    const fields = fieldsOf(model);
    const wanted: [string, Rec | undefined][] =
      isPlainObject(spec) && isPlainObject(spec.select)
        ? Object.entries(spec.select)
            .filter(([, v]) => v)
            .map(([k, v]) => [k, isPlainObject(v) ? (v.where as Rec) : undefined])
        : Object.entries(fields)
            .filter(([, f]) => f.kind === "relation" && f.list)
            .map(([k]) => [k, undefined]);
    const out: Record<string, number> = {};
    for (const [key, where] of wanted) {
      const target = fields[key]!.type as ModelName;
      out[key] = ((this.related(model, rec, key) as Rec[]) ?? []).filter((r) => this.matches(target, r, where)).length;
    }
    return out;
  }

  // ── writing ──────────────────────────────────────────────────
  create(model: ModelName, data: Rec, parentLink?: Rec): Rec {
    const fields = fieldsOf(model);
    const rec: Rec = { ...parentLink };
    const nested: [string, FieldDef, Rec][] = [];
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      const f = fields[key];
      if (!f) throw new Error(`Unknown field in create: ${model}.${key}`);
      if (f.kind === "relation") {
        const v = value as Rec;
        if (f.fields && v.connect) {
          const target = this.findUniqueRec(f.type as ModelName, v.connect as Rec);
          if (!target) throw new PrismaClientKnownRequestError(`Related ${f.type} not found`, "P2025");
          f.fields.forEach((k, i) => (rec[k] = target[f.references![i]!]));
        } else if (f.fields && v.create) {
          const created = this.create(f.type as ModelName, v.create as Rec);
          f.fields.forEach((k, i) => (rec[k] = created[f.references![i]!]));
        } else {
          nested.push([key, f, v]);
        }
        continue;
      }
      rec[key] = value instanceof Date ? new Date(value) : clone(value);
    }
    const now = new Date();
    for (const [key, f] of Object.entries(fields)) {
      if (f.kind === "relation" || rec[key] !== undefined) continue;
      if (f.default?.fn === "cuid") rec[key] = cuid();
      else if (f.default?.fn === "now" || f.updatedAt) rec[key] = now;
      else if (f.default && "value" in f.default) rec[key] = clone(f.default.value);
      else if (f.optional || f.list) rec[key] = f.list ? [] : null;
    }
    if (typeof rec.createdAt === "string") rec.createdAt = new Date(rec.createdAt);
    this.assertUnique(model, rec);
    this.store.save(model, rec);

    for (const [, f, v] of nested) {
      const target = f.type as ModelName;
      const link: Rec = {};
      f.backFields!.forEach((k, i) => (link[k] = rec[f.backReferences![i]!]));
      const creates = v.create ? (Array.isArray(v.create) ? v.create : [v.create]) : [];
      for (const child of creates as Rec[]) this.create(target, child, link);
      if (v.createMany) {
        for (const child of (v.createMany as Rec).data as Rec[]) this.create(target, child, link);
      }
      const connects = v.connect ? (Array.isArray(v.connect) ? v.connect : [v.connect]) : [];
      for (const sel of connects as Rec[]) {
        const row = this.findUniqueRec(target, sel);
        if (row) this.store.save(target, { ...row, ...link });
      }
    }
    return rec;
  }

  private assertUnique(model: ModelName, rec: Rec, ignoreId?: string) {
    const fields = fieldsOf(model);
    const sets: string[][] = [
      ...Object.entries(fields)
        .filter(([, f]) => f.unique || f.id)
        .map(([k]) => [k]),
      ...(schema[model].uniques as unknown as string[][]),
    ];
    for (const set of sets) {
      if (set.some((k) => rec[k] === null || rec[k] === undefined)) continue;
      for (const row of this.store.table(model).values()) {
        if (row.id === ignoreId || row === rec) continue;
        if (set.every((k) => sameValue(row[k], rec[k]))) {
          throw new PrismaClientKnownRequestError(
            `Unique constraint failed on the fields: (${set.join(", ")})`,
            "P2002",
          );
        }
      }
    }
  }

  findUniqueRec(model: ModelName, where: Rec): Rec | null {
    if (typeof where.id === "string" && Object.keys(where).length === 1) {
      return this.store.table(model).get(where.id) ?? null;
    }
    return this.query(model, { where })[0] ?? null;
  }

  update(model: ModelName, rec: Rec, data: Rec): Rec {
    const fields = fieldsOf(model);
    const next: Rec = { ...rec };
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      const f = fields[key];
      if (!f) throw new Error(`Unknown field in update: ${model}.${key}`);
      if (f.kind === "relation") {
        const v = value as Rec;
        if (f.fields && v.connect) {
          const target = this.findUniqueRec(f.type as ModelName, v.connect as Rec);
          if (!target) throw new PrismaClientKnownRequestError(`Related ${f.type} not found`, "P2025");
          f.fields.forEach((k, i) => (next[k] = target[f.references![i]!]));
        } else if (f.fields && v.disconnect) {
          f.fields.forEach((k) => (next[k] = null));
        } else if (!f.fields && v.create) {
          const link: Rec = {};
          f.backFields!.forEach((k, i) => (link[k] = rec[f.backReferences![i]!]));
          for (const child of (Array.isArray(v.create) ? v.create : [v.create]) as Rec[]) {
            this.create(f.type as ModelName, child, link);
          }
        } else if (!f.fields && v.deleteMany !== undefined) {
          const target = f.type as ModelName;
          for (const child of (this.related(model, rec, key) as Rec[]) ?? []) {
            if (this.matches(target, child, v.deleteMany as Rec)) this.remove(target, child);
          }
        } else {
          throw new Error(`Unsupported nested update on ${model}.${key}`);
        }
        continue;
      }
      if (isPlainObject(value) && f.type !== "Json") {
        const ops = value;
        const cur = next[key] as number;
        if ("set" in ops) next[key] = ops.set;
        else if ("increment" in ops) next[key] = (cur ?? 0) + (ops.increment as number);
        else if ("decrement" in ops) next[key] = (cur ?? 0) - (ops.decrement as number);
        else if ("multiply" in ops) next[key] = (cur ?? 0) * (ops.multiply as number);
        else if ("divide" in ops) next[key] = (cur ?? 0) / (ops.divide as number);
        else if ("push" in ops) next[key] = [...((next[key] as unknown[]) ?? []), ...[ops.push].flat()];
        else throw new Error(`Unsupported update operation on ${model}.${key}`);
        continue;
      }
      next[key] = value instanceof Date ? new Date(value) : clone(value);
    }
    for (const [key, f] of Object.entries(fields)) {
      if (f.updatedAt && !(key in data)) next[key] = new Date();
    }
    this.assertUnique(model, next, rec.id as string);
    this.store.save(model, next);
    return next;
  }

  remove(model: ModelName, rec: Rec) {
    // Apply referential actions on rows that point at this one.
    for (const [otherName, otherModel] of Object.entries(schema) as [ModelName, (typeof schema)[ModelName]][]) {
      for (const [, raw] of Object.entries(otherModel.fields)) {
        const f = raw as unknown as FieldDef;
        if (f.kind !== "relation" || f.type !== model || !f.fields) continue;
        const dependents = [...this.store.table(otherName).values()].filter((r) =>
          f.fields!.every((k, i) => r[k] === rec[f.references![i]!]),
        );
        if (!dependents.length) continue;
        const fkOptional = f.fields.every((k) => (fieldsOf(otherName)[k] as FieldDef | undefined)?.optional);
        const action = f.onDelete ?? (fkOptional ? "SetNull" : "Restrict");
        if (action === "Cascade") {
          for (const d of dependents) if (this.store.table(otherName).has(d.id as string)) this.remove(otherName, d);
        } else if (action === "SetNull") {
          for (const d of dependents) {
            const n = { ...d };
            f.fields.forEach((k) => (n[k] = null));
            this.store.save(otherName, n);
          }
        } else {
          throw new PrismaClientKnownRequestError(
            `Foreign key constraint failed: ${otherName} still references ${model} ${String(rec.id)}`,
            "P2003",
          );
        }
      }
    }
    this.store.drop(model, rec.id as string);
  }
}

type Args = Record<string, any>;
export interface Delegate<R> {
  findUnique(args: Args): Promise<R | null>;
  findUniqueOrThrow(args: Args): Promise<R>;
  findFirst(args?: Args): Promise<R | null>;
  findFirstOrThrow(args?: Args): Promise<R>;
  findMany(args?: Args): Promise<R[]>;
  count(args?: Args): Promise<number>;
  create(args: Args): Promise<R>;
  createMany(args: Args): Promise<{ count: number }>;
  update(args: Args): Promise<R>;
  updateMany(args: Args): Promise<{ count: number }>;
  upsert(args: Args): Promise<R>;
  delete(args: Args): Promise<R>;
  deleteMany(args?: Args): Promise<{ count: number }>;
}

export type PrismaClient = { [K in keyof ModelRows]: Delegate<ModelRows[K]> } & {
  $transaction<T extends readonly unknown[]>(ops: [...T]): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }>;
  $transaction<R>(fn: (tx: PrismaClient) => Promise<R>): Promise<R>;
  $ready(): Promise<void>;
  $setPersistence(persistence: Persistence | null): void;
};

function notFound(model: string): PrismaClientKnownRequestError {
  return new PrismaClientKnownRequestError(`No ${model} found`, "P2025");
}

export function createClient(persistence: Persistence | null = null): PrismaClient {
  const store = new Store(persistence);
  const engine = new Engine(store);

  const delegate = (model: ModelName): Delegate<any> => {
    const run = async <T>(fn: () => T): Promise<T> => {
      await store.ready();
      return fn();
    };
    const out = (rec: Rec, args: Args) => engine.project(model, rec, args);
    return {
      findUnique: (args) =>
        run(() => {
          const rec = engine.query(model, { where: args.where })[0];
          return rec ? out(rec, args) : null;
        }),
      findUniqueOrThrow: (args) =>
        run(() => {
          const rec = engine.query(model, { where: args.where })[0];
          if (!rec) throw notFound(model);
          return out(rec, args);
        }),
      findFirst: (args = {}) =>
        run(() => {
          const rec = engine.query(model, args)[0];
          return rec ? out(rec, args) : null;
        }),
      findFirstOrThrow: (args = {}) =>
        run(() => {
          const rec = engine.query(model, args)[0];
          if (!rec) throw notFound(model);
          return out(rec, args);
        }),
      findMany: (args = {}) => run(() => engine.query(model, args).map((r) => out(r, args))),
      count: (args = {}) => run(() => engine.query(model, args).length),
      create: (args) => run(() => out(engine.create(model, args.data), args)),
      createMany: (args) =>
        run(() => {
          const rows = (Array.isArray(args.data) ? args.data : [args.data]) as Rec[];
          let count = 0;
          for (const row of rows) {
            try {
              engine.create(model, row);
              count += 1;
            } catch (error) {
              if (!(args.skipDuplicates && error instanceof PrismaClientKnownRequestError && error.code === "P2002"))
                throw error;
            }
          }
          return { count };
        }),
      update: (args) =>
        run(() => {
          const rec = engine.query(model, { where: args.where })[0];
          if (!rec) throw notFound(model);
          return out(engine.update(model, rec, args.data), args);
        }),
      updateMany: (args) =>
        run(() => {
          const rows = engine.query(model, { where: args.where });
          for (const rec of rows) engine.update(model, rec, args.data);
          return { count: rows.length };
        }),
      upsert: (args) =>
        run(() => {
          const rec = engine.query(model, { where: args.where })[0];
          const saved = rec ? engine.update(model, rec, args.update ?? {}) : engine.create(model, args.create);
          return out(saved, args);
        }),
      delete: (args) =>
        run(() => {
          const rec = engine.query(model, { where: args.where })[0];
          if (!rec) throw notFound(model);
          const snapshot = out(rec, args);
          engine.remove(model, rec);
          return snapshot;
        }),
      deleteMany: (args = {}) =>
        run(() => {
          const rows = engine.query(model, { where: args.where });
          for (const rec of rows) if (store.table(model).has(rec.id as string)) engine.remove(model, rec);
          return { count: rows.length };
        }),
    };
  };

  const client: Record<string, unknown> = {};
  for (const [name, model] of Object.entries(delegateToModel)) client[name] = delegate(model as ModelName);
  client.$ready = () => store.ready();
  client.$setPersistence = (p: Persistence | null) => store.setPersistence(p);
  client.$transaction = async (arg: unknown) => {
    if (typeof arg === "function") return (arg as (tx: unknown) => Promise<unknown>)(client);
    return Promise.all(arg as Promise<unknown>[]);
  };
  return client as unknown as PrismaClient;
}
