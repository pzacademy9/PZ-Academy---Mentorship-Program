import { describe, it, expect } from "vitest";
import { pickPromo } from "@/lib/marketing/promo";

const banner = (n: string, link = `/courses/b${n}`) => ({
  id: n, slot: "mid_page" as const, imageUrl: null, headline: `Banner ${n}`, ctaText: "Open", ctaLink: link,
});
const batch = (n: string) => ({
  courseId: `c${n}`, slug: `s${n}`, title: `Fake Batch ${n}`, startsOn: "12 Nov", href: `/e/s${n}`,
});

describe("pickPromo", () => {
  it("prefers the admin banner over an open batch", () => {
    const p = pickPromo({ banners: [banner("1")], batches: [batch("1")] });
    expect(p).toMatchObject({ headline: "Banner 1", ctaText: "Open", href: "/courses/b1" });
  });

  it("falls back to the first open batch when no banner is set", () => {
    const p = pickPromo({ banners: [], batches: [batch("1"), batch("2")] });
    expect(p).toMatchObject({ headline: "Fake Batch 1", detail: "New batch starts 12 Nov", href: "/e/s1" });
  });

  it("returns null when there is nothing to show", () => {
    expect(pickPromo({ banners: [], batches: [] })).toBeNull();
  });

  it("never promotes the page the visitor is already on", () => {
    const p = pickPromo({ banners: [banner("1", "/courses/here")], batches: [batch("1")], exclude: ["/courses/here", "/e/s1"] });
    expect(p).toBeNull();
  });

  it("skips a banner with no link or headline", () => {
    const p = pickPromo({ banners: [{ ...banner("1"), ctaLink: "" }, { ...banner("2"), headline: " " }], batches: [] });
    expect(p).toBeNull();
  });

  it("gives a batch without a start date no date line", () => {
    const p = pickPromo({ banners: [], batches: [{ ...batch("1"), startsOn: "" }] });
    expect(p?.detail).toBe("New batch open");
  });
});
