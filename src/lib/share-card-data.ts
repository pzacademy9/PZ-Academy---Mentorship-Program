export interface ShareCardData {
  title: string;
  avg:   number | null;
  count: number;
}

export async function fetchShareCardData(token: string): Promise<ShareCardData | null> {
  const GAS_URL = process.env.GAS_WEBAPP_URL ?? '';
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
        session?:  { name: string; avgRating: number | null; responseCount: number };
        program?:  { name: string };
        sessions?: { avgRating: number | null; responseCount: number }[];
      };
    };
    if (!json.ok || !json.data) return null;
    const d = json.data;
    if (d.type === 'session' && d.session) {
      return { title: d.session.name, avg: d.session.avgRating, count: d.session.responseCount };
    }
    if (d.type === 'program' && d.program && d.sessions) {
      const rated = d.sessions.filter(s => s.avgRating != null);
      const avg   = rated.length
        ? Math.round((rated.reduce((a, s) => a + (s.avgRating ?? 0), 0) / rated.length) * 10) / 10
        : null;
      const count = d.sessions.reduce((a, s) => a + s.responseCount, 0);
      return { title: d.program.name, avg, count };
    }
    return null;
  } catch {
    return null;
  }
}
