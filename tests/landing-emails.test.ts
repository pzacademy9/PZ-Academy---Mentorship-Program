import { describe, it, expect } from "vitest";
import {
  buildReceivedEmail, buildMemberReceivedEmail, buildFreeJoiningEmail, buildAdminAlertEmail,
  buildVoucherResubmittedEmail, withTestPrefix, esc, firstName, money, formatStartsOn,
  type LandingEmailContext,
} from "@/lib/emails/landing-registration";

const ctx = (over: Partial<LandingEmailContext> = {}): LandingEmailContext => ({
  name: "Ayesha Khan", eventLabel: "PPC Batch 3", refId: "PZA-PPC-001", optionLabel: "Live - Full Course - Individual",
  currency: "PKR", amount: 11500, groupSize: 1,
  region: { label: "Pakistan", classTime: "7:30 - 8:30 PM", timezoneLabel: "Pakistan Standard Time" },
  startsOn: "30 October 2026",
  accounts: [{ key: "faysal", label: "Faysal Bank", kind: "bank", rows: [{ label: "Account No.", value: "3573499000006913" }], displayText: "" }],
  waGroups: [{ label: "Full Course", url: "https://chat.whatsapp.com/IGAWff910JFIzNCw42qGle" }],
  verifyUrl: "https://wa.me/923700199429?text=Hi", supportWhatsapp: "923700199429", ...over,
});

describe("helpers", () => {
  it("escapes, splits names, formats money and dates", () => {
    expect(esc(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
    expect(firstName("  Ayesha Khan ")).toBe("Ayesha");
    expect(firstName("")).toBe("there");
    expect(money("PKR", 11500)).toBe("PKR 11,500");
    expect(formatStartsOn("2026-10-30T14:30:00Z")).toBe("30 October 2026");
    expect(formatStartsOn("nope")).toBe("");
    expect(formatStartsOn("")).toBe("");
  });
});

describe("received email", () => {
  it("uses the legacy subject and shows ref, amount, time, accounts, groups and verify button", () => {
    const e = buildReceivedEmail(ctx());
    expect(e.subject).toBe("Got your registration, Ayesha - confirming within 24h");
    for (const s of ["PZA-PPC-001", "PKR 11,500", "7:30 - 8:30 PM (Pakistan Standard Time)", "30 October 2026", "Faysal Bank", "3573499000006913", "https://chat.whatsapp.com/IGAWff910JFIzNCw42qGle", "https://wa.me/923700199429?text=Hi"]) {
      expect(e.html).toContain(s);
    }
  });
  it("escapes every merge value", () => {
    const e = buildReceivedEmail(ctx({ name: "<script>alert(1)</script>", optionLabel: `"><img src=x>`, eventLabel: "A & B" }));
    expect(e.html).not.toContain("<script>alert(1)</script>");
    expect(e.html).not.toContain(`"><img src=x>`);
    expect(e.html).toContain("A &amp; B");
  });
  it("drops non-https and non-WhatsApp links and strips newlines from the subject", () => {
    const e = buildReceivedEmail(ctx({ name: "Evil\r\nBcc: x@y.com", verifyUrl: "javascript:alert(1)", waGroups: [{ label: "Bad", url: "https://evil.example.com/x" }] }));
    expect(e.subject).not.toMatch(/[\r\n]/);
    expect(e.html).not.toContain("javascript:");
    expect(e.html).not.toContain("evil.example.com");
  });
});

describe("other emails", () => {
  it("member email names the lead and shows no payment accounts", () => {
    const e = buildMemberReceivedEmail({ ...ctx({ name: "Bilal Ahmed" }), leadName: "Ayesha Khan" });
    expect(e.subject).toBe("You're in Ayesha's group - confirming within 24h");
    expect(e.html).toContain("Ayesha Khan");
    expect(e.html).not.toContain("3573499000006913");
  });
  it("free joining email has the group button and no amount or accounts", () => {
    const e = buildFreeJoiningEmail(ctx({ amount: 0, accounts: [] }));
    expect(e.subject).toBe("You're in, Ayesha - here are your joining details");
    expect(e.html).toContain("https://chat.whatsapp.com/IGAWff910JFIzNCw42qGle");
    expect(e.html).not.toContain("PKR 0");
  });
  it("admin alert lists the group members, escaped", () => {
    const e = buildAdminAlertEmail({
      ...ctx({ groupSize: 3 }), email: "ayesha@example.com", whatsapp: "+923001234567", profession: "Pharmacist", city: "Lahore",
      discovery: "WhatsApp", paymentMethod: "faysal", promoCode: "", voucherUrl: "https://drive.google.com/file/d/v1/view",
      members: [{ name: "<b>Bilal</b>", email: "bilal@example.com", whatsapp: "+923002", profession: "Nurse" }],
      sheetUrl: "https://docs.google.com/spreadsheets/d/sheet-1/edit", agentName: "Sara", utmCampaign: "b3", isFree: false,
    });
    expect(e.subject).toBe("Group PPC Batch 3 Registration - Ayesha Khan x3 - PKR 11,500");
    expect(e.html).toContain("&lt;b&gt;Bilal&lt;/b&gt;");
    expect(e.html).toContain("https://docs.google.com/spreadsheets/d/sheet-1/edit");
    expect(e.html).toContain("https://wa.me/923001234567");
  });
  it("voucher re-upload alert and the test prefix", () => {
    const e = buildVoucherResubmittedEmail({ name: "Ayesha Khan", email: "a@b.com", refId: "PZA-PPC-001", eventLabel: "PPC Batch 3", voucherUrl: "https://drive.google.com/file/d/v2/view", sheetUrl: "" });
    expect(e.subject).toBe("New voucher uploaded - Ayesha Khan (PZA-PPC-001)");
    expect(withTestPrefix(e).subject).toBe("[TEST] New voucher uploaded - Ayesha Khan (PZA-PPC-001)");
  });
});
