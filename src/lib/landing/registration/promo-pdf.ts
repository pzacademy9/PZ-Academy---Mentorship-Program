// Promo code PDFs: pure row builders plus a small jsPDF renderer (Helvetica, A4, mm), styled like batch-pdf.
import { jsPDF } from "jspdf";
import type { PromoCode } from "./promo";
import { describeDiscount, promoState, whereText, type PromoPageOption } from "./promo-form";

export interface PublicCodeRow { code: string; discount: string; where: string; until: string }
export interface PersonCodeRow { name: string; code: string; discount: string; status: string }
/** `fit: "code"` columns never cut or wrap a value: the font shrinks until it fits. */
export interface PromoPdfColumn { label: string; x: number; fit?: "code" }
export interface PromoPdfSpec {
  title: string;
  madeOn: Date;
  columns: PromoPdfColumn[];
  rows: string[][];
}

const MARGIN = 20;
const ROW_HEIGHT = 7;
const PAGE_BOTTOM = 280;
/** Right-hand limit of the table; also the end of the last column. */
export const TABLE_RIGHT = 194;
const COLUMN_GAP = 4;
const LINE_HEIGHT = 4.6;
const BODY_FONT = 11;
const CODE_MIN_FONT = 5;
const RIGHT_EDGE = 190;
const TZ = "Asia/Karachi";

function pktDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
}

function pktIsoDay(d: Date): string {
  return new Date(d.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function hasDiscount(p: PromoCode): boolean {
  if (p.type === "percent") return p.value > 0;
  return Object.values(p.fixedAmounts).some((n) => typeof n === "number" && n > 0);
}

export function publicCodeRows(codes: PromoCode[], pages: PromoPageOption[], now: Date): PublicCodeRow[] {
  return codes
    .filter((p) => (!p.isOwnerCode || (!p.ownerAgentId && !p.ownerAffiliateId)) && promoState(p, now) === "active" && hasDiscount(p))
    .map((p) => {
      const where = whereText(p, pages);
      return {
        code: p.code,
        discount: describeDiscount(p),
        where: where.startsWith("All pages") ? `All courses${where.slice("All pages".length)}` : where,
        until: p.endsAt ? `Until ${pktDate(new Date(p.endsAt))}` : "",
      };
    });
}

export function personCodeRows(
  kind: "agent" | "affiliate",
  codes: PromoCode[],
  people: { id: string; name: string }[],
  mode: "share" | "me",
  now: Date = new Date(),
): PersonCodeRow[] {
  const rows: PersonCodeRow[] = [];
  for (const p of codes) {
    if (!p.isOwnerCode) continue;
    const ownerId = kind === "agent" ? p.ownerAgentId : (p.ownerAffiliateId ?? null);
    const person = ownerId ? people.find((x) => x.id === ownerId) : undefined;
    if (!person) continue;
    if (mode === "share") {
      if (promoState(p, now) !== "active") continue;
      rows.push({ name: person.name, code: p.code, discount: "", status: "" });
    } else {
      rows.push({ name: person.name, code: p.code, discount: `${p.plainPercent ?? 10}% off plain`, status: p.active ? "On" : "Off" });
    }
  }
  return rows.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

function header(pdf: jsPDF, columns: PromoPdfColumn[], y: number): number {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  for (const c of columns) pdf.text(c.label, c.x, y);
  pdf.line(MARGIN, y + 2, RIGHT_EDGE, y + 2);
  pdf.setFont("helvetica", "normal");
  return y + ROW_HEIGHT + 1;
}

/** Width available to text in column i (up to the next column, or the table edge). */
export function columnTextWidth(columns: PromoPdfColumn[], i: number): number {
  const next = columns[i + 1]?.x ?? TABLE_RIGHT + COLUMN_GAP;
  return Math.max(next - columns[i].x - COLUMN_GAP, 10);
}

/** Splits a value that must stay whole (a code) by characters; only used when even the smallest font cannot fit it. */
function hardWrap(pdf: jsPDF, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const ch of text) {
    if (line && pdf.getTextWidth(line + ch) > width) { lines.push(line); line = ch; } else line += ch;
  }
  if (line) lines.push(line);
  return lines;
}

/** The lines and font size a cell is drawn with. Expects helvetica normal to be set. */
export function layoutCell(pdf: jsPDF, text: string, width: number, fit?: "code"): { lines: string[]; fontSize: number } {
  if (fit !== "code") {
    pdf.setFontSize(BODY_FONT);
    return { lines: text === "" ? [""] : (pdf.splitTextToSize(text, width) as string[]), fontSize: BODY_FONT };
  }
  let size = BODY_FONT;
  pdf.setFontSize(size);
  while (pdf.getTextWidth(text) > width && size > CODE_MIN_FONT) { size -= 0.5; pdf.setFontSize(size); }
  if (pdf.getTextWidth(text) <= width) return { lines: [text], fontSize: size };
  return { lines: hardWrap(pdf, text, width), fontSize: size };
}

/** Builds the document itself; exported so tests can count its pages. */
export function renderPromoPdf(spec: PromoPdfSpec): jsPDF {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(spec.title, MARGIN, MARGIN);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(`Made on ${pktDate(spec.madeOn)}`, MARGIN, MARGIN + 6);
  let y = header(pdf, spec.columns, MARGIN + 16);
  for (const row of spec.rows) {
    const cells = spec.columns.map((c, i) => layoutCell(pdf, row[i] ?? "", columnTextWidth(spec.columns, i), c.fit));
    const tallest = Math.max(...cells.map((c) => c.lines.length));
    if (y + (tallest - 1) * LINE_HEIGHT > PAGE_BOTTOM) {
      pdf.addPage();
      y = header(pdf, spec.columns, MARGIN);
    }
    cells.forEach((cell, i) => {
      pdf.setFontSize(cell.fontSize);
      cell.lines.forEach((line, n) => pdf.text(line, spec.columns[i].x, y + n * LINE_HEIGHT));
    });
    y += tallest === 1 ? ROW_HEIGHT : (tallest - 1) * LINE_HEIGHT + ROW_HEIGHT;
  }
  return pdf;
}

export function publicPdfSpec(rows: PublicCodeRow[], madeOn: Date = new Date()): PromoPdfSpec {
  return {
    title: "PZ Academy promo codes",
    madeOn,
    columns: [{ label: "Code", x: MARGIN, fit: "code" }, { label: "Discount", x: 76 }, { label: "Works on", x: 112 }, { label: "Valid until", x: 152 }],
    rows: rows.map((r) => [r.code, r.discount, r.where, r.until]),
  };
}

export function personPdfSpec(kind: "agent" | "affiliate", rows: PersonCodeRow[], mode: "share" | "me", madeOn: Date = new Date()): PromoPdfSpec {
  const columns: PromoPdfColumn[] = mode === "share"
    ? [{ label: "Name", x: MARGIN }, { label: "Code", x: 100, fit: "code" }]
    : [{ label: "Name", x: MARGIN }, { label: "Code", x: 70, fit: "code" }, { label: "Discount", x: 125 }, { label: "Status", x: 170 }];
  return {
    title: kind === "agent" ? "PZ Academy sales agent codes" : "PZ Academy affiliate codes",
    madeOn,
    columns,
    rows: rows.map((r) => (mode === "share" ? [r.name, r.code] : [r.name, r.code, r.discount, r.status])),
  };
}

export function promoPdfFileName(kind: "public" | "agent" | "affiliate", madeOn: Date): string {
  const stem = kind === "public" ? "promo" : kind;
  return `pz-${stem}-codes-${pktIsoDay(madeOn)}.pdf`;
}
