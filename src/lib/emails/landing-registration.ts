import type { PaymentAccount } from "@/lib/data/landing-payment-accounts";
import { isValidWaGroupUrl, type WaGroupButton } from "@/lib/landing/registration/wa-groups";

/**
 * Registration emails ported from the legacy PPC/MDC/W20 Apps Scripts (subjects and merge
 * fields kept). Pure builders: the job handlers send them. Every merge value goes through
 * esc(); links are rendered only when they are https (WhatsApp groups only when they pass
 * isValidWaGroupUrl). Subjects are single-line.
 */

export interface BuiltEmail { subject: string; html: string }
export interface RegionInfo { label: string; classTime: string; timezoneLabel: string }
export interface MemberLine { name: string; email: string; whatsapp: string; profession: string }
export interface LandingEmailContext {
  name: string;
  eventLabel: string;
  refId: string;
  optionLabel: string;
  currency: string;
  amount: number;
  groupSize: number;
  region: RegionInfo | null;
  startsOn: string;
  accounts: PaymentAccount[];
  waGroups: WaGroupButton[];
  verifyUrl: string;
  supportWhatsapp: string;
  /** Paid email only: the learning portal link, set only when the portal is open for this person. */
  portalUrl?: string;
  /** Paid email only: true when the person has no account yet. */
  needsAccount?: boolean;
  signupUrl?: string;
  email?: string;
  /** Underpaid email: what we actually received. */
  amountReceived?: number | null;
  /** Paid email: a group lead paid for this person. */
  coveredByGroup?: boolean;
  /**
   * Paid email caller contract: pass true exactly when the buyer is on a Live course and the
   * portal is still closed. Only then do the "portal opens after your batch" note and the
   * WhatsApp group buttons appear (together). Unset or false means neither is shown.
   */
  portalOpensLater?: boolean;
}
export interface AdminAlertContext extends LandingEmailContext {
  email: string;
  whatsapp: string;
  profession: string;
  city: string;
  discovery: string;
  paymentMethod: string;
  promoCode: string;
  voucherUrl: string;
  members: MemberLine[];
  sheetUrl: string;
  agentName: string;
  utmCampaign: string;
  isFree: boolean;
}

const C = { deep: "#023122", primary: "#04704D", mint: "#80D8AD", ink: "#191C1D", muted: "#5B6660", line: "#E2E8E4", soft: "#F2F8F4" };

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "there";
}
export function money(currency: string, amount: number): string {
  return `${currency} ${Math.round(amount).toLocaleString("en-US")}`;
}
export function formatStartsOn(iso: string): string {
  if (!iso.trim()) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Karachi" }).format(new Date(t));
}
const digits = (s: string) => s.replace(/\D/g, "");
const httpsHref = (url: string): string | null => (/^https:\/\/[^\s"<>]+$/.test(url) ? url : null);

function button(label: string, href: string, solid = true): string {
  const safe = httpsHref(href);
  if (!safe) return "";
  const look = solid ? `background:${C.primary};color:#ffffff;` : `background:#ffffff;color:${C.primary};border:2px solid ${C.primary};`;
  return `<p style="margin:12px 0;"><a href="${esc(safe)}" style="${look}display:inline-block;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none;">${esc(label)}</a></p>`;
}
const para = (html: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${C.ink};">${html}</p>`;
const h3 = (text: string) => `<h3 style="margin:20px 0 10px;font-size:16px;color:${C.deep};">${esc(text)}</h3>`;

function table(rows: [string, string][]): string {
  const body = rows
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `<tr><td style="padding:6px 14px 6px 0;color:${C.muted};font-size:14px;vertical-align:top;">${esc(k)}</td><td style="padding:6px 0;font-size:14px;color:${C.ink};font-weight:600;">${esc(v)}</td></tr>`)
    .join("");
  return body ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-collapse:collapse;">${body}</table>` : "";
}
function refBox(refId: string): string {
  if (!refId) return "";
  return `<div style="margin:0 0 18px;padding:14px 16px;border-radius:8px;background:${C.soft};border:1px solid ${C.line};"><div style="font-size:12px;color:${C.muted};text-transform:uppercase;letter-spacing:.08em;">Your reference ID</div><div style="font-size:20px;font-weight:700;color:${C.deep};">${esc(refId)}</div></div>`;
}
function accountsHtml(accounts: PaymentAccount[]): string {
  if (accounts.length === 0) return "";
  const cards = accounts
    .map((a) => `<div style="margin:0 0 10px;padding:12px 14px;border:1px solid ${C.line};border-radius:8px;"><div style="font-weight:700;color:${C.deep};margin-bottom:6px;">${esc(a.label)}</div>${a.rows.map((r) => `<div style="font-size:14px;color:${C.ink};">${esc(r.label)}: <strong>${esc(r.value)}</strong></div>`).join("")}</div>`)
    .join("");
  return `${h3("Payment accounts")}${para("If you still need to pay, use one of these accounts:")}${cards}`;
}
function waHtml(groups: WaGroupButton[], intro: string): string {
  const buttons = groups.filter((g) => isValidWaGroupUrl(g.url)).map((g) => button(`Join ${g.label} group`, g.url)).join("");
  return buttons ? `${h3("WhatsApp group")}${para(esc(intro))}${buttons}` : "";
}
const scheduleRows = (c: LandingEmailContext): [string, string][] => [
  ["Class time", c.region ? `${c.region.classTime} (${c.region.timezoneLabel})` : ""],
  ["Starts", c.startsOn],
];

function shell(heading: string, bodyHtml: string, supportWhatsapp: string): string {
  const n = digits(supportWhatsapp);
  const support = n ? `Questions? WhatsApp us at <a href="https://wa.me/${n}" style="color:${C.primary};">+${n}</a>.` : "";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(heading)}</title></head><body style="margin:0;padding:0;background:#f4f7f5;font-family:Inter,-apple-system,'Segoe UI',sans-serif;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;"><tr><td style="background:${C.deep};padding:28px 24px;text-align:center;"><div style="font-family:Montserrat,sans-serif;font-size:24px;font-weight:700;color:${C.mint};">PZ Academy</div></td></tr><tr><td style="padding:28px 24px;"><h1 style="margin:0 0 18px;font-family:Montserrat,sans-serif;font-size:21px;color:${C.deep};">${esc(heading)}</h1>${bodyHtml}<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid ${C.line};font-size:13px;color:${C.muted};">${support}</p></td></tr></table></td></tr></table></body></html>`;
}

export function buildReceivedEmail(c: LandingEmailContext): BuiltEmail {
  const fn = firstName(c.name);
  const body = [
    para(`Hi ${esc(fn)}, thank you for registering for <strong>${esc(c.eventLabel)}</strong>. We will check your payment screenshot and confirm your seat within 24 hours.`),
    refBox(c.refId),
    table([["Registration", c.optionLabel], ["Amount due", money(c.currency, c.amount)], ["Group size", c.groupSize > 1 ? String(c.groupSize) : ""], ...scheduleRows(c)]),
    accountsHtml(c.accounts),
    waHtml(c.waGroups, "Join the group for session updates. We approve join requests once your payment is verified."),
    c.verifyUrl ? para("Want it confirmed faster? Send us your details on WhatsApp:") + button("Send verification on WhatsApp", c.verifyUrl, false) : "",
  ].join("");
  return { subject: oneLine(`Got your registration, ${fn} - confirming within 24h`), html: shell("We got your registration", body, c.supportWhatsapp) };
}

export function buildMemberReceivedEmail(c: LandingEmailContext & { leadName: string }): BuiltEmail {
  const fn = firstName(c.name);
  const body = [
    para(`Hi ${esc(fn)}, ${esc(c.leadName)} has registered you for <strong>${esc(c.eventLabel)}</strong> as part of their group. Your group lead handles the payment, and we will confirm within 24 hours.`),
    refBox(c.refId),
    table([["Registration", c.optionLabel], ...scheduleRows(c)]),
    waHtml(c.waGroups, "Join the group for session updates. We approve join requests once the payment is verified."),
  ].join("");
  return { subject: oneLine(`You're in ${firstName(c.leadName)}'s group - confirming within 24h`), html: shell("You're in the group", body, c.supportWhatsapp) };
}

export function buildFreeJoiningEmail(c: LandingEmailContext): BuiltEmail {
  const fn = firstName(c.name);
  const body = [
    para(`Hi ${esc(fn)}, you're registered for <strong>${esc(c.eventLabel)}</strong>. Here is how to join.`),
    refBox(c.refId),
    table([["Registration", c.optionLabel], ...scheduleRows(c)]),
    waHtml(c.waGroups, "The live link is shared only in this group before the session. Join now so you don't miss it."),
  ].join("");
  return { subject: oneLine(`You're in, ${fn} - here are your joining details`), html: shell("Your joining details", body, c.supportWhatsapp) };
}

export function buildPaidEmail(c: LandingEmailContext): BuiltEmail {
  const fn = firstName(c.name);
  const portal = httpsHref(c.portalUrl ?? "");
  // Explicit only: never inferred from a missing link or from WhatsApp groups being present.
  const portalLater = !portal && c.portalOpensLater === true;
  const paid = c.coveredByGroup ? "Covered by your group" : money(c.currency, c.amountReceived ?? c.amount);
  const signup = httpsHref(c.signupUrl ?? "");
  const accountNote = c.needsAccount
    ? para(`To open your course, create an account with this same email address${c.email ? ` (<strong>${esc(c.email)}</strong>)` : ""}${signup ? ` at <a href="${esc(signup)}" style="color:${C.primary};">${esc(signup)}</a>` : c.signupUrl ? ` on our website (${esc(c.signupUrl)})` : ""}.`)
    : "";
  const body = [
    para(`Hi ${esc(fn)}, your payment is verified and your place in <strong>${esc(c.eventLabel)}</strong> is confirmed.`),
    refBox(c.refId),
    table([["Registration", c.optionLabel], ["Amount paid", paid], ...scheduleRows(c)]),
    portal ? button("Open your learning portal", portal) : "",
    accountNote,
    portalLater ? para("Your recordings and course portal open after your batch finishes. We will email you the link.") : "",
    portalLater ? waHtml(c.waGroups, "Zoom link and updates are shared there") : "",
  ].join("");
  return {
    subject: oneLine(portal ? `Your course is ready, ${fn} - start learning` : `You're in, ${fn} - here's your access`),
    html: shell("Payment verified", body, c.supportWhatsapp),
  };
}

export function buildUnderpaidEmail(c: LandingEmailContext): BuiltEmail {
  const fn = firstName(c.name);
  const received = c.amountReceived ?? 0;
  const balance = Math.max(0, c.amount - received);
  const body = [
    para(`Hi ${esc(fn)}, we received your payment for <strong>${esc(c.eventLabel)}</strong>, but it is less than the full fee. Please send the remaining balance to confirm your place.`),
    refBox(c.refId),
    table([["Registration", c.optionLabel], ["Amount due", money(c.currency, c.amount)], ["Amount received", money(c.currency, received)], ["Balance to pay", money(c.currency, balance)], ...scheduleRows(c)]),
    accountsHtml(c.accounts),
  ].join("");
  return { subject: oneLine(`${fn}, your balance is outstanding - ${c.eventLabel}`), html: shell("Balance outstanding", body, c.supportWhatsapp) };
}

export function buildReservedEmail(c: LandingEmailContext): BuiltEmail {
  const fn = firstName(c.name);
  const body = [
    para(`Hi ${esc(fn)}, we are holding a seat for you in <strong>${esc(c.eventLabel)}</strong>. Please complete your payment to confirm your place.`),
    refBox(c.refId),
    table([["Registration", c.optionLabel], ["Amount due", money(c.currency, c.amount)], ...scheduleRows(c)]),
    accountsHtml(c.accounts),
  ].join("");
  return { subject: oneLine(`${fn}, your seat is reserved - complete payment to confirm`), html: shell("Your seat is reserved", body, c.supportWhatsapp) };
}

export function buildAdminAlertEmail(c: AdminAlertContext): BuiltEmail {
  const kind = c.groupSize > 1 ? "Group" : "Individual";
  const amount = c.isFree ? "Free" : money(c.currency, c.amount);
  const membersHtml = c.members.length
    ? `${h3("Group members")}<table role="presentation" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:13px;margin:0 0 18px;"><tr>${["Name", "Email", "WhatsApp", "Profession"].map((h) => `<th align="left" style="border-bottom:1px solid ${C.line};color:${C.muted};">${h}</th>`).join("")}</tr>${c.members.map((m) => `<tr><td>${esc(m.name)}</td><td>${esc(m.email)}</td><td>${esc(m.whatsapp)}</td><td>${esc(m.profession)}</td></tr>`).join("")}</table>`
    : "";
  const body = [
    table([
      ["Ref", c.refId], ["Name", c.name], ["Email", c.email], ["WhatsApp", c.whatsapp], ["Profession", c.profession],
      ["City / country", c.city], ["Region", c.region?.label ?? ""], ["Heard via", c.discovery], ["Registration", c.optionLabel],
      ["Expected amount", amount], ["Payment via", c.paymentMethod], ["Promo code", c.promoCode],
      ["Group size", c.groupSize > 1 ? String(c.groupSize) : ""], ["Agent", c.agentName], ["UTM campaign", c.utmCampaign],
    ]),
    membersHtml,
    button("View receipt", c.voucherUrl),
    button("Open sheet", c.sheetUrl, false),
    digits(c.whatsapp) ? button(`WhatsApp ${firstName(c.name)}`, `https://wa.me/${digits(c.whatsapp)}`, false) : "",
  ].join("");
  return {
    subject: oneLine(`${kind} ${c.eventLabel} Registration - ${c.name}${c.groupSize > 1 ? ` x${c.groupSize}` : ""} - ${amount}`),
    html: shell(`New ${kind.toLowerCase()} registration`, body, ""),
  };
}

export function buildVoucherResubmittedEmail(c: { name: string; email: string; refId: string; eventLabel: string; voucherUrl: string; sheetUrl: string }): BuiltEmail {
  const body = [
    para(`${esc(c.name)} (${esc(c.email)}) uploaded a new payment screenshot for <strong>${esc(c.eventLabel)}</strong>.`),
    table([["Ref", c.refId]]),
    button("View new receipt", c.voucherUrl),
    button("Open sheet", c.sheetUrl, false),
  ].join("");
  return { subject: oneLine(`New voucher uploaded - ${c.name} (${c.refId})`), html: shell("New payment screenshot", body, "") };
}

export function withTestPrefix(e: BuiltEmail): BuiltEmail {
  return { ...e, subject: `[TEST] ${e.subject}` };
}
