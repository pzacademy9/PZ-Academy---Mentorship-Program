// src/lib/progress/report-email.ts
// The progress report email for one student, rebuilt from the owner's Apps Script "performance report"
// (hero with rank and points, ID box, accuracy, top-10 leaderboard with YOU, how-to-climb card,
// class-by-class table, encouragement, links) in PZ Academy colours. Plain inline-styled HTML that
// works in Gmail and on phones. Every text value is escaped.
import type { BatchReport, StudentReport } from "@/lib/progress/report-build";

const C = {
  deep: "#0f3d22",
  mid: "#2e7d32",
  bright: "#7ed957",
  gold: "#c9a84c",
  goldSoft: "#fbf3dc",
  ink: "#1d2a22",
  muted: "#56605a",
  line: "#e2e6e4",
  soft: "#f3f7f4",
  mint: "#eaf7e4",
  red: "#b42318",
};
const FONT = "font-family:Poppins,Segoe UI,Helvetica,Arial,sans-serif;";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
const e = (s: string) => escapeHtml(s);
export const pts = (n: number) => Math.round(n).toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function ordinal(n: number): string {
  const v = n % 100;
  const s = v >= 11 && v <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
}

function rankLabel(rank: number): string {
  return rank === 1 ? "🥇 #1" : rank === 2 ? "🥈 #2" : rank === 3 ? "🥉 #3" : `#${rank}`;
}

function card(inner: string, extra = ""): string {
  return `<div style="background:${C.soft};border:1px solid ${C.line};border-radius:14px;padding:14px 16px;margin:0 0 16px;${extra}">${inner}</div>`;
}

function heading(text: string): string {
  return `<p style="margin:0 0 10px;font-size:14px;font-weight:800;color:${C.ink};${FONT}">${text}</p>`;
}

function hero(s: StudentReport): string {
  const big =
    s.mode === "recorded"
      ? "Recorded student"
      : s.rank !== null && s.hasData
        ? rankLabel(s.rank)
        : "Not ranked yet";
  const sub =
    s.mode === "recorded"
      ? "Recorded students are not ranked, but your quiz totals count"
      : s.rank !== null && s.hasData
        ? `Overall rank out of ${s.rankedCount}`
        : "No quizzes taken yet";
  const stat = (value: string, label: string, color: string, last = false) =>
    `<td width="33%" style="text-align:center;padding:10px 4px;${last ? "" : "border-right:1px solid rgba(255,255,255,0.15);"}">` +
    `<div style="font-size:20px;font-weight:800;color:${color};${FONT}">${value}</div>` +
    `<div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,0.6);margin-top:3px;${FONT}">${label}</div></td>`;
  return (
    `<div style="background:${C.deep};border-radius:16px;padding:22px 18px;margin:0 0 16px;text-align:center;">` +
    `<div style="font-size:${s.mode === "recorded" ? 22 : 32}px;font-weight:900;color:${C.gold};line-height:1.15;${FONT}">${e(big)}</div>` +
    `<p style="margin:6px 0 14px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.65);${FONT}">${e(sub)}</p>` +
    `<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>` +
    stat(pts(s.score), "Points", C.bright) +
    stat(String(s.correct), "Correct", "#ffffff") +
    stat(String(s.incorrect), "Wrong", "#ffb4a8", true) +
    `</tr></table></div>`
  );
}

function idBox(s: StudentReport): string {
  return card(
    `<p style="margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${C.muted};${FONT}">🔑 Your PZ ID (Kahoot nickname)</p>` +
      `<div style="background:#ffffff;border:2px dashed ${C.bright};border-radius:10px;padding:12px;text-align:center;">` +
      `<p style="margin:0;font-size:22px;font-weight:800;letter-spacing:2px;font-family:Courier New,Courier,monospace;color:${C.deep};word-break:break-all;">${e(s.pzId)}</p>` +
      `<p style="margin:4px 0 0;font-size:11px;color:${C.muted};${FONT}">Type it exactly when you join each quiz.</p></div>`,
  );
}

function attendanceBox(s: StudentReport, minPct: number): string {
  const a = s.attendance;
  if (!a || a.held === 0) return "";
  const pct = a.pct ?? 0;
  const ok = a.meetsMin === true;
  return card(
    `<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>` +
      `<td style="font-size:13px;font-weight:700;color:${C.ink};${FONT}">📅 Attendance</td>` +
      `<td align="right" style="font-size:14px;font-weight:800;color:${ok ? C.mid : C.red};${FONT}">${a.attended} of ${a.held} classes</td></tr></table>` +
      bar(pct, ok ? C.bright : C.gold) +
      `<p style="margin:6px 0 0;font-size:11px;color:${C.muted};${FONT}">${
        ok ? `You are above the ${minPct}% needed for the certificate. Keep it up!` : `You need at least ${minPct}% attendance for the certificate.`
      }</p>`,
  );
}

function bar(pct: number, color: string): string {
  const w = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    `<div style="background:${C.line};border-radius:50px;height:8px;overflow:hidden;margin-top:8px;">` +
    `<div style="width:${w}%;background:${color};height:8px;border-radius:50px;min-width:${w > 0 ? 8 : 0}px;"></div></div>`
  );
}

function accuracyBox(s: StudentReport): string {
  if (s.accuracy === null) return "";
  const color = s.accuracy >= 80 ? C.mid : s.accuracy >= 60 ? "#9a6b00" : C.red;
  return card(
    `<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>` +
      `<td style="font-size:13px;font-weight:700;color:${C.ink};${FONT}">🎯 Accuracy</td>` +
      `<td align="right" style="font-size:14px;font-weight:800;color:${color};${FONT}">${s.accuracy}%</td></tr></table>` +
      bar(s.accuracy, s.accuracy >= 80 ? C.bright : s.accuracy >= 60 ? C.gold : "#f28b82") +
      `<p style="margin:6px 0 0;font-size:11px;color:${C.muted};${FONT}">${plural(s.correct, "correct answer")} across your quizzes</p>`,
  );
}

function banner(s: StudentReport): string {
  const box = (bg: string, border: string, title: string, text: string, color: string) =>
    `<div style="background:${bg};border:1px solid ${border};border-radius:12px;padding:12px 14px;margin:0 0 10px;">` +
    `<p style="margin:0 0 3px;font-size:13px;font-weight:800;color:${color};${FONT}">${title}</p>` +
    `<p style="margin:0;font-size:12px;line-height:1.6;color:${C.ink};${FONT}">${text}</p></div>`;
  const c = s.chase;
  if (c.kind === "recorded") return "";
  if (c.kind === "start")
    return box(C.mint, C.bright, "🚀 It's time to start!", "You are registered but have not taken a quiz yet. Join the next quiz and get on this board!", C.deep);
  if (c.kind === "leader")
    return box(C.goldSoft, C.gold, "👑 You are #1. Outstanding!", `You lead with ${pts(s.score)} points. Stay sharp and defend your crown in every quiz!`, "#7a5a00");
  if (c.inTop10)
    return box(C.mint, C.bright, "🏆 You are in the Top 10!", `You are <strong>${pts(c.gap)} points</strong> behind #${c.aboveRank}. Score higher in the next quiz to move up!`, C.deep);
  return box(
    "#fff6ec",
    "#f5c99b",
    "💪 Chase the Top 10!",
    `You are ranked <strong>#${s.rank}</strong>.` +
      (c.top10Cutoff !== null && c.gapToTop10 !== null
        ? ` The top-10 cutoff is ${pts(c.top10Cutoff)} points. You need <strong>${pts(c.gapToTop10)} more points</strong> to break in!`
        : ""),
    "#9a4a00",
  );
}

function leaderboard(s: StudentReport): string {
  if (s.top.length === 0) return "";
  const th = (t: string, align = "center") =>
    `<th style="padding:9px 8px;font-size:11px;font-weight:700;color:#ffffff;text-align:${align};${FONT}">${t}</th>`;
  const you = `<span style="background:${C.bright};color:${C.deep};font-size:9px;padding:1px 6px;border-radius:50px;font-weight:800;margin-left:4px;">YOU</span>`;
  const rankCell = (rank: number) =>
    rank === 1 ? "👑" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `<span style="font-size:11px;font-weight:700;color:${C.muted};${FONT}">#${rank}</span>`;
  const rows = s.top
    .map((r, i) => {
      const bg = r.isMe ? C.mint : r.rank === 1 ? C.goldSoft : i % 2 === 0 ? "#ffffff" : C.soft;
      return (
        `<tr style="background:${bg};">` +
        `<td style="padding:9px 8px;text-align:center;font-size:14px;">${rankCell(r.rank)}</td>` +
        `<td style="padding:9px 8px;font-size:12px;${r.isMe ? `font-weight:800;color:${C.deep};` : `color:${C.ink};`}${FONT}">${e(r.name)}${r.isMe ? you : ""}</td>` +
        `<td style="padding:9px 8px;font-size:12px;text-align:right;font-weight:700;color:${C.deep};${FONT}">${pts(r.score)}</td></tr>`
      );
    })
    .join("");
  const extra = s.meBelow
    ? `<tr><td colspan="3" style="padding:4px 8px;background:${C.soft};font-size:10px;color:${C.muted};${FONT}">⋯ ${plural(s.meBelow.positionsBelow, "place")} below the top 10</td></tr>` +
      `<tr style="background:${C.mint};"><td style="padding:9px 8px;text-align:center;font-size:11px;font-weight:700;color:${C.muted};${FONT}">#${s.meBelow.rank}</td>` +
      `<td style="padding:9px 8px;font-size:12px;font-weight:800;color:${C.deep};${FONT}">${e(s.name)}${you}</td>` +
      `<td style="padding:9px 8px;font-size:12px;text-align:right;font-weight:700;color:${C.deep};${FONT}">${pts(s.meBelow.score)}</td></tr>`
    : "";
  return (
    `<div style="margin:0 0 16px;">` +
    heading("🏆 Top 10 leaderboard") +
    banner(s) +
    `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;border:1px solid ${C.line};border-radius:12px;overflow:hidden;">` +
    `<tr style="background:${C.deep};">${th("Rank")}${th("Name", "left")}${th("Points", "right")}</tr>${rows}${extra}</table>` +
    chaseCard(s) +
    `</div>`
  );
}

function chaseCard(s: StudentReport): string {
  const c = s.chase;
  const box = (title: string, text: string) =>
    `<div style="background:${C.soft};border:1px solid ${C.line};border-radius:12px;padding:12px 14px;margin-top:10px;">` +
    `<p style="margin:0 0 4px;font-size:13px;font-weight:800;color:${C.deep};${FONT}">${title}</p>` +
    `<p style="margin:0;font-size:12px;line-height:1.65;color:${C.ink};${FONT}">${text}</p></div>`;
  if (c.kind === "recorded") return box("📼 Recorded student", "The leaderboard is for live students. Your own quiz totals are above.");
  if (c.kind === "start")
    return box(
      "🎯 How to get on this board",
      `Use your PZ ID as your Kahoot nickname in each quiz.${c.leaderScore !== null ? ` The leader has <strong>${pts(c.leaderScore)} points</strong>.` : ""} Start today and work your way up!`,
    );
  if (c.kind === "leader")
    return box("👑 Defend your crown!", c.leadOverNext !== null ? `The next student is <strong>${pts(c.leadOverNext)} points</strong> behind you. Stay sharp in every quiz!` : "Stay sharp in every quiz!");
  return box(
    `🎯 How to pass #${c.aboveRank}`,
    `You need <strong>${pts(c.gap)} more points</strong> to pass <strong>${e(c.aboveName)}</strong>.` +
      (c.quizzesMissed > 0
        ? ` You missed ${plural(c.quizzesMissed, "quiz", "quizzes")} so far. Take every quiz from now on to close the gap!`
        : " Stay sharp in every quiz!"),
  );
}

function classTable(s: StudentReport): string {
  if (!s.hasData || s.classes.length === 0) return "";
  const th = (t: string, align = "center") =>
    `<th style="padding:9px 6px;font-size:11px;font-weight:700;color:#ffffff;text-align:${align};${FONT}">${t}</th>`;
  const td = (t: string, on: boolean, color = C.ink, align = "center") =>
    `<td style="padding:9px 6px;font-size:12px;text-align:${align};color:${on ? color : "#9aa5a0"};font-weight:${on ? 700 : 400};${FONT}">${t}</td>`;
  const rows = s.classes
    .map((c, i) => {
      const on = c.attempted;
      return (
        `<tr style="background:${i % 2 === 0 ? "#ffffff" : C.soft};">` +
        td(`Class ${c.number}`, on, C.ink, "left") +
        td(on && c.rank !== null ? ordinal(c.rank) : "—", on) +
        td(on ? pts(c.score) : "—", on, C.deep) +
        td(on ? String(c.correct) : "—", on, C.mid) +
        td(on ? String(c.incorrect) : "—", on, c.incorrect > 0 ? C.red : C.mid) +
        `</tr>`
      );
    })
    .join("");
  return (
    `<div style="margin:0 0 16px;">` +
    heading("📊 Class by class") +
    `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;border:1px solid ${C.line};">` +
    `<tr style="background:${C.deep};">${th("Quiz", "left")}${th("Rank")}${th("Points")}${th("✅")}${th("❌")}</tr>${rows}</table>` +
    `<p style="margin:6px 0 0;font-size:11px;color:${C.muted};${FONT}">— = quiz not taken</p></div>`
  );
}

function motivation(s: StudentReport): string {
  const pct = s.accuracy ?? 0;
  const [emoji, title, text] = !s.hasData
    ? ["🚀", "Your journey starts now!", "You have not taken a quiz yet. Join the next class and show your best!"]
    : pct === 100
      ? ["🌟", "Perfect score!", "You answered every question correctly. Outstanding work!"]
      : pct >= 80
        ? ["🎯", "Excellent work!", `You scored ${pct}% accuracy. Keep pushing, the top spot is within reach!`]
        : pct >= 60
          ? ["💪", "Good effort!", `You scored ${pct}% accuracy. Review the questions you missed and you will do even better.`]
          : ["📈", "Keep going!", `You scored ${pct}% accuracy. Every quiz is a chance to improve. Don't give up!`];
  return (
    `<div style="background:${C.deep};border-radius:14px;padding:16px 18px;margin:0 0 16px;text-align:center;">` +
    `<p style="margin:0;font-size:22px;line-height:1;">${emoji}</p>` +
    `<p style="margin:6px 0 4px;font-size:14px;font-weight:800;color:#ffffff;${FONT}">${title}</p>` +
    `<p style="margin:0;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.82);${FONT}">${text}</p></div>`
  );
}

function button(href: string, label: string, bg: string, color: string): string {
  return (
    `<a href="${e(href)}" style="display:block;background:${bg};color:${color};text-align:center;text-decoration:none;font-weight:800;font-size:14px;` +
    `padding:13px 16px;border-radius:50px;margin:0 0 10px;${FONT}">${label}</a>`
  );
}

export type ReportLinks = { portalUrl: string; youtubeUrl: string; unsubscribeUrl: string };

export const DEFAULT_YOUTUBE = "https://www.youtube.com/@Pharmacozyme";

export function reportSubject(batch: Pick<BatchReport, "title">): string {
  return `${batch.title}: your progress report`;
}

export function renderReportEmail(batch: Pick<BatchReport, "title" | "minPct">, s: StudentReport, links: ReportLinks): { subject: string; html: string } {
  const intro = s.hasData
    ? `Here is your progress across all quizzes so far in <strong>${e(batch.title)}</strong>.`
    : `You are registered in <strong>${e(batch.title)}</strong> but have not taken a quiz yet. Here is where the top students stand. Come and join them in the next quiz!`;
  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${e(reportSubject(batch))}</title></head>` +
    `<body style="margin:0;padding:0;background:#eef3ef;${FONT}">` +
    `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#eef3ef;padding:24px 8px 32px;"><tr><td align="center">` +
    `<table cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid ${C.line};"><tr><td>` +
    // Header
    `<div style="background:${C.deep};padding:28px 22px 24px;text-align:center;">` +
    `<div style="display:inline-block;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.25);border-radius:50px;padding:5px 14px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${C.bright};margin-bottom:12px;${FONT}">PZ Academy</div>` +
    `<h1 style="margin:0 0 6px;font-size:20px;font-weight:800;color:#ffffff;line-height:1.3;${FONT}">${e(batch.title)}</h1>` +
    `<p style="margin:0;font-size:13px;color:rgba(255,255,255,0.75);${FONT}">Progress report · all quizzes so far</p></div>` +
    // Body
    `<div style="padding:22px 20px 4px;">` +
    `<p style="margin:0 0 4px;font-size:17px;font-weight:800;color:${C.ink};${FONT}">Hello, ${e(s.firstName)} 👋</p>` +
    `<p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:${C.muted};${FONT}">${intro}</p>` +
    hero(s) +
    idBox(s) +
    attendanceBox(s, batch.minPct) +
    accuracyBox(s) +
    leaderboard(s) +
    classTable(s) +
    motivation(s) +
    `<div style="margin:0 0 8px;">` +
    button(links.portalUrl, "🏆 See the full leaderboard", C.bright, C.deep) +
    (links.youtubeUrl ? button(links.youtubeUrl, "▶ PZ Academy on YouTube", "#ffffff", C.deep).replace("background:#ffffff;", `background:#ffffff;border:2px solid ${C.line};`) : "") +
    `</div></div>` +
    // Footer
    `<div style="margin:8px 20px 0;border-top:1px solid ${C.line};padding:16px 0 24px;text-align:center;">` +
    `<p style="margin:0 0 4px;font-size:13px;font-weight:800;color:${C.deep};${FONT}">Team PZ Academy</p>` +
    `<p style="margin:0;font-size:11px;line-height:1.7;color:${C.muted};${FONT}">Questions? Simply reply to this email.<br>` +
    `<a href="${e(links.unsubscribeUrl)}" style="color:${C.muted};">Unsubscribe from these emails</a></p></div>` +
    `</td></tr></table></td></tr></table></body></html>`;
  return { subject: reportSubject(batch), html };
}
