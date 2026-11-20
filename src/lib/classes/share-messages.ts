import { CHECKIN_CLOSE_MINUTES, CHECKIN_OPEN_MINUTES, PKT_OFFSET_MS } from "@/lib/attendance/rules";

function parts(ms: number): { h12: number; mm: string; ampm: "am" | "pm" } {
  const p = new Date(ms + PKT_OFFSET_MS);
  const h = p.getUTCHours();
  return {
    h12: h % 12 === 0 ? 12 : h % 12,
    mm: String(p.getUTCMinutes()).padStart(2, "0"),
    ampm: h < 12 ? "am" : "pm",
  };
}

/** Open and close clock times in PKT, e.g. `7:15` and `7:45 pm`. */
export function clockWindowPkt(
  startsAtIso: string,
  openMinutes: number,
  closeMinutes: number,
): { open: string; close: string } {
  const start = new Date(startsAtIso).getTime();
  const o = parts(start - openMinutes * 60000);
  const c = parts(start + closeMinutes * 60000);
  const open = `${o.h12}:${o.mm}` + (o.ampm === c.ampm ? "" : ` ${o.ampm}`);
  return { open, close: `${c.h12}:${c.mm} ${c.ampm}` };
}

export function attendanceMessage(i: {
  batchTitle: string;
  link: string;
  startsAtIso: string;
  openMinutes?: number;
  closeMinutes?: number;
}): string {
  const { open, close } = clockWindowPkt(
    i.startsAtIso,
    i.openMinutes ?? CHECKIN_OPEN_MINUTES,
    i.closeMinutes ?? CHECKIN_CLOSE_MINUTES,
  );
  return [
    `📊 ${i.batchTitle} | _Attendance Portal_`,
    "",
    "Dear Members, this is the official link for attendance",
    i.link,
    "",
    "*Important Note*",
    `Attendance Open at ${open} and Closes at ${close} PKT.`,
  ].join("\n");
}

export function feedbackMessage(i: { batchTitle: string; link: string; classNumber: number }): string {
  return [
    "Please take a moment to complete the feedback form and share your experience, suggestions, and areas for improvement.",
    "",
    `🔗 Day ${i.classNumber} Feedback Form:`,
    i.link,
    "",
    "Your responses will help us make the upcoming sessions even better.",
    "",
    `Thank you for being part of ${i.batchTitle}!`,
    "",
    "Regards,",
    "Team Pharmacozyme",
    "PZ Academy",
  ].join("\n");
}

const MEDALS: Record<number, [string, string]> = {
  1: ["🥇", "1st"],
  2: ["🥈", "2nd"],
  3: ["🥉", "3rd"],
};

export function podiumMessage(i: {
  batchTitle: string;
  boardLabel: string;
  entries: { rank: number; name: string; score: number }[];
  progressLink: string;
}): string {
  const lines: string[] = [
    `A huge congratulations to our top three performers on the ${i.boardLabel} Leaderboard of ${i.batchTitle}.`,
    "",
  ];
  for (const e of i.entries) {
    const m = MEDALS[e.rank];
    if (!m) continue;
    lines.push(`${m[0]} ${m[1]} Position – ${e.name}`, `⭐ ${e.score.toLocaleString("en-US")} Points`, "");
  }
  lines.push(
    `Check your rank: ${i.progressLink}`,
    "",
    "👏 Congratulations to all three achievers for their outstanding performance!",
    "",
    `Your dedication and active participation continue to make ${i.batchTitle} a success.`,
    "",
    "Keep learning, keep competing, and keep excelling! 🚀",
    "",
    "PZ Academy",
    "Educating with Innovation 💚",
  );
  return lines.join("\n");
}
