import { jsPDF } from "jspdf";

export interface BatchPdfRow {
  name: string;
  pzId: string;
}

const MARGIN = 20;
const ROW_HEIGHT = 7;
const ID_X = 120;
const PAGE_BOTTOM = 280;

function header(pdf: jsPDF, y: number): number {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("Name", MARGIN, y);
  pdf.text("ID", ID_X, y);
  pdf.line(MARGIN, y + 2, 190, y + 2);
  pdf.setFont("helvetica", "normal");
  return y + ROW_HEIGHT + 1;
}

/** Builds the document itself; exported so tests can count its pages. */
export function renderBatchPdf(title: string, rows: BatchPdfRow[]): jsPDF {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(title, MARGIN, MARGIN);
  let y = header(pdf, MARGIN + 12);
  pdf.setFontSize(11);
  for (const r of rows) {
    if (y > PAGE_BOTTOM) {
      pdf.addPage();
      y = header(pdf, MARGIN);
    }
    pdf.text(pdf.splitTextToSize(r.name, ID_X - MARGIN - 4)[0] ?? "", MARGIN, y);
    pdf.text(r.pzId, ID_X, y);
    y += ROW_HEIGHT;
  }
  return pdf;
}

/** A4 PDF with the batch title and a Name / ID table. Contains no emails. */
export function buildBatchPdf(title: string, rows: BatchPdfRow[]): Blob {
  return renderBatchPdf(title, rows).output("blob");
}
