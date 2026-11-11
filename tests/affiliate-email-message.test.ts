import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { createSupabaseMock } from "./helpers/supabase-mock";

vi.mock("server-only", () => ({}));
const gate = vi.hoisted(() => ({ result: null as unknown, area: null as unknown }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async (area: unknown) => {
    gate.area = area;
    return gate.result;
  },
}));
const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { PUT } from "@/app/api/admin/affiliates/email-message/route";
import { getEmailMessage, setEmailMessage } from "@/lib/data/affiliate-email-settings";
import { acceptedEmail } from "@/lib/affiliates/emails";
import { messageBlockPlain } from "@/lib/affiliates/rich-emails";

const put = (body: unknown) =>
  PUT(new Request("http://x/api/admin/affiliates/email-message", { method: "PUT", body: JSON.stringify(body) }));

beforeEach(() => {
  db.reset();
  gate.result = { ok: true, user: { id: "u" } };
});

describe("getEmailMessage", () => {
  it('returns "" when the read fails', async () => {
    db.state.handler = () => ({ data: null, error: { message: "boom" } });
    expect(await getEmailMessage()).toBe("");
  });
  it('returns "" when the row is missing, and the text when present', async () => {
    db.state.handler = () => ({ data: null, error: null });
    expect(await getEmailMessage()).toBe("");
    db.state.handler = () => ({ data: { message: "Hi team" }, error: null });
    expect(await getEmailMessage()).toBe("Hi team");
  });
});

describe("setEmailMessage", () => {
  it("trims and saves", async () => {
    await setEmailMessage("  hello  ");
    const op = db.state.ops.find((o) => o.op === "upsert")!;
    expect((op.payload as { message: string }).message).toBe("hello");
  });
  it("rejects more than 1000 characters without writing", async () => {
    await expect(setEmailMessage("a".repeat(1001))).rejects.toThrow();
    expect(db.state.ops).toHaveLength(0);
    await setEmailMessage("a".repeat(1000));
    expect(db.state.ops).toHaveLength(1);
  });
  it("throws on a database error", async () => {
    db.state.handler = () => ({ data: null, error: { message: "boom" } });
    await expect(setEmailMessage("x")).rejects.toBeTruthy();
  });
});

describe("PUT /api/admin/affiliates/email-message", () => {
  it("is admin only (sales_hub) and touches nothing when refused", async () => {
    gate.result = { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    expect((await put({ message: "x" })).status).toBe(403);
    expect(gate.area).toBe("sales_hub");
    expect(db.state.ops).toHaveLength(0);
  });
  it("validates: 400 over 1000 characters or a non-string", async () => {
    expect((await put({ message: "a".repeat(1001) })).status).toBe(400);
    expect((await put({ message: 5 })).status).toBe(400);
    expect(db.state.ops).toHaveLength(0);
  });
  it("saves and returns ok", async () => {
    const res = await put({ message: " hi " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect((db.state.ops.find((o) => o.op === "upsert")!.payload as { message: string }).message).toBe("hi");
  });
  it("a database failure gives a generic 500", async () => {
    db.state.handler = () => ({ data: null, error: { message: "secret db detail" } });
    const res = await put({ message: "x" });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
  });
});

const base = { name: "Ali", code: "ALI10", team: "Team A", link: "https://pharmacozyme.com/a/tok", supportWa: "https://wa.me/1", groupWa: "https://chat.whatsapp.com/x" };

describe("acceptedEmail message", () => {
  it("adds the message as plain text with a normal anchor and no button", () => {
    const m = acceptedEmail({ ...base, messageHtml: messageBlockPlain("Join us at https://example.com/live <b>") });
    expect(m.html).toContain('<a href="https://example.com/live">https://example.com/live</a>');
    expect(m.html).toContain("&lt;b&gt;");
    expect(m.html).not.toContain("display:inline-block");
    expect(m.html).not.toContain("View Details");
    expect(m.html.indexOf("Join us")).toBeGreaterThan(m.html.indexOf("Hello Ali"));
  });
  it("without a message (or a blank one) is byte-identical to today's output", () => {
    const expected =
      `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222222;">` +
      `<p style="margin:0 0 14px;">Hello Ali,</p>` +
      `<p style="margin:0 0 14px;">Your application to the Pharmacozyme Affiliate Programme has been accepted. Welcome to the team.</p>` +
      `<p style="margin:0 0 14px;">Your code: <strong>ALI10</strong><br>Your team: Team A<br>Your commission: 8% to 10% of what the student pays</p>` +
      `<p style="margin:0 0 14px;">Students who use ALI10 get 10% off their registration. You earn 8% on every paid registration. If you have 10 or more paid participants in a month, you earn 10% for the whole of the next month. Commission is counted only after the student has paid.</p>` +
      `<p style="margin:0 0 14px;">At 10 paid participants you receive a Certificate of Achievement. You can ask for a payout once you have earned PKR 3,500 or more.</p>` +
      `<p style="margin:0 0 14px;">Your private page: <a href="https://pharmacozyme.com/a/tok">open my page</a><br>Please keep this link to yourself, because anyone who has it can open your page.</p>` +
      `<p style="margin:0 0 14px;">Our WhatsApp group: <a href="https://chat.whatsapp.com/x">join the group</a><br>Questions: <a href="https://wa.me/1">message support</a></p>` +
      `<p style="margin:24px 0 0;">Regards,<br>Pharmacozyme Affiliate Team</p></div>`;
    expect(acceptedEmail(base).html).toBe(expected);
    expect(acceptedEmail({ ...base, messageHtml: messageBlockPlain("   ") }).html).toBe(expected);
  });
});
