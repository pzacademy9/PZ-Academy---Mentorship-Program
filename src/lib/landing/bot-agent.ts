// src/lib/landing/bot-agent.ts
// Best-effort: link previews, crawlers and scripts must not count as page views (they inflate an agent's numbers).
// Every real browser sends a browser name, so a missing one counts as a bot too.
const BOT_RE = /bot|crawl|spider|preview|headless|lighthouse|facebookexternalhit|whatsapp|telegram|slack|discord|linkedin|curl|wget|python-requests|node-fetch/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  const v = (ua ?? "").trim();
  return v === "" || BOT_RE.test(v);
}
