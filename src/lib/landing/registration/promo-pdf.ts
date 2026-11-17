// Promo code PDFs: pure row builders plus a small jsPDF renderer (Helvetica, A4, mm), styled like batch-pdf.
import { jsPDF } from "jspdf";
import type { PromoCode } from "./promo";
import { describeDiscount, promoState, whereText, type PromoPageOption } from "./promo-form";

export interface PublicCodeRow { code: string; discount: string; where: string; until: string }
export interface PersonCodeRow { name: string; code: string; discount: string; status: string }
export interface PromoPdfSpec {
  title: string;
  madeOn: Date;
  columns: { label: string; x: number }[];
  rows: string[][];
}

const MARGIN = 20;
const ROW_HEIGHT = 7;
const PAGE_BOTTOM = 280;
const RIGHT_EDGE = 190;
const TZ = "Asia/Karachi";

function pktDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
}

function pktIsoDay(d: Date): string {
  return new Date(d.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function publicCodeRows(codes: PromoCode[], pages: PromoPageOption[], now: Date): PublicCodeRow[] {
  return codes
    .filter((p) => (!p.isOwnerCode || (!p.ownerAgentId && !p.ownerAffiliateId)) && promoState(p, now) === "active")
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

function header(pdf: jsPDF, columns: PromoPdfSpec["columns"], y: number): number {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  for (const c of columns) pdf.text(c.label, c.x, y);
  pdf.line(MARGIN, y + 2, RIGHT_EDGE, y + 2);
  pdf.setFont("helvetica", "normal");
  return y + ROW_HEIGHT + 1;
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
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  for (const row of spec.rows) {
    if (y > PAGE_BOTTOM) {
      pdf.addPage();
      y = header(pdf, spec.columns, MARGIN);
      pdf.setFontSize(11);
    }
    spec.columns.forEach((c, i) => {
      const next = spec.columns[i + 1]?.x ?? RIGHT_EDGE + 4;
      const text = pdf.splitTextToSize(row[i] ?? "", Math.max(next - c.x - 4, 10))[0] ?? "";
      pdf.text(text, c.x, y);
    });
    y += ROW_HEIGHT;
  }
  return pdf;
}

export function publicPdfSpec(rows: PublicCodeRow[], madeOn: Date = new Date()): PromoPdfSpec {
  return {
    title: "PZ Academy promo codes",
    madeOn,
    columns: [{ label: "Code", x: MARGIN }, { label: "Discount", x: 62 }, { label: "Works on", x: 112 }, { label: "Valid until", x: 160 }],
    rows: rows.map((r) => [r.code, r.discount, r.where, r.until]),
  };
}

export function personPdfSpec(kind: "agent" | "affiliate", rows: PersonCodeRow[], mode: "share" | "me", madeOn: Date = new Date()): PromoPdfSpec {
  const columns = mode === "share"
    ? [{ label: "Name", x: MARGIN }, { label: "Code", x: 120 }]
    : [{ label: "Name", x: MARGIN }, { label: "Code", x: 85 }, { label: "Discount", x: 125 }, { label: "Status", x: 170 }];
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
