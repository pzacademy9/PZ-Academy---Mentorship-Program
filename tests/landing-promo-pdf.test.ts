import { describe, expect, it } from "vitest";
import type { PromoCode } from "@/lib/landing/registration/promo";
import type { PromoPageOption } from "@/lib/landing/registration/promo-form";
import {
  columnTextWidth, layoutCell, personCodeRows, personPdfSpec, promoPdfFileName, publicCodeRows, publicPdfSpec, renderPromoPdf,
} from "@/lib/landing/registration/promo-pdf";

const NOW = new Date("2026-11-17T08:00:00Z");
const pages: PromoPageOption[] = [{ id: "p1", title: "PPC Batch 3", options: [] }];

function code(over: Partial<PromoCode>): PromoCode {
  return {
    id: "x", code: "X", type: "percent", value: 10, fixedAmounts: {}, maxDiscountPercent: 0, pageIds: [], optionKeys: [],
    maxUses: null, usedCount: 0, oneperEmail: false, startsAt: null, endsAt: null, active: true, ownerAgentId: null,
    ownerAffiliateId: null, isOwnerCode: false, ...over,
  };
}

describe("publicCodeRows", () => {
  it("skips a code that gives no discount", () => {
    const rows = publicCodeRows([code({ code: "ZERO", isOwnerCode: true, type: "percent", value: 0 }), code({ code: "NOAMT", type: "fixed", fixedAmounts: {} })], pages, NOW);
    expect(rows).toEqual([]);
  });
  it("keeps only active, non-owner codes", () => {
    const rows = publicCodeRows([
      code({ code: "OK" }),
      code({ code: "OWNER", isOwnerCode: true, ownerAgentId: "a1" }),
      code({ code: "AFF", isOwnerCode: true, ownerAffiliateId: "f1" }),
      code({ code: "PAUSED", active: false }),
      code({ code: "OLD", endsAt: "2026-11-01T00:00:00Z" }),
      code({ code: "USED", maxUses: 2, usedCount: 2 }),
    ], pages, NOW);
    expect(rows.map((r) => r.code)).toEqual(["OK"]);
  });
  it("includes an owner code whose owner is gone", () => {
    const rows = publicCodeRows([code({ code: "GONE", isOwnerCode: true })], pages, NOW);
    expect(rows.map((r) => r.code)).toEqual(["GONE"]);
  });
  it("formats discount, where and until", () => {
    const [a, b] = publicCodeRows([
      code({ code: "FIX", type: "fixed", fixedAmounts: { PKR: 2000 }, endsAt: "2026-11-30T10:00:00Z", pageIds: ["p1"] }),
      code({ code: "ALL" }),
    ], pages, NOW);
    expect(a.discount).toBe("PKR 2,000 off");
    expect(a.where).toBe("PPC Batch 3");
    expect(a.until).toBe("Until 30 Nov 2026");
    expect(b.where).toBe("All courses");
    expect(b.until).toBe("");
  });
  it("uses the Pakistan date near midnight", () => {
    const [r] = publicCodeRows([code({ endsAt: "2026-11-30T20:00:00Z" })], pages, NOW);
    expect(r.until).toBe("Until 1 Dec 2026");
  });
});

describe("personCodeRows", () => {
  const people = [{ id: "a1", name: "bilal" }, { id: "a2", name: "Adnan" }];
  const codes = [
    code({ code: "BIL", isOwnerCode: true, ownerAgentId: "a1", plainPercent: 12 }),
    code({ code: "ADN", isOwnerCode: true, ownerAgentId: "a2", plainPercent: 8, active: false }),
    code({ code: "NOBODY", isOwnerCode: true, ownerAgentId: "zz" }),
    code({ code: "AFF", isOwnerCode: true, ownerAffiliateId: "a1" }),
  ];
  it("share mode drops paused codes and hides details", () => {
    expect(personCodeRows("agent", codes, people, "share")).toEqual([{ name: "bilal", code: "BIL", discount: "", status: "" }]);
  });
  it("me mode keeps all, sorted case-insensitively", () => {
    const rows = personCodeRows("agent", codes, people, "me");
    expect(rows).toEqual([
      { name: "Adnan", code: "ADN", discount: "8% off plain", status: "Off" },
      { name: "bilal", code: "BIL", discount: "12% off plain", status: "On" },
    ]);
  });
  it("affiliate kind matches ownerAffiliateId", () => {
    expect(personCodeRows("affiliate", codes, people, "share").map((r) => r.code)).toEqual(["AFF"]);
  });
});

describe("renderPromoPdf", () => {
  const spec = (rows: string[][]) => ({ title: "T", madeOn: NOW, columns: [{ label: "Name", x: 20 }, { label: "Code", x: 120 }], rows });
  it("adds pages for many rows", () => {
    const rows = Array.from({ length: 100 }, (_, i) => [`Name ${i}`, `C${i}`]);
    expect(renderPromoPdf(spec(rows)).getNumberOfPages()).toBeGreaterThan(1);
  });
  it("does not throw on a very long name", () => {
    expect(() => renderPromoPdf(spec([["a".repeat(300), "C"]]))).not.toThrow();
  });
  it("does not throw on Urdu characters", () => {
    expect(() => renderPromoPdf(spec([["محمد علی", "C"]]))).not.toThrow();
  });
});

describe("specs and file names", () => {
  it("builds titles and columns", () => {
    expect(publicPdfSpec([]).title).toBe("PZ Academy promo codes");
    expect(publicPdfSpec([]).columns.map((c) => c.label)).toEqual(["Code", "Discount", "Works on", "Valid until"]);
    expect(personPdfSpec("agent", [], "share").title).toBe("PZ Academy sales agent codes");
    expect(personPdfSpec("affiliate", [], "share").columns.map((c) => c.label)).toEqual(["Name", "Code"]);
    expect(personPdfSpec("affiliate", [], "me").title).toBe("PZ Academy affiliate codes");
    expect(personPdfSpec("agent", [], "me").columns.map((c) => c.label)).toEqual(["Name", "Code", "Discount", "Status"]);
  });
  it("names files with the date", () => {
    expect(promoPdfFileName("public", NOW)).toBe("pz-promo-codes-2026-11-17.pdf");
    expect(promoPdfFileName("agent", NOW)).toBe("pz-agent-codes-2026-11-17.pdf");
    expect(promoPdfFileName("affiliate", NOW)).toBe("pz-affiliate-codes-2026-11-17.pdf");
  });
});

describe("public column widths", () => {
  it("keeps the full date, even the widest, inside the last column", () => {
    const spec = publicPdfSpec([], NOW);
    const pdf = renderPromoPdf(spec);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const cut = columnTextWidth(spec.columns, spec.columns.length - 1);
    for (const m of months) {
      for (let d = 1; d <= 31; d++) {
        const text = `Until ${d} ${m} 2026`;
        expect(pdf.splitTextToSize(text, cut)[0]).toBe(text);
      }
    }
  });
  it("wraps a long discount and keeps its last currency", () => {
    const spec = publicPdfSpec([], NOW);
    const pdf = renderPromoPdf(spec);
    pdf.setFont("helvetica", "normal");
    const text = "PKR 2,000 / USD 20 / GBP 15 off";
    const { lines } = layoutCell(pdf, text, columnTextWidth(spec.columns, 1));
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe(text);
  });
});

describe("codes are never cut", () => {
  const publicCols = () => publicPdfSpec([], NOW).columns;
  const meCols = () => personPdfSpec("agent", [], "me", NOW).columns;
  const shareCols = () => personPdfSpec("agent", [], "share", NOW).columns;
  const codes = ["MDC-WINTER-SALE", "PHARMACOLOGY-2026", "ABCDEFGHIJKLMNOPQRSTUV-2026-AB", "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_AB"];
  for (const [label, cols, idx] of [["public", publicCols, 0], ["me", meCols, 1], ["share", shareCols, 1]] as const) {
    it("keeps 15 to 40 character codes whole on one line (" + label + ")", () => {
      const columns = cols();
      const pdf = renderPromoPdf({ title: "T", madeOn: NOW, columns, rows: [] });
      pdf.setFont("helvetica", "normal");
      for (const c of codes) {
        const { lines, fontSize } = layoutCell(pdf, c, columnTextWidth(columns, idx), "code");
        expect(lines).toEqual([c]);
        expect(fontSize).toBeGreaterThanOrEqual(5);
      }
    });
  }
  it("never loses characters even for an extreme code", () => {
    const columns = publicCols();
    const pdf = renderPromoPdf({ title: "T", madeOn: NOW, columns, rows: [] });
    pdf.setFont("helvetica", "normal");
    const c = "W".repeat(40);
    expect(layoutCell(pdf, c, columnTextWidth(columns, 0), "code").lines.join("")).toBe(c);
  });
});

describe("row height and pagination", () => {
  it("wrapped rows take more room and still paginate with the header repeated", () => {
    const spec = publicPdfSpec(
      Array.from({ length: 60 }, (_, i) => ({ code: "CODE" + i, discount: "PKR 2,000 / USD 20 / GBP 15 off", where: "A long course name that wraps over several lines in the column", until: "" })),
      NOW,
    );
    const short = publicPdfSpec(Array.from({ length: 60 }, (_, i) => ({ code: "CODE" + i, discount: "10% off", where: "All courses", until: "" })), NOW);
    const tall = renderPromoPdf(spec);
    expect(tall.getNumberOfPages()).toBeGreaterThan(renderPromoPdf(short).getNumberOfPages());
    const out = tall.output();
    expect((out.match(/Valid until/g) ?? []).length).toBe(tall.getNumberOfPages());
  });
});
