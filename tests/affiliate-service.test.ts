import { describe, expect, it, vi } from "vitest";
import { acceptApplicationWith, updateAffiliateWith, type AcceptDeps, type UpdateDeps } from "@/lib/affiliates/service";

const applied = { status: "applied" as const, name: "Dr. Ayesha Khan", email: "ayesha@example.com" };

function acceptDeps(over: Partial<AcceptDeps> = {}): AcceptDeps {
  return {
    load: async () => applied,
    nextSerial: vi.fn().mockResolvedValue(321),
    accept: vi.fn().mockResolvedValue("ok"),
    makeToken: () => "t".repeat(32),
    ...over,
  };
}

describe("acceptApplicationWith", () => {
  it("builds the code from the name and the next serial, and returns the token", async () => {
    const deps = acceptDeps();
    const r = await acceptApplicationWith("id-1", {}, deps);
    expect(r).toEqual({ ok: true, code: "AK321", token: "t".repeat(32), name: "Dr. Ayesha Khan", email: "ayesha@example.com" });
    expect(deps.accept).toHaveBeenCalledWith("id-1", { code: "AK321", codeSerial: 321, token: "t".repeat(32), team: null });
  });
  it("uses a code the admin typed (uppercased) and takes no serial", async () => {
    const deps = acceptDeps();
    const r = await acceptApplicationWith("id-1", { code: " ak322 ", team: "Green" }, deps);
    expect(r).toMatchObject({ ok: true, code: "AK322" });
    expect(deps.nextSerial).not.toHaveBeenCalled();
    expect(deps.accept).toHaveBeenCalledWith("id-1", { code: "AK322", codeSerial: null, token: "t".repeat(32), team: "Green" });
  });
  it("refuses a typed code that is not 1 to 3 letters then 1 to 4 digits", async () => {
    for (const bad of ["AK-321", "321", "AK", "ABCD1", "AK12345", "A K1"]) {
      const deps = acceptDeps();
      expect(await acceptApplicationWith("id-1", { code: bad }, deps), bad).toEqual({ ok: false, reason: "invalid-code" });
      expect(deps.accept).not.toHaveBeenCalled();
    }
  });
  it("refuses an unknown team", async () => {
    const r = await acceptApplicationWith("id-1", { team: "Purple" as never }, acceptDeps());
    expect(r).toEqual({ ok: false, reason: "invalid-team" });
  });
  it("only an applied row can be accepted, and no serial is used otherwise", async () => {
    const deps = acceptDeps({ load: async () => ({ ...applied, status: "accepted" as const }) });
    expect(await acceptApplicationWith("id-1", {}, deps)).toEqual({ ok: false, reason: "not-applied" });
    expect(deps.nextSerial).not.toHaveBeenCalled();
    expect(deps.accept).not.toHaveBeenCalled();
  });
  it("says not-found for an unknown id", async () => {
    expect(await acceptApplicationWith("x", {}, acceptDeps({ load: async () => null }))).toEqual({ ok: false, reason: "not-found" });
  });
  it("loses a race gracefully: the other admin accepted between the read and the write", async () => {
    const deps = acceptDeps({ accept: vi.fn().mockResolvedValue("not-applied") });
    expect(await acceptApplicationWith("id-1", {}, deps)).toEqual({ ok: false, reason: "not-applied" });
  });
  it("a typed code that is taken says so", async () => {
    const deps = acceptDeps({ accept: vi.fn().mockResolvedValue("code-taken") });
    expect(await acceptApplicationWith("id-1", { code: "AK322" }, deps)).toEqual({ ok: false, reason: "code-taken" });
    expect(deps.accept).toHaveBeenCalledTimes(1);
  });
  it("an automatic code that collides moves on to the next serial", async () => {
    const accept = vi.fn().mockResolvedValueOnce("code-taken").mockResolvedValueOnce("ok");
    const nextSerial = vi.fn().mockResolvedValueOnce(321).mockResolvedValueOnce(322);
    const r = await acceptApplicationWith("id-1", {}, acceptDeps({ accept, nextSerial }));
    expect(r).toMatchObject({ ok: true, code: "AK322" });
    expect(accept).toHaveBeenCalledTimes(2);
  });
  it("passes a database failure through", async () => {
    expect(await acceptApplicationWith("id-1", {}, acceptDeps({ accept: vi.fn().mockResolvedValue("db-error") }))).toEqual({ ok: false, reason: "db-error" });
  });
});

function updateDeps(current = { commissionMode: "automatic" as "manual" | "automatic", manualPercent: null as number | null }) {
  const update = vi.fn().mockResolvedValue("ok");
  const deps: UpdateDeps = { load: async () => current, update };
  return { deps, update };
}

describe("updateAffiliateWith", () => {
  it("refuses a manual percent outside 8 to 10", async () => {
    for (const p of [7, 7.99, 10.01, 11, 0, -1, Number.NaN]) {
      const { deps, update } = updateDeps();
      const r = await updateAffiliateWith("id-1", { commissionMode: "manual", manualPercent: p }, deps);
      expect(r, String(p)).toEqual({ ok: false, reason: "invalid-percent" });
      expect(update).not.toHaveBeenCalled();
    }
  });
  it("saves manual with a percent from 8 to 10", async () => {
    const { deps, update } = updateDeps();
    expect(await updateAffiliateWith("id-1", { commissionMode: "manual", manualPercent: 9 }, deps)).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith("id-1", { commission_mode: "manual", manual_percent: 9 });
  });
  it("manual needs a percent", async () => {
    const { deps } = updateDeps();
    expect(await updateAffiliateWith("id-1", { commissionMode: "manual" }, deps)).toEqual({ ok: false, reason: "invalid-percent" });
  });
  it("switching to automatic clears the percent", async () => {
    const { deps, update } = updateDeps({ commissionMode: "manual", manualPercent: 9 });
    await updateAffiliateWith("id-1", { commissionMode: "automatic" }, deps);
    expect(update).toHaveBeenCalledWith("id-1", { commission_mode: "automatic", manual_percent: null });
  });
  it("changes only the team when only the team is given, and refuses an unknown team", async () => {
    const { deps, update } = updateDeps({ commissionMode: "manual", manualPercent: 8 });
    await updateAffiliateWith("id-1", { team: "Blue" }, deps);
    expect(update).toHaveBeenCalledWith("id-1", { team: "Blue" });
    expect(await updateAffiliateWith("id-1", { team: "Purple" as never }, deps)).toEqual({ ok: false, reason: "invalid-team" });
    await updateAffiliateWith("id-1", { team: null }, deps);
    expect(update).toHaveBeenLastCalledWith("id-1", { team: null });
  });
  it("says not-found for an unknown id", async () => {
    expect(await updateAffiliateWith("x", { team: "Blue" }, { load: async () => null, update: vi.fn() })).toEqual({ ok: false, reason: "not-found" });
  });
});
