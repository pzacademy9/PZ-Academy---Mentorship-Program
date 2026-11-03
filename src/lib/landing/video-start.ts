// src/lib/landing/video-start.ts
// The owner's "Start at" box for a video: "90", "1:30", "1:02:03", "1m30s" or "1h2m3s" -> whole seconds.

const MAX_SECONDS = 6 * 3600;

/** Whole seconds to start a video at. Empty, unreadable or out-of-range entries give 0 (start from the beginning). */
export function startSeconds(raw: unknown): number {
  if (typeof raw !== "string") return 0;
  const v = raw.trim().toLowerCase();
  if (v === "") return 0;
  let total = 0;
  if (/^\d+$/.test(v)) {
    total = Number(v);
  } else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(v)) {
    const parts = v.split(":").map(Number);
    if (parts.slice(1).some((n) => n > 59)) return 0;
    total = parts.reduce((acc, n) => acc * 60 + n, 0);
  } else {
    const m = /^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?$/.exec(v);
    if (!m || (m[1] === undefined && m[2] === undefined && m[3] === undefined)) return 0;
    total = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  }
  return total > 0 && total <= MAX_SECONDS ? total : 0;
}
