import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
const data = vi.hoisted(() => ({ getTermsOrEmpty: vi.fn() }));
vi.mock("@/lib/data/site-terms", () => ({ getTermsOrEmpty: data.getTermsOrEmpty }));

import TermsPage, { metadata } from "@/app/affiliate-apply/terms/page";
import RulesPage from "@/app/affiliate-apply/rules/page";
import PrivacyPage from "@/app/affiliate-apply/privacy/page";

const html = async (P: () => Promise<React.ReactElement>) => renderToStaticMarkup(await P());

beforeEach(() => data.getTermsOrEmpty.mockReset());

describe("affiliate policy pages", () => {
  it.each([
    ["terms", TermsPage, "affiliate_terms", "Affiliate Terms"],
    ["rules", RulesPage, "affiliate_rules", "Affiliate Rules"],
    ["privacy", PrivacyPage, "affiliate_privacy", "Privacy Policy"],
  ])("%s page reads its own key, shows paragraphs and a back link", async (_n, Page, key, title) => {
    data.getTermsOrEmpty.mockResolvedValue({ body: "1. Money\n\nFake paragraph.", updatedAt: "x" });
    const o = await html(Page as never);
    expect(data.getTermsOrEmpty).toHaveBeenCalledWith(key);
    expect(o).toContain(title);
    expect(o).toMatch(/<h2[^>]*>1\. Money<\/h2>/);
    expect(o).toContain("Fake paragraph.");
    expect(o).toContain('href="/affiliate-apply"');
  });
  it("escapes <script>", async () => {
    data.getTermsOrEmpty.mockResolvedValue({ body: "x <script>alert(1)</script>", updatedAt: "x" });
    const o = await html(TermsPage as never);
    expect(o).toContain("&lt;script&gt;");
    expect(o).not.toContain("<script>");
  });
  it("an empty document says it is not published yet", async () => {
    data.getTermsOrEmpty.mockResolvedValue({ body: "  ", updatedAt: null });
    expect(await html(RulesPage as never)).toContain("This page is not published yet");
  });
  it("is noindex", () => {
    expect(metadata.robots).toMatchObject({ index: false });
  });
});
