/**
 * Server-side client for the GAS Feedback System JSON API.
 *
 * Only the PUBLIC session lookup lives here now — the admin panel + viewer were
 * moved fully into GAS (Admin.html, password-gated). This is used by the public
 * Next.js feedback form to load a session's questions. It resolves either a raw
 * session ID or a custom slug (GAS getSessionById_ handles both).
 */

const GAS_URL = process.env.GAS_WEBAPP_URL ?? '';

export interface Question {
  text: string;
  type: string; // 'stars' | 'video'
}

export interface PublicSession {
  id: string;
  name: string;
  speaker: string;
  date: string;
  status: string;
  questions: Question[];
  coverUrl?: string;
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

export interface ShareResponse {
  submittedOn: string;
  stars: number[];
  videos: string[];
  comments: string;
}

export interface SharePerQuestion {
  question: string;
  type: 'stars' | 'video';
  avg: number | null;
  count: number;
}

export interface ShareSession {
  id: string;
  name: string;
  speaker: string;
  date: string;
  coverUrl: string;
  responseCount: number;
  avgRating: number | null;
  perQuestion: SharePerQuestion[];
  responses: ShareResponse[];
}

export interface ShareProgram {
  id: string;
  name: string;
  type: string;
  coverUrl: string;
}

export type ShareView =
  | { type: 'session'; session: ShareSession }
  | { type: 'program'; program: ShareProgram; sessions: ShareSession[] };

export async function getShareView(token: string): Promise<ShareView | null> {
  if (!GAS_URL) return null;
  const url = new URL(GAS_URL);
  url.searchParams.set('page', 'api');
  url.searchParams.set('action', 'shareview');
  url.searchParams.set('token', token);
  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return null;
    const json: { ok: boolean; data?: ShareView; error?: string } = await res.json();
    if (!json.ok) {
      console.error('GAS shareview error:', json.error);
      return null;
    }
    return json.data ?? null;
  } catch {
    return null;
  }
}
