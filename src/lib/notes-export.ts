"use client";

/** Renders a DOM node to a PNG and drops it into a downloadable single-page PDF. */
export async function exportNotePdf(contentEl: HTMLElement, filenameBase: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const canvas = await html2canvas(contentEl, { scale: 2, backgroundColor: "#ffffff" });
  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF({
    orientation: canvas.width > canvas.height ? "landscape" : "portrait",
    unit: "px",
    format: [canvas.width, canvas.height],
    hotfixes: ["px_scaling"],
  });
  pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
  pdf.save(`${filenameBase}.pdf`);
}

/**
 * Converts note HTML to a downloadable .doc file (HTML-based Word format —
 * opens with full formatting in Word/Google Docs, not true OOXML .docx).
 */
export async function exportNoteDoc(html: string, filenameBase: string): Promise<void> {
  const { default: htmlDocx } = await import("html-docx-js/dist/html-docx");
  const blob = htmlDocx.asBlob(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`);

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filenameBase}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
