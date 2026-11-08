// src/lib/affiliates/emails.ts
// Plain-letter HTML for the three affiliate emails. Pure: every user-supplied value is escaped.
// Kept deliberately plain (no banners, boxes, buttons or images, few links, no exclamation marks)
// so mail apps treat it as a personal message and file it in the main inbox, not Promotions.

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

function link(label: string, href: string): string {
  return `<a href="${safeUrl(href)}">${esc(label)}</a>`;
}

function wrap(body: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222222;">${body}<p style="margin:24px 0 0;">Regards,<br>Pharmacozyme Affiliate Team</p></div>`;
}

const P = "margin:0 0 14px;";

export function acceptedEmail(a: {
  name: string;
  code: string;
  team: string;
  link: string;
  supportWa: string;
  groupWa: string;
}): { subject: string; html: string } {
  const body =
    `<p style="${P}">Hello ${esc(a.name)},</p>` +
    `<p style="${P}">Your application to the Pharmacozyme Affiliate Programme has been accepted. Welcome to the team.</p>` +
    `<p style="${P}">Your code: <strong>${esc(a.code)}</strong><br>Your team: ${esc(a.team)}<br>Your commission: 8% to 10% of what the student pays</p>` +
    `<p style="${P}">Students who use ${esc(a.code)} get 10% off their registration. You earn 8% on every paid registration. If you have 10 or more paid participants in a month, you earn 10% for the whole of the next month. Commission is counted only after the student has paid.</p>` +
    `<p style="${P}">At 10 paid participants you receive a Certificate of Achievement. You can ask for a payout once you have earned PKR 3,500 or more.</p>` +
    `<p style="${P}">Your private page: ${link("open my page", a.link)}<br>Please keep this link to yourself, because anyone who has it can open your page.</p>` +
    `<p style="${P}">Our WhatsApp group: ${link("join the group", a.groupWa)}<br>Questions: ${link("message support", a.supportWa)}</p>`;
  return {
    subject: "Your Pharmacozyme affiliate details",
    html: wrap(body),
  };
}

export function droppedEmail(a: { name: string }): { subject: string; html: string } {
  const body =
    `<p style="${P}">Hello ${esc(a.name)},</p>` +
    `<p style="${P}">Your affiliate status has been marked as dropped.</p>` +
    `<p style="${P}">If you think this is a mistake, or you would like to start again, please message us on WhatsApp and we will look at your case.</p>`;
  return { subject: "Your Pharmacozyme affiliate status", html: wrap(body) };
}

export function leftEmail(a: { name: string }): { subject: string; html: string } {
  const body =
    `<p style="${P}">Hello ${esc(a.name)},</p>` +
    `<p style="${P}">We have noted your decision to leave the Pharmacozyme Affiliate Programme. Thank you for the time and effort you gave us.</p>` +
    `<p style="${P}">If you ever wish to return, you are welcome back.</p>`;
  return { subject: "Thank you for your time with Pharmacozyme", html: wrap(body) };
}
