import { describe, it, expect, vi, beforeEach } from "vitest";

const send = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@getbrevo/brevo", () => ({
  BrevoClient: class {
    transactionalEmails = { sendTransacEmail: send };
  },
}));

import { sendAffiliateEmail } from "@/lib/brevo-affiliates";
import { acceptedEmail, droppedEmail, leftEmail } from "@/lib/affiliates/emails";

const opts = { to: "a@b.com", toName: "A", subject: "S", htmlContent: "<p>x</p>" };

beforeEach(() => {
  send.mockReset();
  for (const k of ["BREVO_API_KEY_AFFILIATES", "BREVO_SENDER_EMAIL_AFFILIATES", "BREVO_SENDER_NAME_AFFILIATES", "BREVO_API_KEY"]) delete process.env[k];
  process.env.BREVO_SENDER_EMAIL = "main@pz.test";
  process.env.BREVO_SENDER_NAME = "Main";
});

describe("sendAffiliateEmail", () => {
  it("returns not set up without throwing or calling Brevo when the key is missing", async () => {
    expect(await sendAffiliateEmail(opts)).toEqual({ ok: false, error: "Affiliate email is not set up" });
    expect(send).not.toHaveBeenCalled();
  });
  it("sends with the affiliates sender and never the main sender", async () => {
    process.env.BREVO_API_KEY_AFFILIATES = "k";
    process.env.BREVO_SENDER_EMAIL_AFFILIATES = "aff@pz.test";
    process.env.BREVO_SENDER_NAME_AFFILIATES = "Aff";
    send.mockResolvedValue({});
    expect(await sendAffiliateEmail(opts)).toEqual({ ok: true });
    expect(send).toHaveBeenCalledWith({
      sender: { email: "aff@pz.test", name: "Aff" },
      to: [{ email: "a@b.com", name: "A" }],
      subject: "S",
      htmlContent: "<p>x</p>",
    });
  });
  it("does not fall back to the main sender when the sender is missing", async () => {
    process.env.BREVO_API_KEY_AFFILIATES = "k";
    const r = await sendAffiliateEmail(opts);
    expect(r.ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
  it("returns the error when Brevo fails", async () => {
    process.env.BREVO_API_KEY_AFFILIATES = "k";
    process.env.BREVO_SENDER_EMAIL_AFFILIATES = "aff@pz.test";
    process.env.BREVO_SENDER_NAME_AFFILIATES = "Aff";
    send.mockRejectedValue(new Error("boom"));
    expect(await sendAffiliateEmail(opts)).toEqual({ ok: false, error: "boom" });
  });
});

describe("affiliate emails", () => {
  const base = { name: "Sara", code: "SK321", team: "Blue", link: "https://x.test/a/tok", supportWa: "https://wa.me/1", groupWa: "https://chat.whatsapp.com/g" };
  it("accepted email has code, link, 8% and PKR 3,500", () => {
    const { subject, html } = acceptedEmail(base);
    expect(subject).toMatch(/affiliate/i);
    for (const s of ["SK321", "https://x.test/a/tok", "8%", "PKR 3,500", "10%"]) expect(html).toContain(s);
  });
  it("escapes html in the name and team", () => {
    const { html } = acceptedEmail({ ...base, name: "<script>alert(1)</script>", team: "<b>x</b>" });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;script&gt;");
  });
  it("never uses banned words", () => {
    for (const html of [acceptedEmail(base).html, droppedEmail({ name: "S" }).html, leftEmail({ name: "S" }).html])
      expect(html).not.toMatch(/official|ambassador|instant|weekly|raast/i);
  });
  it("reads like a personal letter so Gmail files it in Primary", () => {
    const mails = [acceptedEmail(base), droppedEmail({ name: "S" }), leftEmail({ name: "S" })];
    for (const { subject, html } of mails) {
      expect(subject).not.toMatch(/!|congrat|selected|free|offer|win|limited|deal|bonus/i);
      expect(html).not.toMatch(/!/);
      expect(html).not.toMatch(/background|<img|<table|<button|border-radius/i);
      expect((html.match(/<a /g) ?? []).length).toBeLessThanOrEqual(3);
    }
  });
  it("dropped and left emails greet by escaped name", () => {
    expect(droppedEmail({ name: "<i>S</i>" }).html).not.toContain("<i>S</i>");
    expect(leftEmail({ name: "Sara" }).html).toContain("Sara");
    expect(droppedEmail({ name: "Sara" }).subject).toBeTruthy();
  });
});
