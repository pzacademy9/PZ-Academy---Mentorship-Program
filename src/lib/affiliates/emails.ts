// src/lib/affiliates/emails.ts
// Plain HTML for the three affiliate emails. Pure: every user-supplied value is escaped.

export function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeUrl(u: string): string {
  return /^https:\/\//i.test(u) ? esc(u) : "#";
}

function button(label: string, href: string, color = "#0a6640"): string {
  return `<a href="${safeUrl(href)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:10px;margin:0 4px 8px;">${esc(label)}</a>`;
}

function wrap(title: string, body: string): string {
  return `<div style="background:#f1f5f9;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
<div style="background:#0a6640;color:#ffffff;padding:22px 24px;"><div style="font-size:12px;opacity:.85;">Pharmacozyme Affiliate Programme</div><div style="font-size:20px;font-weight:700;margin-top:4px;">${esc(title)}</div></div>
<div style="padding:24px;">${body}</div>
<div style="padding:14px 24px;background:#f8fafc;color:#64748b;font-size:12px;">Pharmacozyme, PZ Academy</div>
</div></div>`;
}

const P = "font-size:14px;color:#475569;line-height:1.85;margin:0 0 18px;";
const H = "font-size:16px;font-weight:700;color:#0d1b2a;margin:0 0 8px;";

export function acceptedEmail(a: {
  name: string;
  code: string;
  team: string;
  link: string;
  supportWa: string;
  groupWa: string;
}): { subject: string; html: string } {
  const body =
    `<p style="${H}">Hello, ${esc(a.name)}!</p>` +
    `<p style="${P}">Congratulations! You have been selected as a Pharmacozyme Affiliate. We are glad to have you on board.</p>` +
    `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;margin-bottom:18px;">` +
    `<p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#0d1b2a;">Your details</p>` +
    `<table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#374151;">` +
    `<tr><td style="padding:5px 0;width:40%;">Promo code</td><td><strong style="font-size:18px;letter-spacing:2px;font-family:monospace;">${esc(a.code)}</strong></td></tr>` +
    `<tr><td style="padding:5px 0;">Team</td><td>${esc(a.team)}</td></tr>` +
    `<tr><td style="padding:5px 0;">Commission</td><td><strong>8% to 10%</strong> of what the student pays</td></tr>` +
    `</table></div>` +
    `<div style="background:#eff6ff;border-left:4px solid #1a73e8;padding:14px 16px;margin-bottom:18px;font-size:13px;color:#374151;line-height:1.8;">` +
    `<strong>How it works</strong><br>` +
    `- Students who use <strong>${esc(a.code)}</strong> get 10% off their registration.<br>` +
    `- You earn 8% commission on every paid registration, and 10% once you reach 10 paid participants.<br>` +
    `- Commission is counted only after the student has paid.</div>` +
    `<div style="background:#f0fdf4;border-left:4px solid #0b7a3b;padding:14px 16px;margin-bottom:18px;font-size:13px;color:#374151;line-height:1.8;">` +
    `<strong>Goals and rewards</strong><br>` +
    `Certificate of Achievement at 10 paid participants.<br>` +
    `You can ask for a payout once you have earned PKR 3,500 or more.</div>` +
    `<p style="${P}">Your private link is below. Keep it to yourself: anyone who has it can open your page.</p>` +
    `<div style="text-align:center;margin-bottom:12px;">${button("Open my private link", a.link)}</div>` +
    `<div style="text-align:center;">${button("Join WhatsApp group", a.groupWa, "#128C7E")}${button("Contact support", a.supportWa, "#128C7E")}</div>`;
  return {
    subject: "Congratulations! You are selected as a Pharmacozyme Affiliate",
    html: wrap("You are in!", body),
  };
}

export function droppedEmail(a: { name: string }): { subject: string; html: string } {
  const body =
    `<p style="${H}">Hello, ${esc(a.name)}</p>` +
    `<p style="${P}">Your affiliate status has been marked as <strong>Dropped</strong>.</p>` +
    `<div style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;font-size:13px;color:#374151;line-height:1.8;">` +
    `If you think this is a mistake, or you are ready to start again, please message us on WhatsApp and we will look at your case.</div>`;
  return { subject: "Affiliate status update - Pharmacozyme", html: wrap("Affiliate status update", body) };
}

export function leftEmail(a: { name: string }): { subject: string; html: string } {
  const body =
    `<p style="${H}">Hello, ${esc(a.name)}</p>` +
    `<p style="${P}">We have noted your decision to leave the Pharmacozyme Affiliate Programme. Thank you for the time and effort you gave us.</p>` +
    `<div style="background:#f0fdf4;border-left:4px solid #0b7a3b;padding:14px 16px;margin-bottom:18px;font-size:13px;color:#374151;line-height:1.8;">` +
    `If you ever wish to return, you are welcome back.</div>` +
    `<p style="${P}">Best wishes for everything ahead!</p>`;
  return { subject: "Thank you for your time - Pharmacozyme Affiliate", html: wrap("Thank you", body) };
}
