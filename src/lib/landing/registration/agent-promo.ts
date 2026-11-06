// src/lib/landing/registration/agent-promo.ts
// A sales agent makes their own discount code: PZ-<2 to 8 letters or numbers>. It is an owner code, so the
// engine in promo-resolve.ts gives 10% typed plain and NN% for "PZ-NAME-NN%" up to the ceiling.
import type { PromoCode } from "./promo";

export const AGENT_CODE_PREFIX = "PZ-";
const NAME_RE = /^[A-Z0-9]{2,8}$/;
// Names that would look official or confuse a student. The admin can still make any code by hand.
const RESERVED = new Set(["PZ", "ADMIN", "FREE", "TEST", "STAFF", "TEAM", "OFFER", "SALE", "PROMO", "SUPPORT", "ACADEMY"]);

export type AgentCodeParse = { ok: true; code: string } | { ok: false; error: string };

/** "ahm", " a h m ", "pz-ahm" and "PZ AHM" all become PZ-AHM. A name that merely starts with PZ (PZAB) keeps it. */
export function parseAgentCodeInput(raw: string): AgentCodeParse {
  const name = raw.trim().toUpperCase().replace(/^PZ[-\s]+/, "").replace(/\s+/g, "");
  // At least one letter: PZ-50 would read as "50% off" but gives 10%.
  if (!NAME_RE.test(name) || !/[A-Z]/.test(name)) {
    return { ok: false, error: "Use 2 to 8 letters or numbers, with at least one letter and no spaces or symbols." };
  }
  if (RESERVED.has(name)) return { ok: false, error: "That name cannot be used. Please choose another." };
  return { ok: true, code: `${AGENT_CODE_PREFIX}${name}` };
}

export type AgentPromoInput = Omit<PromoCode, "id" | "usedCount">;
export type AgentPromoResult =
  | { ok: true; code: string }
  | { ok: false; reason: "invalid"; error: string }
  | { ok: false; reason: "exists" | "taken" | "db-error" };

export interface AgentPromoDeps {
  /** The agent's owner codes, oldest first (ties broken by id). */
  listForAgent: (agentId: string) => Promise<{ id: string; code: string }[]>;
  remove: (id: string) => Promise<void>;
  create: (input: AgentPromoInput) => Promise<{ ok: true; id: string } | { ok: false; reason: "duplicate" | "not-found" | "invalid" | "db-error" }>;
}

export async function createAgentPromoWith(agentId: string, rawName: string, deps: AgentPromoDeps): Promise<AgentPromoResult> {
  const parsed = parseAgentCodeInput(rawName);
  if (!parsed.ok) return { ok: false, reason: "invalid", error: parsed.error };
  if ((await deps.listForAgent(agentId)).length > 0) return { ok: false, reason: "exists" };
  const r = await deps.create({
    code: parsed.code,
    type: "percent",
    value: 0,
    fixedAmounts: {},
    maxDiscountPercent: 0,
    pageIds: [],
    optionKeys: [],
    maxUses: null,
    oneperEmail: false,
    startsAt: null,
    endsAt: null,
    active: true,
    ownerAgentId: agentId,
    isOwnerCode: true,
    plainPercent: 10,
    maxPercent: null,
  });
  if (r.ok) {
    // Two taps at the same moment (two tabs) can both pass the check above. Read back: only the oldest code stays.
    const mine = await deps.listForAgent(agentId);
    if (mine.length > 1 && mine[0].id !== r.id) {
      await deps.remove(r.id);
      return { ok: false, reason: "exists" };
    }
    return { ok: true, code: parsed.code };
  }
  if (r.reason === "duplicate") return { ok: false, reason: "taken" };
  return { ok: false, reason: "db-error" };
}
