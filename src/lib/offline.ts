/**
 * Offline layer, plugged into supabase-js as its `fetch`.
 *
 *  - READS  (GET/HEAD on /rest/v1 + a few read RPCs): network first; the answer is cached in IndexedDB.
 *           No internet (or a slow one) => the last cached answer is returned.
 *  - WRITES (insert/update/delete on /rest/v1, photo/signature uploads, submit_task / finish_order RPCs):
 *           sent directly when online. When offline they are queued in IndexedDB, the UI gets a "success"
 *           answer, the cached lists are patched so the screen shows the change, and the queue is replayed
 *           in order as soon as the internet is back.
 *  - Stock / products / profiles / notifications are NEVER queued (they need a live, consistent database).
 *  - Everything else (auth, functions, signed urls...) passes straight through.
 */
import { createStore, del, delMany, entries, get, keys, set } from 'idb-keyval';
import { SUPABASE_URL } from './config';

const db = createStore('prosmart-offline', 'kv');
const REST = `${SUPABASE_URL}/rest/v1/`;
const STORAGE = `${SUPABASE_URL}/storage/v1/object/`;

const READ_RPC = new Set(['tech_report', 'site_report']);
const WRITE_RPC = new Set(['finish_order', 'submit_task']);
const NO_CACHE_TABLES = new Set(['report_credentials']); // device passwords are never cached on the phone
const BLOCK_TABLES = new Set(['stock_movements', 'stock_items', 'products', 'profiles', 'notifications', 'device_tokens']);
// tables whose primary key is a client-generatable uuid `id` (so ids can be created offline and referenced later)
const ID_TABLES = new Set(['work_orders', 'work_order_tasks', 'site_reports', 'report_credentials']);
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

type Hdrs = [string, string][];
interface Cached { status: number; ct: string; cr: string; body: string; t: number; url: string; method: string }
type SerBody =
  | { kind: 'none' }
  | { kind: 'text'; text: string }
  | { kind: 'blob'; blob: Blob }
  | { kind: 'form'; fields: { name: string; value?: string; blob?: Blob; filename?: string }[] };
interface QItem { user: string; method: string; url: string; headers: Hdrs; body: SerBody; t: number; genId: boolean }
export interface FailedItem { t: number; method: string; url: string; status: number; msg: string }

let tokenProvider: () => Promise<string | null> = async () => null;
export const setTokenProvider = (f: () => Promise<string | null>) => (tokenProvider = f);

// Who is signed in. supabase-js sends the anonymous key as the token when an expired session cannot be refreshed offline,
// so the user id is tracked here and used for the cache / queue instead of reading it from the token.
let currentUser: string | null = null;
export const setCurrentUser = (u: string | null) => (currentUser = u);
const who = (h: Headers) => currentUser ?? subOf(h.get('Authorization'));

const online = () => (typeof navigator === 'undefined' ? true : navigator.onLine);
const emit = (n: string) => window.dispatchEvent(new Event(n));

function subOf(auth: string | null): string {
  try {
    const t = (auth ?? '').replace(/^Bearer\s+/i, '');
    const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return p.sub ?? 'anon';
  } catch {
    return 'anon';
  }
}
const uuid = () => crypto.randomUUID();
const isNetErr = (e: unknown) => e instanceof TypeError;
const strKeys = async (prefix: string) => (await keys(db)).filter((k): k is string => typeof k === 'string' && k.startsWith(prefix));

// ───────────────────────────── cache (reads) ─────────────────────────────
const rebuild = (c: Cached, method: string) => {
  const h = new Headers();
  if (c.ct) h.set('Content-Type', c.ct);
  if (c.cr) h.set('Content-Range', c.cr);
  return new Response(method === 'HEAD' ? null : c.body, { status: c.status, headers: h });
};

async function cachedRead(url: string, method: string, init: RequestInit, rpcBody = ''): Promise<Response> {
  const headers = new Headers(init.headers);
  const user = who(headers);
  const key = `c|${user}|${method}|${headers.get('Accept') ?? ''}|${url}|${rpcBody}`;
  const path = new URL(url).pathname.replace('/rest/v1/', '');
  const cacheable = !NO_CACHE_TABLES.has(path.split('?')[0]);
  const hit = cacheable ? await get<Cached>(key, db) : undefined;
  if (!online() && hit) return rebuild(hit, method);

  const ctrl = new AbortController();
  init.signal?.addEventListener('abort', () => ctrl.abort());
  const timer = hit ? setTimeout(() => ctrl.abort(), 10000) : undefined; // slow network + cached copy => use the copy
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (cacheable && res.status === 200) {
      const body = method === 'HEAD' ? '' : await res.clone().text();
      if (body.length < 1_500_000) {
        const c: Cached = {
          status: 200,
          ct: res.headers.get('Content-Type') ?? '',
          cr: res.headers.get('Content-Range') ?? '',
          body,
          t: Date.now(),
          url,
          method,
        };
        set(key, c, db).catch(() => {});
      }
    }
    return res;
  } catch (e) {
    if (hit) return rebuild(hit, method);
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ───────────────────── optimistic patching of cached lists ─────────────────────
const eqFilters = (u: URL) => {
  const eq: [string, string][] = [];
  let unknown = false;
  u.searchParams.forEach((v, k) => {
    if (RESERVED.has(k)) return;
    if (v.startsWith('eq.')) eq.push([k, v.slice(3)]);
    else unknown = true;
  });
  return { eq, unknown };
};
type Row = Record<string, unknown>;
const rowsOf = (body: string): { rows: Row[]; single: boolean } | null => {
  try {
    const j = JSON.parse(body);
    if (Array.isArray(j)) return { rows: j, single: false };
    if (j && typeof j === 'object') return { rows: [j], single: true };
  } catch { /* ignore */ }
  return null;
};
const matches = (row: Row, patch: [string, string][], entryEq: [string, string][]) =>
  patch.every(([c, v]) => (c in row ? String(row[c]) === v : entryEq.some(([ec, ev]) => ec === c && ev === v)));

async function patchCache(table: string, fn: (rows: Row[], entryEq: [string, string][], single: boolean) => Row[] | null) {
  try {
    for (const [k, v] of await entries<string, Cached>(db)) {
      if (typeof k !== 'string' || !k.startsWith('c|')) continue;
      const c = v as Cached;
      if (c.method !== 'GET') continue;
      const u = new URL(c.url);
      if (u.pathname !== `/rest/v1/${table}`) continue;
      const { eq, unknown } = eqFilters(u);
      if (unknown) continue;
      const parsed = rowsOf(c.body);
      if (!parsed) continue;
      const next = fn(parsed.rows, eq, parsed.single);
      if (next) await set(k, { ...c, body: JSON.stringify(parsed.single ? next[0] ?? null : next) }, db);
    }
  } catch { /* best effort */ }
}
async function findCachedId(table: string, col: string, val: unknown): Promise<string | null> {
  for (const [k, v] of await entries<string, Cached>(db)) {
    if (typeof k !== 'string' || !k.startsWith('c|')) continue;
    const c = v as Cached;
    if (new URL(c.url).pathname !== `/rest/v1/${table}`) continue;
    const p = rowsOf(c.body);
    const hit = p?.rows.find((r) => r && String(r[col]) === String(val) && r.id);
    if (hit) return String(hit.id);
  }
  return null;
}

// ───────────────────────────── queue (writes) ─────────────────────────────
let seq = 0;
const qKey = () => `q|${String(Date.now()).padStart(15, '0')}-${String(seq++).padStart(4, '0')}`;
export const pendingCount = async () => (await strKeys('q|')).length;
export const failedItems = async () => (await get<FailedItem[]>('failed', db)) ?? [];
export const clearFailed = async () => {
  await del('failed', db);
  emit('prosmart:net');
};

async function serialize(body: BodyInit | null | undefined): Promise<SerBody> {
  if (body == null) return { kind: 'none' };
  if (typeof body === 'string') return { kind: 'text', text: body };
  if (body instanceof Blob) return { kind: 'blob', blob: body };
  if (body instanceof FormData) {
    const fields: { name: string; value?: string; blob?: Blob; filename?: string }[] = [];
    body.forEach((v, name) => {
      if (typeof v === 'string') fields.push({ name, value: v });
      else fields.push({ name, blob: v, filename: (v as File).name });
    });
    return { kind: 'form', fields };
  }
  if (body instanceof ArrayBuffer) return { kind: 'blob', blob: new Blob([body]) };
  throw new Error('unsupported body');
}
const deserialize = (b: SerBody): BodyInit | undefined => {
  if (b.kind === 'text') return b.text;
  if (b.kind === 'blob') return b.blob;
  if (b.kind === 'form') {
    const fd = new FormData();
    b.fields.forEach((f) => (f.blob ? fd.append(f.name, f.blob, f.filename) : fd.append(f.name, f.value ?? '')));
    return fd;
  }
  return undefined;
};
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });

function allowed(method: string, table: string) {
  if (BLOCK_TABLES.has(table)) return false;
  if (table === 'notification_recipients' && method === 'POST') return false;
  return true;
}

async function writeThrough(url: string, method: string, init: RequestInit, kind: 'rest' | 'rpc' | 'storage'): Promise<Response> {
  const u = new URL(url);
  const table = kind === 'rest' ? u.pathname.replace('/rest/v1/', '') : '';
  if (kind === 'rest' && !allowed(method, table)) return fetch(url, init);

  if (online() && (await pendingCount()) === 0) {
    try {
      return await fetch(url, init);
    } catch (e) {
      if (!isNetErr(e)) throw e; // network problem => fall through and queue it
    }
  }
  return enqueue(url, method, init, kind, table);
}

async function enqueue(url: string, method: string, init: RequestInit, kind: 'rest' | 'rpc' | 'storage', table: string): Promise<Response> {
  const h = new Headers(init.headers);
  const user = who(h);
  const prefer = h.get('Prefer') ?? '';
  const wantsRows = prefer.includes('return=representation');
  const wantsObject = (h.get('Accept') ?? '').includes('pgrst.object');
  let genId = false;
  let bodyText = typeof init.body === 'string' ? init.body : '';
  let response: Response;

  if (kind === 'storage') {
    const path = new URL(url).pathname.replace('/storage/v1/object/', '');
    response = json({ Key: path, Id: 'offline-' + uuid() });
  } else if (kind === 'rpc') {
    const name = new URL(url).pathname.replace('/rest/v1/rpc/', '');
    const args = bodyText ? JSON.parse(bodyText) : {};
    if (name === 'submit_task') {
      await patchCache('work_order_tasks', (rows) => {
        let hit = false;
        rows.forEach((r) => {
          if (String(r.id) === String(args.task)) { r.status = 'done'; r.tech_note = args.note ?? r.tech_note; hit = true; }
        });
        return hit ? rows : null;
      });
    }
    response = new Response(null, { status: 204 });
  } else if (method === 'POST') {
    const parsed = JSON.parse(bodyText || '[]');
    const rows: Row[] = Array.isArray(parsed) ? parsed : [parsed];
    const upsert = prefer.includes('resolution=');
    const conflict = new URL(url).searchParams.get('on_conflict');
    if (ID_TABLES.has(table)) {
      for (const r of rows) {
        if (r.id) continue;
        let id: string | null = null;
        if (upsert && conflict && r[conflict] != null) id = await findCachedId(table, conflict, r[conflict]); // keep the real id of an existing row
        r.id = id ?? uuid();
        genId = true;
      }
      bodyText = JSON.stringify(Array.isArray(parsed) ? rows : rows[0]);
    }
    const now = new Date().toISOString();
    await patchCache(table, (list, entryEq, single) => {
      if (single) return null;
      const out = list.slice();
      let changed = false;
      for (const r of rows) {
        const row: Row = { created_at: now, ...r };
        if (!entryEq.every(([c, v]) => !(c in row) || String(row[c]) === v)) continue;
        const i = upsert && row.id ? out.findIndex((x) => String(x.id) === String(row.id)) : -1;
        if (i >= 0) out[i] = { ...out[i], ...row };
        else out.push(row);
        changed = true;
      }
      return changed ? out : null;
    });
    response = wantsRows ? json(wantsObject ? rows[0] : rows, 201) : new Response(null, { status: 201 });
  } else if (method === 'PATCH') {
    const patch = JSON.parse(bodyText || '{}');
    const { eq } = eqFilters(new URL(url));
    await patchCache(table, (list, entryEq) => {
      let changed = false;
      list.forEach((r) => {
        if (matches(r, eq, entryEq)) { Object.assign(r, patch); changed = true; }
      });
      return changed ? list : null;
    });
    response = wantsRows ? json([], 200) : new Response(null, { status: 204 });
  } else if (method === 'DELETE') {
    const { eq } = eqFilters(new URL(url));
    await patchCache(table, (list, entryEq) => {
      const next = list.filter((r) => !matches(r, eq, entryEq));
      return next.length !== list.length ? next : null;
    });
    response = new Response(null, { status: 204 });
  } else {
    return fetch(url, init);
  }

  const headers: Hdrs = [];
  h.forEach((v, k) => {
    if (!['authorization', 'content-length'].includes(k.toLowerCase())) headers.push([k, v]);
  });
  const body: SerBody = kind === 'storage' || typeof init.body !== 'string' ? await serialize(init.body) : bodyText ? { kind: 'text', text: bodyText } : { kind: 'none' };
  const item: QItem = { user, method, url, headers, body, t: Date.now(), genId };
  await set(qKey(), item, db);
  emit('prosmart:net');
  return response;
}

// ───────────────────────────── replay ─────────────────────────────
let flushing = false;
export async function flush() {
  if (flushing || !online()) return;
  flushing = true;
  let did = 0;
  try {
    const tok = await tokenProvider();
    if (!tok) return;
    const me = subOf('Bearer ' + tok);
    for (;;) {
      const ks = (await strKeys('q|')).sort();
      let key = '';
      let item: QItem | undefined;
      for (const k of ks) {
        const it = await get<QItem>(k, db);
        if (it && it.user === me) { key = k; item = it; break; }
        if (!it) await del(k, db);
      }
      if (!item) break;
      const headers = new Headers(item.headers);
      headers.set('Authorization', 'Bearer ' + tok);
      if (item.url.startsWith(STORAGE)) headers.set('x-upsert', 'true'); // a retried upload must not fail as "duplicate"
      let res: Response;
      try {
        res = await fetch(item.url, { method: item.method, headers, body: deserialize(item.body) });
      } catch {
        break; // still offline
      }
      if (res.ok || (res.status === 409 && item.genId)) {
        await del(key, db);
        did++;
        emit('prosmart:net');
        continue;
      }
      if (res.status === 401 || res.status === 408 || res.status === 429 || res.status >= 500) break; // try again later
      const msg = (await res.text()).slice(0, 300);
      const failed = [...(await failedItems()), { t: Date.now(), method: item.method, url: item.url.replace(SUPABASE_URL, ''), status: res.status, msg }];
      await set('failed', failed.slice(-20), db);
      await del(key, db);
      did++;
    }
  } finally {
    flushing = false;
    emit('prosmart:net');
    if (did) emit('prosmart:synced');
  }
}

export async function clearUserCache(uid: string) {
  await delMany(await strKeys(`c|${uid}|`), db);
}

async function prune() {
  try {
    const all = (await entries<string, Cached>(db)).filter(([k]) => typeof k === 'string' && k.startsWith('c|'));
    if (all.length <= 500) return;
    all.sort((a, b) => (a[1] as Cached).t - (b[1] as Cached).t);
    await delMany(all.slice(0, all.length - 350).map(([k]) => k), db);
  } catch { /* ignore */ }
}

/** Call once at startup. */
export function startOfflineSync() {
  const go = () => { flush(); };
  window.addEventListener('online', () => { emit('prosmart:net'); go(); });
  window.addEventListener('offline', () => emit('prosmart:net'));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) go(); });
  setInterval(go, 15000);
  setTimeout(go, 3000);
  prune();
}

export const isOnline = online;

// ───────────────────────────── the fetch supabase-js uses ─────────────────────────────
export const offlineFetch: typeof fetch = async (input, init = {}) => {
  if (typeof input !== 'string') return fetch(input, init);
  const method = (init.method ?? 'GET').toUpperCase();
  try {
    if (input.startsWith(REST)) {
      if (method === 'GET' || method === 'HEAD') return await cachedRead(input, method, init);
      if (method === 'POST' && input.startsWith(REST + 'rpc/')) {
        const name = new URL(input).pathname.replace('/rest/v1/rpc/', '');
        if (READ_RPC.has(name)) return await cachedRead(input, method, init, typeof init.body === 'string' ? init.body : '');
        if (WRITE_RPC.has(name)) return await writeThrough(input, method, init, 'rpc');
        return fetch(input, init);
      }
      if (['POST', 'PATCH', 'DELETE'].includes(method)) return await writeThrough(input, method, init, 'rest');
    } else if (input.startsWith(STORAGE) && !input.includes('/sign/') && (method === 'POST' || method === 'PUT')) {
      return await writeThrough(input, method, init, 'storage');
    }
  } catch (e) {
    if (isNetErr(e) || (e instanceof DOMException && e.name === 'AbortError')) throw e;
    console.warn('offline layer error, falling back to plain fetch', e);
  }
  return fetch(input, init);
};
