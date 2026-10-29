import { pktToIso, isoToPktInput } from "@/lib/attendance/rules";

export type ClassDefaults = { start: string; end: string; zoom: string };

export type ClassDayInput = {
  date: string;
  start?: string;
  end?: string;
  zoom?: string;
  title?: string;
  speaker?: string;
  existingId?: string;
};

export type ExistingClass = {
  id: string;
  number: number;
  startsAtIso: string;
  endsAtIso: string | null;
  zoom: string;
  customTime: boolean;
  customZoom: boolean;
};

type ClassFields = {
  date: string;
  startsAt: string;
  endsAt: string | null;
  zoom: string;
  customTime: boolean;
  customZoom: boolean;
  title: string;
  speaker: string;
};

export type ClassOp =
  | ({ kind: "create"; number: number } & ClassFields)
  | ({ kind: "update"; id: string } & ClassFields)
  | { kind: "remove"; id: string };

export type PlanResult = { ok: true; ops: ClassOp[] } | { ok: false; message: string };

const clean = (s: string | undefined) => (s ?? "").trim();

export function planClasses(
  days: ClassDayInput[],
  defaults: ClassDefaults,
  existing: ExistingClass[],
  type: "course" | "workshop" | "webinar",
): PlanResult {
  if (days.length === 0) return { ok: false, message: "Add at least one class day" };
  if (type === "webinar" && days.length !== 1) {
    return { ok: false, message: "A webinar has only one day" };
  }

  const seen = new Set<string>();
  for (const d of days) {
    if (seen.has(d.date)) return { ok: false, message: `The day ${d.date} is listed twice` };
    seen.add(d.date);
  }

  const built: { day: ClassDayInput; fields: ClassFields }[] = [];
  for (const day of days) {
    const ownStart = clean(day.start);
    const ownEnd = clean(day.end);
    const ownZoom = clean(day.zoom);
    const start = ownStart || defaults.start;
    const end = ownEnd || defaults.end;
    const startsAt = pktToIso(`${day.date}T${start}`);
    // An old class that never had an end time keeps none: do not invent one from the defaults.
    const old = day.existingId ? existing.find((e) => e.id === day.existingId) : undefined;
    const keepNoEnd = !!old && old.endsAtIso === null && old.customTime && ownEnd === "";
    const endsAt = keepNoEnd ? null : pktToIso(`${day.date}T${end}`);
    if (!startsAt || (!keepNoEnd && !endsAt)) {
      return { ok: false, message: `The date or time for ${day.date} is not valid` };
    }
    if (endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      return { ok: false, message: `The end time must be after the start time on ${day.date}` };
    }
    built.push({
      day,
      fields: {
        date: day.date,
        startsAt,
        endsAt,
        zoom: ownZoom || defaults.zoom,
        customTime: ownStart !== "" || ownEnd !== "",
        customZoom: ownZoom !== "",
        title: clean(day.title),
        speaker: clean(day.speaker),
      },
    });
  }

  const existingIds = new Set(existing.map((e) => e.id));
  const kept = new Set<string>();
  const ops: ClassOp[] = [];
  const fresh: ClassFields[] = [];

  for (const { day, fields } of built) {
    if (day.existingId && existingIds.has(day.existingId) && !kept.has(day.existingId)) {
      kept.add(day.existingId);
      ops.push({ kind: "update", id: day.existingId, ...fields });
    } else {
      fresh.push(fields);
    }
  }

  for (const e of existing) {
    if (!kept.has(e.id)) ops.push({ kind: "remove", id: e.id });
  }

  let next = Math.max(0, ...existing.map((e) => e.number)) + 1;
  fresh
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((f) => ops.push({ kind: "create", number: next++, ...f }));

  return { ok: true, ops };
}

export type DefaultsUpdate = { id: string; startsAt?: string; endsAt?: string; zoom?: string };

/** Re-apply new defaults to classes that did not set their own time / zoom. */
export function applyDefaultsToClasses(
  existing: ExistingClass[],
  defaults: ClassDefaults,
): DefaultsUpdate[] {
  const out: DefaultsUpdate[] = [];
  for (const e of existing) {
    const row: DefaultsUpdate = { id: e.id };
    if (!e.customTime && e.endsAtIso) {
      const date = isoToPktInput(e.startsAtIso).slice(0, 10);
      const startsAt = pktToIso(`${date}T${defaults.start}`);
      const endsAt = pktToIso(`${date}T${defaults.end}`);
      if (startsAt && endsAt) {
        row.startsAt = startsAt;
        row.endsAt = endsAt;
      }
    }
    if (!e.customZoom) row.zoom = defaults.zoom;
    if (row.startsAt || row.zoom !== undefined) out.push(row);
  }
  return out;
}
