import { describe, it, expect, beforeEach, vi } from "vitest";

const listSheetsToScan = vi.fn();
const runScan = vi.fn();
vi.mock("@/lib/data/landing-sheet-sync", () => ({
  listSheetsToScan: (...a: unknown[]) => listSheetsToScan(...a),
  runScan: (...a: unknown[]) => runScan(...a),
}));

import { POST, maxDuration } from "@/app/api/webhooks/landing-sheet-scan/route";
import { NextRequest } from "next/server";

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/webhooks/landing-sheet-scan", { method: "POST", body: JSON.stringify(body) });
const row = (o: Record<string, unknown> = {}) => ({
  rowNumber: 2, refId: "PZ-1", email: "a@x.com", name: "A", whatsapp: "923001234567", status: "Pending", amount: "", rowType: "Individual", ...o,
});

beforeEach(() => {
  listSheetsToScan.mockReset();
  runScan.mockReset();
  process.env.SHEETS_SYNC_SECRET = "secret";
});

describe("landing-sheet-scan route", () => {
  it("exports maxDuration 60", () => expect(maxDuration).toBe(60));

  it("wrong or missing token returns the error reply and never touches the data module", async () => {
    for (const body of [{ action: "listSheets" }, { token: "nope", action: "listSheets" }, { token: "nope", action: "scan", sheetId: "s", rows: [] }]) {
      const res = await POST(req(body));
      expect(await res.json()).toEqual({ status: "error", message: "Wrong password." });
    }
    expect(listSheetsToScan).not.toHaveBeenCalled();
    expect(runScan).not.toHaveBeenCalled();
  });

  it("rejects everything when the secret is not configured", async () => {
    delete process.env.SHEETS_SYNC_SECRET;
    const res = await POST(req({ token: undefined, action: "listSheets" }));
    expect((await res.json()).status).toBe("error");
    expect(listSheetsToScan).not.toHaveBeenCalled();
  });

  it("listSheets returns the ordered list", async () => {
    const sheets = [{ sheetId: "a", pageId: "p1", state: "live" }, { sheetId: "b", pageId: "p2", state: "report" }];
    listSheetsToScan.mockResolvedValue(sheets);
    const body = await (await POST(req({ token: "secret", action: "listSheets" }))).json();
    expect(body).toEqual({ status: "success", sheets });
  });

  it("scan with valid rows returns the summary", async () => {
    const summary = { applied: 1, rejected: 0, skipped: 0, unknown: 0, duplicates: 0, differences: 0 };
    runScan.mockResolvedValue(summary);
    const rows = [row()];
    const body = await (await POST(req({ token: "secret", action: "scan", sheetId: "s1", rows }))).json();
    expect(body).toEqual({ status: "success", ...summary });
    expect(runScan).toHaveBeenCalledWith("s1", rows);
  });

  it("unknown sheetId returns an error", async () => {
    runScan.mockResolvedValue({ error: "unknown-sheet" });
    const body = await (await POST(req({ token: "secret", action: "scan", sheetId: "zz", rows: [] }))).json();
    expect(body.status).toBe("error");
    expect(body.message).toMatch(/sheet/i);
  });

  it("rejects more than 5000 rows without scanning", async () => {
    const rows = Array.from({ length: 5001 }, (_, i) => row({ rowNumber: i + 2 }));
    const body = await (await POST(req({ token: "secret", action: "scan", sheetId: "s1", rows }))).json();
    expect(body.status).toBe("error");
    expect(runScan).not.toHaveBeenCalled();
  });

  it("rejects strings over 500 characters and malformed rows", async () => {
    for (const bad of [row({ name: "x".repeat(501) }), { rowNumber: 2 }, row({ rowNumber: "2" })]) {
      const body = await (await POST(req({ token: "secret", action: "scan", sheetId: "s1", rows: [bad] }))).json();
      expect(body.status).toBe("error");
    }
    expect(runScan).not.toHaveBeenCalled();
  });

  it("rejects an unknown action and non-JSON bodies", async () => {
    expect((await (await POST(req({ token: "secret", action: "x" }))).json()).status).toBe("error");
    const bad = new NextRequest("http://localhost/x", { method: "POST", body: "not json" });
    expect((await (await POST(bad)).json()).status).toBe("error");
  });

  it("replies with a plain error when the data module throws, without leaking details", async () => {
    runScan.mockRejectedValue(new Error("secret db detail"));
    const body = await (await POST(req({ token: "secret", action: "scan", sheetId: "s1", rows: [] }))).json();
    expect(body.status).toBe("error");
    expect(JSON.stringify(body)).not.toContain("secret db detail");
  });
});
