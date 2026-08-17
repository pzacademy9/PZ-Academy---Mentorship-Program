import type { ShareView } from "@/lib/mentorship/gas";
import { getNativeShareView } from "@/lib/data/feedback-share";

export interface ShareCardData {
  title:    string;
  avg:      number | null;
  count:    number;
  coverUrl: string | null;
}

/**
 * Flattens either branch of ShareView into the flat shape the two og-image
 * generators (api/share-card/[token]/route.tsx, review/[token]/opengraph-image.tsx)
 * consume. Program avg is the mean of member sessions' own avgRating (skipping
 * unrated sessions), matching the pre-existing GAS-path arithmetic exactly —
 * do not change this formula, only relocate it.
 */
export function flattenShareView(view: ShareView): ShareCardData {
  if (view.type === "session") {
    return {
      title: view.session.name,
      avg: view.session.avgRating,
      count: view.session.responseCount,
      coverUrl: view.session.coverUrl || null,
    };
  }
  const rated = view.sessions.filter((s) => s.avgRating != null);
  const avg = rated.length
    ? Math.round((rated.reduce((a, s) => a + (s.avgRating ?? 0), 0) / rated.length) * 10) / 10
    : null;
  const count = view.sessions.reduce((a, s) => a + s.responseCount, 0);
  return { title: view.program.name, avg, count, coverUrl: view.program.coverUrl || null };
}

export async function fetchShareCardData(token: string): Promise<ShareCardData | null> {
  const native = await getNativeShareView(token);
  if (native) return flattenShareView(native);
  return fetchFromGas(token);
}

async function fetchFromGas(token: string): Promise<ShareCardData | null> {
  const GAS_URL = process.env.MENTORSHIP_GAS_WEBAPP_URL ?? '';
  if (!GAS_URL) return null;
  try {
    const url = new URL(GAS_URL);
    url.searchParams.set('page',   'api');
    url.searchParams.set('action', 'shareview');
    url.searchParams.set('token',  token);
    const res  = await fetch(url.toString(), { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const json = await res.json() as {
      ok: boolean;
      data?: {
        type:      string;
        session?:  { name: string; avgRating: number | null; responseCount: number; coverUrl?: string };
        program?:  { name: string; coverUrl?: string };
        sessions?: { avgRating: number | null; responseCount: number }[];
      };
    };
    if (!json.ok || !json.data) return null;
    const d = json.data;
    if (d.type === 'session' && d.session) {
      return {
        title:    d.session.name,
        avg:      d.session.avgRating,
        count:    d.session.responseCount,
        coverUrl: d.session.coverUrl ?? null,
      };
    }
    if (d.type === 'program' && d.program && d.sessions) {
      const rated = d.sessions.filter(s => s.avgRating != null);
      const avg   = rated.length
        ? Math.round((rated.reduce((a, s) => a + (s.avgRating ?? 0), 0) / rated.length) * 10) / 10
        : null;
      const count = d.sessions.reduce((a, s) => a + s.responseCount, 0);
      return {
        title:    d.program.name,
        avg,
        count,
        coverUrl: d.program.coverUrl ?? null,
      };
    }
    return null;
  } catch {
    return null;
  }
}
