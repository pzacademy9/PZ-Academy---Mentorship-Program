// tests/helpers/supabase-mock.ts
/**
 * Chainable fake of the service-role Supabase client for the Phase 2 landing tests.
 *
 * Two ways to answer queries:
 *  - handler mode: set `state.handler` to a function that scripts each reply;
 *  - memory mode: `state.handler = memoryHandler(store)` evaluates eq / neq / in / is /
 *    gte / lte / gt / lt / ilike against in-memory tables, so data layers can run end to end.
 * Every terminal call (await, single, maybeSingle) records an Op in `state.ops`.
 */
export type Res = { data: unknown; error: unknown; count?: number | null };
export type FilterKind = "eq" | "neq" | "in" | "is" | "gte" | "lte" | "gt" | "lt" | "ilike" | "or";
export interface Op {
  table: string;
  op: "select" | "insert" | "update" | "delete" | "upsert" | "rpc";
  payload?: unknown;
  filters: [FilterKind, string, unknown][];
  orders: [string, boolean][];
  limit?: number;
  range?: [number, number];
  single: boolean;
  count: boolean;
  head: boolean;
  returning: boolean;
  upsertOptions?: Record<string, unknown>;
}
export type Store = Record<string, Record<string, unknown>[]>;
export type RpcHandler = (fn: string, args: unknown, store: Store) => Res;

function newOp(table: string, op: Op["op"] = "select"): Op {
  return { table, op, filters: [], orders: [], single: false, count: false, head: false, returning: false };
}

export function createSupabaseMock() {
  const state: { ops: Op[]; handler: (op: Op) => Res; users: Record<string, { email: string }> } = {
    ops: [],
    handler: () => ({ data: null, error: null }),
    users: {},
  };

  function from(table: string) {
    const op = newOp(table);
    const done = () => {
      state.ops.push(op);
      return Promise.resolve(state.handler(op));
    };
    const filter = (kind: FilterKind) => (key: string, value: unknown) => {
      op.filters.push([kind, key, value]);
      return b;
    };
    const b: Record<string, unknown> = {
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
        if (op.op !== "select") op.returning = true;
        if (opts?.count) op.count = true;
        if (opts?.head) op.head = true;
        return b;
      },
      insert: (p: unknown) => { op.op = "insert"; op.payload = p; return b; },
      update: (p: unknown) => { op.op = "update"; op.payload = p; return b; },
      upsert: (p: unknown, o?: Record<string, unknown>) => { op.op = "upsert"; op.payload = p; op.upsertOptions = o; return b; },
      delete: () => { op.op = "delete"; return b; },
      eq: filter("eq"),
      neq: filter("neq"),
      in: filter("in"),
      is: filter("is"),
      gte: filter("gte"),
      lte: filter("lte"),
      gt: filter("gt"),
      lt: filter("lt"),
      ilike: filter("ilike"),
      // or("a.ilike.x,b.eq.y") is recorded as ["or", "or", expression]; memory mode does not evaluate it.
      or: (expr: string) => { op.filters.push(["or", "or", expr]); return b; },
      range: (from: number, to: number) => { op.range = [from, to]; return b; },
      order: (key: string, o?: { ascending?: boolean }) => { op.orders.push([key, o?.ascending !== false]); return b; },
      limit: (n: number) => { op.limit = n; return b; },
      maybeSingle: () => { op.single = true; return done(); },
      single: () => { op.single = true; return done(); },
      then: (res: (v: Res) => unknown, rej: (e: unknown) => unknown) => done().then(res, rej),
    };
    return b;
  }

  function rpc(fn: string, args: unknown) {
    const op = newOp(fn, "rpc");
    op.payload = args;
    state.ops.push(op);
    return Promise.resolve(state.handler(op));
  }

  const client = {
    from,
    rpc,
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: state.users[id] ? { id, email: state.users[id].email } : null },
          error: null,
        }),
      },
    },
  };

  return {
    state,
    client,
    find: (table: string, kind: Op["op"]) => state.ops.filter((o) => o.table === table && o.op === kind),
    reset: () => {
      state.ops = [];
      state.handler = () => ({ data: null, error: null });
      state.users = {};
    },
  };
}

export function filterValue(op: Op, kind: FilterKind, key: string): unknown {
  return op.filters.find(([k, f]) => k === kind && f === key)?.[2];
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function matches(row: Record<string, unknown>, filters: Op["filters"]): boolean {
  return filters.every(([kind, key, value]) => {
    const v = row[key];
    switch (kind) {
      case "eq": return v === value;
      case "neq": return v !== value;
      case "in": return Array.isArray(value) && value.includes(v);
      case "is": return value === null ? v === null || v === undefined : v === value;
      case "gte": return compare(v, value) >= 0;
      case "lte": return compare(v, value) <= 0;
      case "gt": return compare(v, value) > 0;
      case "lt": return compare(v, value) < 0;
      case "or": return true;
      case "ilike": return typeof v === "string" && v.toLowerCase() === String(value).toLowerCase();
    }
  });
}

function shape(op: Op, rows: Record<string, unknown>[]): Res {
  const count = op.count ? rows.length : null;
  if (op.head) return { data: null, error: null, count };
  if (op.single) return { data: rows[0] ?? null, error: null, count };
  return { data: rows, error: null, count };
}

export function memoryHandler(store: Store, rpc?: RpcHandler): (op: Op) => Res {
  let seq = 0;
  return (op: Op): Res => {
    if (op.op === "rpc") {
      return rpc ? rpc(op.table, op.payload, store) : { data: null, error: { message: `no rpc ${op.table}` } };
    }
    const table = (store[op.table] ??= []);
    if (op.op === "insert" || op.op === "upsert") {
      const items = (Array.isArray(op.payload) ? op.payload : [op.payload]) as Record<string, unknown>[];
      const inserted = items.map((p) => ({ id: `${op.table}-${++seq}`, created_at: new Date().toISOString(), ...p }));
      table.push(...inserted);
      return shape(op, inserted);
    }
    const hit = table.filter((r) => matches(r, op.filters));
    if (op.op === "update") {
      for (const r of hit) Object.assign(r, op.payload as Record<string, unknown>);
      return shape(op, hit);
    }
    if (op.op === "delete") {
      store[op.table] = table.filter((r) => !hit.includes(r));
      return shape(op, hit);
    }
    let rows = [...hit];
    for (const [key, asc] of [...op.orders].reverse()) {
      rows.sort((a, b) => (asc ? 1 : -1) * compare(a[key], b[key]));
    }
    const total = rows.length;
    if (op.limit !== undefined) rows = rows.slice(0, op.limit);
    if (op.range) rows = rows.slice(op.range[0], op.range[1] + 1);
    const res = shape(op, rows);
    // `count` is the total matched before limit/range, like PostgREST count: "exact".
    if (op.count) res.count = total;
    return res;
  };
}
