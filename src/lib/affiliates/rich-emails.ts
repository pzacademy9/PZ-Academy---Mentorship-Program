// src/lib/affiliates/rich-emails.ts
// Rich HTML for the affiliate Progress and Motivation emails. Pure: every user-supplied value is
// escaped, only https:// links become buttons, email-safe markup only (tables, inline styles).

import { esc, safeUrl } from "@/lib/affiliates/emails";
import { WITHDRAW_PKR, type PayoutMethod } from "@/lib/affiliates/payouts";

export type TopRow = {
  rank: number;
  publicName: string;
  team: string | null;
  paid: number;
  isMe: boolean;
};

export type ProgressInput = {
  name: string;
  code: string;
  paid: number;
  commissionPkr: number;
  balancePkr: number;
  percent: number;
  rank: number | null;
  gapLine: string;
  top: TopRow[];
  supportWa: string;
  message: string;
  /** The affiliate's private page, where Request payout lives. */
  pageUrl: string;
};

export type MotivationInput = {
  name: string;
  code: string;
  leaderLine: string | null;
  top: TopRow[];
  supportWa: string;
};

const CERT_TARGET = 10;
const TARGET = 10;

const pkr = (n: number): string => "PKR " + Math.floor(n).toLocaleString("en-US");

function pill(text: string, bg: string, color: string): string {
  return `<span style="background:${bg};color:${color};padding:5px 14px;border-radius:50px;font-weight:700;font-size:13px;display:inline-block;">${esc(text)}</span>`;
}

function bar(current: number, target: number, color: string, money = false): string {
  const pct = target > 0 ? Math.min(100, Math.max(0, Math.round((current / target) * 100))) : 0;
  const label = money
    ? `${pkr(current)} / ${pkr(target)} (${pct}%)`
    : `${Math.round(current)} / ${target} (${pct}%)`;
  return (
    `<div style="background:#e2e8f0;border-radius:50px;height:10px;overflow:hidden;margin:8px 0 4px;">` +
    `<div style="width:${pct}%;background:${color};height:10px;border-radius:50px;"></div></div>` +
    `<p style="margin:0;font-size:11px;color:#64748b;">${esc(label)}</p>`
  );
}

function isHttps(u: string): boolean {
  return /^https:\/\//i.test(u);
}

function waBtn(label: string, href: string): string {
  if (!isHttps(href)) return "";
  return `<a href="${safeUrl(href)}" style="display:inline-block;padding:12px 24px;background:#25D366;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;margin:4px;">${esc(label)}</a>`;
}

function wrap(grad: string, icon: string, title: string, subtitle: string, body: string, wa: string): string {
  const help = isHttps(wa)
    ? `Need help? <a href="${safeUrl(wa)}" style="color:#25D366;font-weight:700;text-decoration:none;">Contact us on WhatsApp</a><br>`
    : "";
  return (
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
    `<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif;">` +
    `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:28px 10px;"><tr><td align="center">` +
    `<table cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;"><tr><td>` +
    `<div style="background:${grad};padding:32px 28px 24px;text-align:center;">` +
    `<p style="margin:0 0 10px;font-size:40px;line-height:1;">${icon}</p>` +
    `<h1 style="margin:0;font-size:21px;font-weight:800;color:#ffffff;line-height:1.3;">${esc(title)}</h1>` +
    `<p style="margin:7px 0 0;font-size:13px;color:#e2e8f0;">${esc(subtitle)}</p></div>` +
    `<div style="padding:28px 28px 10px;">${body}</div>` +
    `<div style="margin:0 28px;border-top:1px solid #f1f5f9;padding:16px 0 22px;text-align:center;">` +
    `<p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.9;">${help}` +
    `<strong style="color:#1a73e8;">Pharmacozyme Affiliate Support</strong></p></div>` +
    `</td></tr></table></td></tr></table></body></html>`
  );
}

function medal(rank: number): string {
  return rank === 1 ? "1st" : rank === 2 ? "2nd" : rank === 3 ? "3rd" : `#${rank}`;
}

function th(label: string, align: string): string {
  return `<th style="padding:9px 10px;font-size:11px;color:#ffffff;text-align:${align};">${esc(label)}</th>`;
}

function topTable(rows: TopRow[]): string {
  const trs = rows
    .map((r, i) => {
      const bg = r.isMe
        ? "background:#eff6ff;outline:2px solid #93c5fd;"
        : i % 2 === 0
          ? "background:#ffffff;"
          : "background:#f8fafc;";
      const name = r.isMe
        ? `<strong style="color:#1d4ed8;">${esc(r.publicName)} (YOU)</strong>`
        : esc(r.publicName);
      return (
        `<tr style="${bg}">` +
        `<td style="padding:9px 10px;font-size:13px;text-align:center;font-weight:700;">${esc(medal(r.rank))}</td>` +
        `<td style="padding:9px 10px;font-size:13px;">${name}</td>` +
        `<td style="padding:9px 10px;font-size:13px;text-align:center;color:#475569;">${esc(r.team ?? "-")}</td>` +
        `<td style="padding:9px 10px;font-size:13px;text-align:center;font-weight:700;color:#0d1b2a;">${r.paid}</td></tr>`
      );
    })
    .join("");
  return (
    `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:20px;">` +
    `<tr style="background:#1e1b4b;">${th("Rank", "center")}${th("Name", "left")}${th("Team", "center")}${th("Paid", "center")}</tr>` +
    `${trs}</table>`
  );
}

const MSG_URL = /https:\/\/[^\s<>"']+/gi;

function messageParts(message: string, asLink: (url: string, n: number) => string): string {
  const msg = message.trim();
  if (!msg) return "";
  const paras = msg.split(/\n{2,}/).map((p) => {
    let n = 0;
    let out = "";
    let last = 0;
    for (const m of Array.from(p.matchAll(MSG_URL))) {
      let url = m[0];
      const trail = /[).,;:!?]+$/.exec(url)?.[0] ?? "";
      if (trail) url = url.slice(0, url.length - trail.length);
      const at = m.index ?? 0;
      out += esc(p.slice(last, at)) + asLink(url, ++n) + esc(trail);
      last = at + m[0].length;
    }
    out += esc(p.slice(last));
    return out.replace(/\n/g, "<br>");
  });
  return paras
    .map((p) => `<p style="margin:0 0 10px;font-size:13px;color:#374151;line-height:1.8;">${p}</p>`)
    .join("");
}

export function messageBlockRich(message: string): string {
  const inner = messageParts(
    message,
    (url, n) =>
      `<a href="${esc(url)}" style="display:inline-block;padding:10px 22px;background:#1a73e8;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:13px;margin:6px 4px;">${n === 1 ? "View Details" : `View Details ${n}`}</a>`,
  );
  if (!inner) return "";
  return (
    `<div style="background:#fff7ed;border:1.5px solid #fdba74;border-radius:12px;padding:16px 18px;margin-bottom:20px;">` +
    `<p style="margin:0 0 10px;font-size:14px;font-weight:800;color:#9a3412;">&#128218; A note from the team</p>${inner}</div>`
  );
}

export function messageBlockPlain(message: string): string {
  const inner = messageParts(message, (url) => `<a href="${esc(url)}">${esc(url)}</a>`);
  if (!inner) return "";
  return `<div style="margin:0 0 16px;">${inner}</div>`;
}

const METHOD_LABEL: Record<PayoutMethod, string> = { jazzcash: "JazzCash", easypaisa: "Easypaisa", bank: "bank transfer" };

export type PayoutPaidInput = {
  name: string;
  amountPkr: number;
  method: PayoutMethod;
  paidOn: string;
  pageUrl: string;
  supportWa: string;
};

export type PayoutRejectedInput = {
  name: string;
  amountPkr: number;
  reason: string;
  pageUrl: string;
  supportWa: string;
};

const payPara = (t: string): string => `<p style="font-size:14px;color:#475569;line-height:1.85;margin:0 0 16px;">${t}</p>`;

export function payoutPaidEmail(i: PayoutPaidInput): { subject: string; html: string } {
  const body =
    `<p style="font-size:16px;font-weight:700;color:#0d1b2a;margin:0 0 6px;">Hello ${esc(i.name)},</p>` +
    payPara(`Your payout of <strong>${esc(pkr(i.amountPkr))}</strong> has been sent by ${esc(METHOD_LABEL[i.method])} on ${esc(i.paidOn)}.`) +
    payPara("It can take a short while to show in your account. If you do not see it after a day, please message us and we will help.") +
    `<div style="text-align:center;margin-bottom:24px;">${btn("Open my page", i.pageUrl, "#1a73e8")}</div>`;
  return {
    subject: `${i.name}, your payout of ${pkr(i.amountPkr)} has been sent`,
    html: wrap("#1e1b4b", "&#128176;", "Your Payout Has Been Sent", "Pharmacozyme Affiliate Programme", body, i.supportWa),
  };
}

export function payoutRejectedEmail(i: PayoutRejectedInput): { subject: string; html: string } {
  const body =
    `<p style="font-size:16px;font-weight:700;color:#0d1b2a;margin:0 0 6px;">Hello ${esc(i.name)},</p>` +
    payPara(`We could not process your payout request of <strong>${esc(pkr(i.amountPkr))}</strong>.`) +
    `<div style="background:#f8fafc;border-left:4px solid #94a3b8;border-radius:0 10px 10px 0;padding:14px 16px;margin-bottom:20px;">` +
    `<p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#0d1b2a;">Reason</p>` +
    `<p style="margin:0;font-size:13px;color:#374151;line-height:1.8;">${esc(i.reason)}</p></div>` +
    payPara(`The amount is back in your balance. Once the detail above is put right, you can press Request payout on your page again.`) +
    `<div style="text-align:center;margin-bottom:24px;">${btn("Open my page", i.pageUrl, "#1a73e8")}</div>`;
  return {
    subject: `${i.name}, an update on your payout request`,
    html: wrap("#1e1b4b", "&#128236;", "An Update On Your Payout Request", "Pharmacozyme Affiliate Programme", body, i.supportWa),
  };
}

export function progressEmail(i: ProgressInput): { subject: string; html: string } {
  const canWithdraw = i.balancePkr >= WITHDRAW_PKR;
  const hasCert = i.paid >= CERT_TARGET;
  const needCert = Math.max(0, CERT_TARGET - i.paid);
  const needWd = Math.max(0, WITHDRAW_PKR - i.balancePkr);

  let banners = "";
  if (canWithdraw) {
    banners +=
      `<div style="background:#f0fdf4;border:2px solid #22c55e;border-radius:12px;padding:16px 18px;margin-bottom:18px;text-align:center;">` +
      `<p style="margin:4px 0;font-size:15px;font-weight:800;color:#15803d;">Payout Available</p>` +
      `<p style="margin:0;font-size:13px;color:#374151;line-height:1.75;">Your available balance is <strong>${esc(pkr(i.balancePkr))}</strong>, which meets the minimum of ${esc(pkr(WITHDRAW_PKR))}.<br>` +
      `Open your page and press Request payout.</p>` +
      `<div style="margin-top:12px;">${btn("Open my page", i.pageUrl, "#1a73e8")}</div></div>`;
  }
  if (hasCert) {
    banners +=
      `<div style="background:#eff6ff;border:2px solid #3b82f6;border-radius:12px;padding:16px 18px;margin-bottom:18px;text-align:center;">` +
      `<p style="margin:0 0 4px;font-size:20px;line-height:1;">&#127941;</p>` +
      `<p style="margin:4px 0;font-size:15px;font-weight:800;color:#1d4ed8;">Certificate Now Available</p>` +
      `<p style="margin:0;font-size:13px;color:#374151;line-height:1.75;">You have <strong>${i.paid} paid participants</strong>, so your Certificate of Achievement is ready.<br>Please contact us on WhatsApp to receive it.</p>` +
      `<div style="margin-top:12px;">${waBtn("Certificate Request on WhatsApp", i.supportWa)}</div></div>`;
  }

  const statBox = (value: string, color: string, label: string, last = false): string =>
    `<td width="25%" style="text-align:center;padding:8px 4px;${last ? "" : "border-right:1px solid #4c4580;"}">` +
    `<div style="font-size:22px;font-weight:800;color:${color};">${esc(value)}</div>` +
    `<div style="font-size:9px;color:#cbd5e1;text-transform:uppercase;letter-spacing:1px;margin-top:4px;">${esc(label)}</div></td>`;

  const gap = i.gapLine.trim()
    ? `<div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:10px;padding:12px 16px;margin-bottom:18px;text-align:center;">` +
      `<p style="margin:0;font-size:13px;color:#1d4ed8;">${esc(i.gapLine)}</p></div>`
    : "";

  const body =
    `<p style="font-size:16px;font-weight:700;color:#0d1b2a;margin:0 0 6px;">Hello ${esc(i.name)},</p>` +
    `<p style="font-size:14px;color:#475569;line-height:1.85;margin:0 0 20px;">A new paid registration has been recorded under your code <strong>${esc(i.code)}</strong>. Here is your current summary.</p>` +
    messageBlockRich(i.message) +
    banners +
    `<div style="background:#1e1b4b;border-radius:14px;padding:20px;margin-bottom:20px;text-align:center;">` +
    `<table width="100%" cellpadding="0" cellspacing="0"><tr>` +
    statBox(String(i.paid), "#4ade80", "Paid") +
    statBox(pkr(i.commissionPkr), "#38bdf8", "Commission") +
    statBox(i.rank !== null ? `#${i.rank}` : "N/A", "#FFD700", "Rank") +
    statBox(`${i.percent}%`, "#f87171", "Comm Rate", true) +
    `</tr></table></div>` +
    `<p style="font-size:13px;font-weight:700;color:#0d1b2a;margin:0 0 6px;">Progress Toward Target</p>` +
    `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-bottom:18px;">${bar(i.paid, TARGET, "#1a73e8")}</div>` +
    gap +
    `<p style="font-size:13px;font-weight:700;color:#0d1b2a;margin:0 0 8px;">Leaderboard - Top 10</p>` +
    topTable(i.top) +
    `<p style="font-size:13px;font-weight:700;color:#0d1b2a;margin:0 0 8px;">Your Goals</p>` +
    `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;margin-bottom:20px;">` +
    `<div style="margin-bottom:12px;"><table width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="font-size:13px;color:#0d1b2a;">Certificate (${CERT_TARGET} participants)</td>` +
    `<td align="right">${hasCert ? pill("Completed", "#e6f7ee", "#0b7a3b") : pill(`${needCert} more needed`, "#fce8e6", "#c62828")}</td></tr></table>` +
    bar(i.paid, CERT_TARGET, "#0b7a3b") +
    `</div><div><table width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="font-size:13px;color:#0d1b2a;">Withdrawal (${esc(pkr(WITHDRAW_PKR))})</td>` +
    `<td align="right">${canWithdraw ? pill("Eligible", "#e6f7ee", "#0b7a3b") : pill(`PKR ${Math.ceil(needWd).toLocaleString("en-US")} more`, "#fce8e6", "#c62828")}</td></tr></table>` +
    bar(i.balancePkr, WITHDRAW_PKR, "#f59e0b", true) +
    `</div></div>` +
    `<div style="text-align:center;margin-bottom:24px;">${waBtn("Message us on WhatsApp", i.supportWa)}</div>`;

  return {
    subject: `${i.name}, a new paid registration under your code ${i.code}`,
    html: wrap("#1e1b4b", "&#128202;", "Your Affiliate Summary", "Pharmacozyme Affiliate Programme", body, i.supportWa),
  };
}

export type WelcomeInput = {
  name: string;
  code: string;
  team: string;
  link: string;
  supportWa: string;
  groupWa: string;
  /** Pre-rendered message block (messageBlockPlain). */
  messageHtml?: string;
};

function btn(label: string, href: string, bg: string): string {
  if (!isHttps(href)) return "";
  return `<a href="${safeUrl(href)}" style="display:inline-block;padding:12px 24px;background:${bg};color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;margin:4px;">${esc(label)}</a>`;
}

// Same look as the Progress email, with calm wording (no exclamation marks, no sales words) so mail apps file it in Primary.
export function welcomeEmailRich(i: WelcomeInput): { subject: string; html: string } {
  const para = (t: string): string => `<p style="font-size:14px;color:#475569;line-height:1.85;margin:0 0 16px;">${t}</p>`;
  const body =
    `<p style="font-size:16px;font-weight:700;color:#0d1b2a;margin:0 0 6px;">Hello ${esc(i.name)},</p>` +
    para("Your application to the Pharmacozyme Affiliate Programme has been accepted. Welcome to the team.") +
    (i.messageHtml ?? "") +
    `<div style="background:#f0fdf4;border-left:4px solid #0b7a3b;border-radius:0 10px 10px 0;padding:14px 16px;margin-bottom:20px;">` +
    `<p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#0b7a3b;">Your Details</p>` +
    `<p style="margin:0;font-size:13px;color:#374151;line-height:1.8;">Promo code: <strong>${esc(i.code)}</strong><br>Team: ${esc(i.team)}<br>Commission: 8% to 10% of what the student pays</p></div>` +
    `<div style="background:#eff6ff;border-left:4px solid #1a73e8;border-radius:0 10px 10px 0;padding:14px 16px;margin-bottom:20px;">` +
    `<p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#1a73e8;">How It Works</p>` +
    `<p style="margin:0;font-size:13px;color:#374151;line-height:1.8;">Students who use ${esc(i.code)} receive a 10% reduction in their registration fee. You receive 8% commission on every paid registration. With 10 or more paid participants in a month, your commission is 10% for the whole of the next month. Commission is counted only after the student has paid.</p></div>` +
    para(`At ${CERT_TARGET} paid participants you receive a Certificate of Achievement. You can request a payout once your commission reaches ${esc(pkr(WITHDRAW_PKR))} or more.`) +
    para("Your private page is linked below. Please keep the link to yourself, because anyone who has it can open your page.") +
    `<div style="text-align:center;margin-bottom:24px;">${btn("Open my page", i.link, "#1a73e8")}${btn("Join our WhatsApp group", i.groupWa, "#25D366")}</div>`;
  return {
    subject: `${i.name}, your Pharmacozyme affiliate details`,
    html: wrap("#1e1b4b", "&#129309;", "Your Affiliate Details", "Pharmacozyme Affiliate Programme", body, i.supportWa),
  };
}

export function motivationEmail(i: MotivationInput): { subject: string; html: string } {
  const body =
    `<p style="font-size:16px;font-weight:700;color:#0d1b2a;margin:0 0 6px;">Hello, ${esc(i.name)}!</p>` +
    `<p style="font-size:14px;color:#475569;line-height:1.85;margin:0 0 20px;">You haven't secured any registrations yet, but the first one is always the hardest! Here is a quick reminder of everything waiting for you.</p>` +
    `<div style="background:#f0fdf4;border-left:4px solid #0b7a3b;border-radius:0 10px 10px 0;padding:14px 16px;margin-bottom:20px;">` +
    `<p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#0b7a3b;">Your Promo Code</p>` +
    `<p style="margin:0;font-size:22px;font-weight:800;letter-spacing:3px;color:#1a73e8;font-family:monospace;">${esc(i.code)}</p>` +
    `<p style="margin:6px 0 0;font-size:12px;color:#475569;">Share this. Students get a discount, and you earn commission on every paid registration.</p></div>` +
    `<div style="background:#eff6ff;border-left:4px solid #1a73e8;border-radius:0 10px 10px 0;padding:14px 16px;margin-bottom:20px;">` +
    `<p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#1a73e8;">What You Can Earn</p>` +
    `<p style="margin:0;font-size:13px;color:#374151;line-height:1.8;">Certificate: after <strong>${CERT_TARGET} participants</strong><br>` +
    `Withdrawal: after <strong>${esc(pkr(WITHDRAW_PKR))}</strong> earned<br>` +
    `Your target: <strong>${TARGET} participants</strong></p></div>` +
    (i.leaderLine
      ? `<div style="background:#fefce8;border:1.5px solid #fde68a;border-radius:10px;padding:12px 16px;margin-bottom:20px;text-align:center;">` +
        `<p style="margin:0;font-size:13px;color:#92400e;">${esc(i.leaderLine)}</p></div>`
      : "") +
    `<p style="font-size:13px;font-weight:700;color:#0d1b2a;margin:0 0 8px;">Top 5 Leaderboard</p>` +
    topTable(i.top.slice(0, 5)) +
    `<div style="text-align:center;margin-bottom:24px;">${waBtn("Message us on WhatsApp", i.supportWa)}</div>`;

  return {
    subject: "Start Your Affiliate Journey - Pharmacozyme",
    html: wrap("#166534", "&#128640;", "Time to Get Started!", "Pharmacozyme Affiliate Programme", body, i.supportWa),
  };
}
