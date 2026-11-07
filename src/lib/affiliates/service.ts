// src/lib/affiliates/service.ts
// Rules for accepting an applicant and editing an affiliate. Pure: the database comes in through deps,
// like agent-promo.ts, so every branch can be tested without one.
import { buildAffiliateCode } from "./code";

export const TEAMS = ["Green", "White", "Yellow", "Blue", "Pink"] as const;
export type Team = (typeof TEAMS)[number];
export type AffiliateStatus = "applied" | "accepted" | "dropped" | "left";
export type CommissionMode = "manual" | "automatic";

/** 1 to 3 letters then 1 to 4 digits: AK321, JM145, RAS12. */
const CODE_RE = /^[A-Z]{1,3}\d{1,4}$/;
const MAX_AUTO_TRIES = 3;

const isTeam = (v: unknown): v is Team => typeof v === "string" && (TEAMS as readonly string[]).includes(v);

export type AcceptResult =
  | { ok: true; code: string; token: string; name: string; email: string }
  | { ok: false; reason: "not-found" | "not-applied" | "code-taken" | "invalid-code" | "invalid-team" | "db-error" };

export interface AcceptDeps {
  load: (id: string) => Promise<{ status: AffiliateStatus; name: string; email: string } | null>;
  nextSerial: () => Promise<number>;
  /** Atomic: only an `applied` row changes. "not-applied" means someone else got there first. */
  accept: (
    id: string,
    v: { code: string; codeSerial: number | null; token: string; team: Team | null },
  ) => Promise<"ok" | "not-applied" | "code-taken" | "db-error">;
  makeToken: () => string;
}

export async function acceptApplicationWith(
  id: string,
  opts: { code?: string; team?: Team | null },
  deps: AcceptDeps,
): Promise<AcceptResult> {
  const team = opts.team ?? null;
  if (team !== null && !isTeam(team)) return { ok: false, reason: "invalid-team" };
  const typed = opts.code === undefined ? null : opts.code.trim().toUpperCase();
  if (typed !== null && !CODE_RE.test(typed)) return { ok: false, reason: "invalid-code" };

  const row = await deps.load(id);
  if (!row) return { ok: false, reason: "not-found" };
  if (row.status !== "applied") return { ok: false, reason: "not-applied" };

  const token = deps.makeToken();
  for (let attempt = 0; attempt < (typed ? 1 : MAX_AUTO_TRIES); attempt++) {
    const serial = typed ? null : await deps.nextSerial();
    const code = typed ?? buildAffiliateCode(row.name, serial as number);
    const r = await deps.accept(id, { code, codeSerial: serial, token, team });
    if (r === "ok") return { ok: true, code, token, name: row.name, email: row.email };
    if (r === "code-taken" && !typed) continue;
    return { ok: false, reason: r };
  }
  return { ok: false, reason: "code-taken" };
}

export type UpdatePatch = { team?: Team | null; commissionMode?: CommissionMode; manualPercent?: number | null };
export type UpdateResult = { ok: true } | { ok: false; reason: "not-found" | "invalid-team" | "invalid-percent" | "db-error" };

export interface UpdateDeps {
  load: (id: string) => Promise<{ commissionMode: CommissionMode; manualPercent: number | null } | null>;
  update: (id: string, row: Record<string, unknown>) => Promise<"ok" | "db-error">;
}

export async function updateAffiliateWith(id: string, patch: UpdatePatch, deps: UpdateDeps): Promise<UpdateResult> {
  const current = await deps.load(id);
  if (!current) return { ok: false, reason: "not-found" };
  const row: Record<string, unknown> = {};

  if ("team" in patch) {
    if (patch.team !== null && !isTeam(patch.team)) return { ok: false, reason: "invalid-team" };
    row.team = patch.team ?? null;
  }

  if (patch.commissionMode !== undefined || patch.manualPercent !== undefined) {
    const mode = patch.commissionMode ?? current.commissionMode;
    if (mode === "manual") {
      const percent = patch.manualPercent ?? current.manualPercent;
      if (percent === null || percent === undefined || !(percent >= 8 && percent <= 10)) return { ok: false, reason: "invalid-percent" };
      row.commission_mode = "manual";
      row.manual_percent = percent;
    } else {
      row.commission_mode = "automatic";
      row.manual_percent = null;
    }
  }

  if (Object.keys(row).length === 0) return { ok: true };
  return (await deps.update(id, row)) === "ok" ? { ok: true } : { ok: false, reason: "db-error" };
}
