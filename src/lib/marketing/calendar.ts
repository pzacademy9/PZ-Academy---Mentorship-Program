// Pure: "Add to calendar" for a live batch's first class or a webinar.
// Google Calendar link + the text of an .ics file (phones, Outlook, Apple Calendar).

export type CalendarEvent = {
  title: string;
  /** UTC ISO start time. */
  startIso: string;
  minutes: number;
  details: string;
  /** Absolute link to the course page. */
  url: string;
};

/** How long a calendar entry lasts. The real class length is not stored anywhere. */
export const EVENT_MINUTES = 120;

/** 20261212T140000Z */
function stamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function span(e: CalendarEvent): { start: string; end: string } | null {
  const t = Date.parse(e.startIso);
  if (Number.isNaN(t)) return null;
  return { start: stamp(t), end: stamp(t + e.minutes * 60_000) };
}

export function googleCalendarUrl(e: CalendarEvent): string | null {
  const s = span(e);
  if (!s) return null;
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${s.start}/${s.end}`,
    details: `${e.details}\n${e.url}`.trim(),
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** RFC 5545 TEXT escaping. */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 74 characters continue on the next line after a space (RFC 5545 folding). */
function fold(line: string): string {
  const chars = Array.from(line);
  if (chars.length <= 74) return line;
  const parts: string[] = [];
  for (let i = 0; i < chars.length; i += 74) parts.push(chars.slice(i, i + 74).join(""));
  return parts.join("\r\n ");
}

export function icsFile(e: CalendarEvent, uid: string, nowMs: number): string | null {
  const s = span(e);
  if (!s) return null;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PZ Academy//Website//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${esc(uid)}`,
    `DTSTAMP:${stamp(nowMs)}`,
    `DTSTART:${s.start}`,
    `DTEND:${s.end}`,
    `SUMMARY:${esc(e.title)}`,
    `DESCRIPTION:${esc(`${e.details}\n${e.url}`.trim())}`,
    `URL:${esc(e.url)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/**
 * The calendar entry a course page offers: the open live batch's start when it
 * has one in the future, else an upcoming webinar's own date. null = no button.
 */
export function courseCalendarEvent(input: {
  course: { title: string; slug: string; type: string; status: string; startsAt?: string | null };
  batch: { title: string; startsAt: string } | null;
  origin: string;
  nowMs: number;
  webinarUpcoming: boolean;
}): CalendarEvent | null {
  const url = `${input.origin.replace(/\/+$/, "")}/courses/${input.course.slug}`;
  const future = (iso: string | null | undefined) => !!iso && !Number.isNaN(Date.parse(iso)) && Date.parse(iso) > input.nowMs;
  if (input.batch && future(input.batch.startsAt)) {
    return { title: input.batch.title, startIso: input.batch.startsAt, minutes: EVENT_MINUTES, details: "PZ Academy live batch starts.", url };
  }
  if (input.course.type === "webinar" && input.webinarUpcoming && future(input.course.startsAt)) {
    return { title: input.course.title, startIso: input.course.startsAt as string, minutes: EVENT_MINUTES, details: "PZ Academy webinar.", url };
  }
  return null;
}
