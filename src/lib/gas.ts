/**
 * Server-side client for the GAS Feedback System JSON API.
 * All functions run exclusively on the Next.js server — the viewer key never
 * reaches the browser.
 */

const GAS_URL = process.env.GAS_WEBAPP_URL ?? '';

export interface Session {
  id: string;
  name: string;
  speaker: string;
  date: string;
  status: string;
  link: string;
  responseCount: number;
  avgRating: number | null;
}

export interface PerQuestion {
  question: string;
  avg: number | null;
  count: number;
}

export interface SessionResponse {
  name: string;
  email: string;
  stars: number[];
  comments: string;
  submittedOn: string;
}

export interface SessionDetail {
  id: string;
  name: string;
  speaker: string;
  date: string;
  status: string;
  responseCount: number;
  avgRating: number | null;
  perQuestion: PerQuestion[];
  responses: SessionResponse[];
}

async function gasGet<T>(action: string, key: string, extra: Record<string, string> = {}): Promise<T> {
  if (!GAS_URL) throw new Error('GAS_WEBAPP_URL is not configured.');
  const url = new URL(GAS_URL);
  url.searchParams.set('page', 'api');
  url.searchParams.set('action', action);
  url.searchParams.set('key', key);
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`GAS responded ${res.status}`);
  const json: { ok: boolean; data?: T; error?: string } = await res.json();
  if (!json.ok) throw new Error(json.error ?? 'GAS API error');
  return json.data as T;
}

export interface PublicSession {
  id: string;
  name: string;
  speaker: string;
  date: string;
  status: string;
  questions: string[];
}

export function getSessions(key: string): Promise<Session[]> {
  return gasGet<Session[]>('sessions', key);
}

export function getSessionDetail(key: string, id: string): Promise<SessionDetail> {
  return gasGet<SessionDetail>('detail', key, { id });
}

/** Public — no key required. Used by the Next.js feedback form page. */
export async function getPublicSession(id: string): Promise<PublicSession | null> {
  if (!GAS_URL) return null;
  const url = new URL(GAS_URL);
  url.searchParams.set('page', 'api');
  url.searchParams.set('action', 'session');
  url.searchParams.set('id', id);
  try {
    const res = await fetch(url.toString(), { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const json: { ok: boolean; data?: PublicSession; error?: string } = await res.json();
    return json.ok ? (json.data ?? null) : null;
  } catch {
    return null;
  }
}
