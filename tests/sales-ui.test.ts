import { describe, it, expect } from "vitest";
import {
  DEFAULT_MESSAGE,
  OUTCOME_BUTTONS,
  activityLabel,
  budgetLine,
  explainSendError,
  formatWait,
  greetingFor,
  hourLine,
  leadPayload,
  lockCopy,
  outcomeLabel,
  pickDefaultNumber,
  recentlySent,
  secondsUntil,
  sendLock,
  type AgentBudgetJson,
  type BudgetJson,
} from "@/lib/crm/sales-ui";

const NOW = new Date("2026-10-05T10:00:00.000Z");
const plus = (s: number) => new Date(NOW.getTime() + s * 1000).toISOString();
const budget = (over: Partial<BudgetJson> = {}): BudgetJson => ({
  dailyUsed: 12, dailyCap: 60, hourlyUsed: 2, hourlyCap: 20, hourlyWarning: false,
  quietHours: false, quietEndsAt: null, frozen: false, frozenUntil: null, nextUnlockAt: null, ...over,
});
const num = (id: string, label: string, b: BudgetJson = budget()): AgentBudgetJson => ({
  number: { id, label, phone_e164: null }, budget: b,
});

describe("pickDefaultNumber", () => {
  it("prefers the open number with the most new chats left, then label", () => {
    expect(pickDefaultNumber([num("a", "A", budget({ dailyUsed: 50 })), num("b", "B", budget({ dailyUsed: 10 }))])).toBe("b");
    expect(pickDefaultNumber([num("b", "Beta"), num("a", "Alpha")])).toBe("a");
  });
  it("skips a frozen number even if it has more left", () => {
    expect(pickDefaultNumber([num("a", "A", budget({ frozen: true, dailyUsed: 0 })), num("b", "B", budget({ dailyUsed: 59 }))])).toBe("b");
  });
  it("still selects one when all are frozen (so the screen can explain), null when none", () => {
    expect(pickDefaultNumber([num("a", "A", budget({ frozen: true }))])).toBe("a");
    expect(pickDefaultNumber([])).toBeNull();
  });
});

describe("countdown wording", () => {
  it("rounds up to whole seconds and never goes negative", () => {
    expect(secondsUntil(plus(73.2), NOW)).toBe(74);
    expect(secondsUntil(plus(-5), NOW)).toBe(0);
  });
  it("seconds up to 2 minutes, then minutes, then a clock time", () => {
    expect(formatWait(74, plus(74))).toBe("in 74s");
    expect(formatWait(120, plus(120))).toBe("in 120s");
    expect(formatWait(600, plus(600))).toBe("in 10 min");
    expect(formatWait(7200, plus(7200))).toMatch(/^at \d\d:\d\d$/);
  });
});

describe("sendLock (why the WhatsApp button is locked)", () => {
  const sel = (b: BudgetJson) => ({ budgets: [num("a", "A", b)], selected: num("a", "A", b), warm: false, now: NOW });
  it("loading before budgets arrive; no-number when the agent has none", () => {
    expect(sendLock({ budgets: null, selected: null, warm: false, now: NOW })).toEqual({ kind: "loading" });
    expect(sendLock({ budgets: [], selected: null, warm: false, now: NOW })).toEqual({ kind: "no-number" });
  });
  it("frozen beats quiet beats wait beats caps", () => {
    const all = budget({ frozen: true, quietHours: true, quietEndsAt: plus(3600), nextUnlockAt: plus(60), dailyUsed: 60 });
    expect(sendLock(sel(all)).kind).toBe("frozen");
    expect(sendLock(sel({ ...all, frozen: false })).kind).toBe("quiet");
    expect(sendLock(sel({ ...all, frozen: false, quietHours: false }))).toEqual({ kind: "wait", until: plus(60) });
    expect(sendLock(sel({ ...all, frozen: false, quietHours: false, nextUnlockAt: null })).kind).toBe("daily-cap");
  });
  it("an unlock time in the past is ready", () => {
    expect(sendLock(sel(budget({ nextUnlockAt: plus(-1) })))).toEqual({ kind: "ready" });
  });
  it("caps do not lock a warm contact (replies are not new chats)", () => {
    const capped = budget({ dailyUsed: 60, hourlyUsed: 20 });
    expect(sendLock({ ...sel(capped), warm: true })).toEqual({ kind: "ready" });
    expect(sendLock(sel(budget({ hourlyUsed: 20 }))).kind).toBe("hourly-cap");
  });
});

describe("lockCopy", () => {
  it("uses the spec wording for the countdown", () => {
    expect(lockCopy({ kind: "wait", until: plus(74) }, NOW).button).toBe("Next message unlocks in 74s");
  });
  it("explains each lock in plain words", () => {
    expect(lockCopy({ kind: "ready" }, NOW)).toEqual({ button: "Message on WhatsApp", detail: null });
    expect(lockCopy({ kind: "no-number" }, NOW).detail).toMatch(/ask your admin/i);
    expect(lockCopy({ kind: "frozen", until: null }, NOW).detail).toMatch(/admin/i);
    expect(lockCopy({ kind: "quiet", until: plus(3600) }, NOW).button).toBe("Paused overnight");
    expect(lockCopy({ kind: "daily-cap" }, NOW).detail).toMatch(/already replied/i);
  });
  it("never claims anything is safe or guaranteed", () => {
    const kinds = [
      { kind: "ready" }, { kind: "loading" }, { kind: "no-number" }, { kind: "frozen", until: plus(99) },
      { kind: "quiet", until: plus(99) }, { kind: "wait", until: plus(400) }, { kind: "daily-cap" }, { kind: "hourly-cap" },
    ] as const;
    for (const k of kinds) {
      const c = lockCopy(k, NOW);
      expect(`${c.button} ${c.detail ?? ""}`).not.toMatch(/\bsafe\b|guarantee/i);
    }
  });
});

describe("budget lines and errors", () => {
  it("formats the visible budget", () => {
    expect(budgetLine(budget())).toBe("12 of 60 new chats used today");
    expect(hourLine(budget())).toBe("2 of 20 this hour");
  });
  it("adds when to try again", () => {
    expect(explainSendError({ error: "Wait a moment before the next message.", retryAt: plus(74) }, NOW)).toBe(
      "Wait a moment before the next message. Try again in 74s.",
    );
    expect(explainSendError(null, NOW)).toBe("Could not send this message.");
  });
});

describe("labels", () => {
  it("outcome buttons follow the spec order", () => {
    expect(OUTCOME_BUTTONS.map((o) => o.label)).toEqual(["Replied", "Interested", "Bought", "Not interested"]);
  });
  it("labels timeline kinds and outcomes", () => {
    expect(activityLabel("sent")).toBe("Messaged on WhatsApp");
    expect(activityLabel("released")).toBe("Released to unclaimed");
    expect(activityLabel("mystery")).toBe("mystery");
    expect(outcomeLabel("not_interested")).toBe("Not interested");
    expect(outcomeLabel(null)).toBe("New");
  });
  it("greets by local hour", () => {
    expect(greetingFor(9)).toBe("Good morning");
    expect(greetingFor(13)).toBe("Good afternoon");
    expect(greetingFor(19)).toBe("Good evening");
  });
  it("the default message uses the merge tag and offers an opt-out", () => {
    expect(DEFAULT_MESSAGE).toContain("{{first_name}}");
    expect(DEFAULT_MESSAGE).toMatch(/STOP/);
  });
});

describe("leadPayload", () => {
  it("trims and drops blank optional fields (the email schema rejects empty strings)", () => {
    expect(leadPayload({ phone: " 0300 1234567 ", name: " Ayesha ", email: " ", profession: "", note: "wants fees" })).toEqual({
      phone: "0300 1234567",
      name: "Ayesha",
      note: "wants fees",
    });
  });
});

describe("recentlySent", () => {
  it("is true when a sent row is within 24 hours", () => {
    expect(recentlySent([{ id: "1", kind: "sent", body: null, agent_name: null, created_at: plus(-3600) }], NOW)).toBe(true);
    expect(recentlySent([{ id: "1", kind: "sent", body: null, agent_name: null, created_at: plus(-90_000) }], NOW)).toBe(false);
    expect(recentlySent([{ id: "1", kind: "note", body: "x", agent_name: null, created_at: plus(-60) }], NOW)).toBe(false);
  });
});
