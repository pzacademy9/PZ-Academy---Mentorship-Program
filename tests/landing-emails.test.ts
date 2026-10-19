import { describe, it, expect } from "vitest";
import {
  buildReceivedEmail, buildMemberReceivedEmail, buildFreeJoiningEmail, buildAdminAlertEmail,
  buildVoucherResubmittedEmail, buildPaidEmail, buildUnderpaidEmail, buildReservedEmail, withTestPrefix, esc, firstName, money, formatStartsOn,
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

describe("paid email", () => {
  const portal = "https://academy.example.com/portal";
  it("recorded + account: ready subject, portal button, group amount text", () => {
    const e = buildPaidEmail(ctx({ portalUrl: portal, coveredByGroup: true }));
    expect(e.subject).toBe("Your course is ready, Ayesha - start learning");
    expect(e.html).toContain("Open your learning portal");
    expect(e.html).toContain(portal);
    expect(e.html).toContain("Covered by your group");
    expect(e.html).not.toContain("PKR 11,500");
  });
  it("shows amount received when not covered by a group", () => {
    expect(buildPaidEmail(ctx({ portalUrl: portal, amountReceived: 9000 })).html).toContain("PKR 9,000");
    expect(buildPaidEmail(ctx({ portalUrl: portal })).html).toContain("PKR 11,500");
  });
  it("recorded + guest: account note with the email, no portal button", () => {
    const e = buildPaidEmail(ctx({ portalOpensLater: false, needsAccount: true, email: "a@b.com", signupUrl: "https://academy.example.com/register" }));
    expect(e.html).toContain("create an account");
    expect(e.html).toContain("a@b.com");
    expect(e.html).toContain('href="https://academy.example.com/register"');
    expect(e.html).not.toContain("Open your learning portal");
    expect(e.html).not.toContain("open after your batch finishes");
  });
  it("non-https signup url is plain text, not a link", () => {
    const e = buildPaidEmail(ctx({ needsAccount: true, email: "a@b.com", signupUrl: "javascript:alert(1)" }));
    expect(e.html).not.toContain("href=\"javascript:");
  });
  it("live-closed + account: portal opens later, WhatsApp group, no portal button", () => {
    const e = buildPaidEmail(ctx({ portalOpensLater: true }));
    expect(e.subject).toBe("You're in, Ayesha - here's your access");
    expect(e.html).toContain("open after your batch finishes");
    expect(e.html).toContain("https://chat.whatsapp.com/IGAWff910JFIzNCw42qGle");
    expect(e.html).toContain("Zoom link and updates are shared there");
    expect(e.html).not.toContain("Open your learning portal");
  });
  it("noCourse: WhatsApp block kept, no opens-later sentence, no portal button; unset unchanged", () => {
    const e = buildPaidEmail(ctx({ portalOpensLater: true, noCourse: true }));
    expect(e.html).toContain("Zoom link and updates are shared there");
    expect(e.html).toContain("https://chat.whatsapp.com/");
    expect(e.html).not.toContain("open after your batch finishes");
    expect(e.html).not.toContain("Open your learning portal");
    expect(buildPaidEmail(ctx({ portalOpensLater: true })).html).toContain("open after your batch finishes");
  });
  it("live-closed + guest: portal-later, account note and WhatsApp", () => {
    const e = buildPaidEmail(ctx({ portalOpensLater: true, needsAccount: true, email: "a@b.com", signupUrl: "https://academy.example.com/register" }));
    expect(e.html).toContain("open after your batch finishes");
    expect(e.html).toContain("create an account");
    expect(e.html).toContain("https://chat.whatsapp.com/");
  });
  it("never contradicts: portal button never comes with the opens-later note or WhatsApp", () => {
    const e = buildPaidEmail(ctx({ portalUrl: portal, portalOpensLater: true }));
    expect(e.html).toContain("Open your learning portal");
    expect(e.html).not.toContain("open after your batch finishes");
    expect(e.html).not.toContain("chat.whatsapp.com");
  });
  it("recorded + account, no valid portal link, flag unset: no opens-later, no WhatsApp", () => {
    for (const portalUrl of [undefined, "http://academy.example.com/portal"]) {
      const e = buildPaidEmail(ctx({ portalUrl }));
      expect(e.html).not.toContain("open after your batch finishes");
      expect(e.html).not.toContain("chat.whatsapp.com");
      expect(e.html).not.toContain("Open your learning portal");
    }
  });
  it("recorded + guest with groups present, flag unset: account note only", () => {
    const e = buildPaidEmail(ctx({ needsAccount: true, email: "a@b.com", signupUrl: "https://academy.example.com/register" }));
    expect(e.html).toContain("create an account");
    expect(e.html).not.toContain("chat.whatsapp.com");
    expect(e.html).not.toContain("open after your batch finishes");
  });
  it("portal button and account note render together", () => {
    const e = buildPaidEmail(ctx({ portalUrl: portal, needsAccount: true, email: "a@b.com", signupUrl: "https://academy.example.com/register" }));
    expect(e.html).toContain("Open your learning portal");
    expect(e.html).toContain("create an account");
    expect(e.html).not.toContain("chat.whatsapp.com");
  });
  it("renders the portal button only for an https portalUrl", () => {
    for (const bad of ["http://academy.example.com/portal", "javascript:alert(1)"]) {
      const e = buildPaidEmail(ctx({ portalUrl: bad }));
      expect(e.html).not.toContain("Open your learning portal");
      expect(e.html).not.toContain(bad);
      expect(e.subject).toBe("You're in, Ayesha - here's your access");
    }
  });
  it("escapes a hostile name and keeps the subject on one line", () => {
    const e = buildPaidEmail(ctx({ name: "<script>alert(1)</script>\r\nBcc: x@y.com", portalUrl: portal }));
    expect(e.html).not.toContain("<script>alert(1)</script>");
    expect(e.subject).not.toMatch(/[\r\n]/);
  });
});

describe("underpaid email", () => {
  it("shows received, due and computed balance with accounts and no portal link", () => {
    const e = buildUnderpaidEmail(ctx({ amountReceived: 8000, portalUrl: "https://academy.example.com/portal" }));
    expect(e.subject).toBe("Ayesha, your balance is outstanding - PPC Batch 3");
    expect(e.html).toContain("PKR 8,000");
    expect(e.html).toContain("PKR 11,500");
    expect(e.html).toContain("PKR 3,500");
    expect(e.html).toContain("3573499000006913");
    expect(e.html).not.toContain("academy.example.com/portal");
  });
  it("balance is 0 when overpaid and a hostile name is escaped", () => {
    const e = buildUnderpaidEmail(ctx({ name: "<script>x</script>", amountReceived: 20000 }));
    expect(e.html).toContain("PKR 0");
    expect(e.html).not.toContain("<script>x</script>");
  });
  it("treats missing amountReceived as nothing received", () => {
    const html = buildUnderpaidEmail(ctx()).html;
    expect(html).toContain("PKR 11,500");
    expect(html).toMatch(/Amount received<\/td><td[^>]*>PKR 0</);
  });
});

describe("reserved email", () => {
  it("shows the seat held, amount due and accounts", () => {
    const e = buildReservedEmail(ctx());
    expect(e.subject).toBe("Ayesha, your seat is reserved - complete payment to confirm");
    expect(e.html).toContain("PKR 11,500");
    expect(e.html).toContain("3573499000006913");
    expect(e.html).toContain("PPC Batch 3");
  });
  it("escapes a hostile name and strips newlines from the subject", () => {
    const e = buildReservedEmail(ctx({ name: "<script>x</script>\nBcc: a@b.c" }));
    expect(e.html).not.toContain("<script>x</script>");
    expect(e.subject).not.toMatch(/[\r\n]/);
  });
});
