import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
const nav = vi.hoisted(() => ({ notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }) }));
vi.mock("next/navigation", () => ({ notFound: nav.notFound }));
const data = vi.hoisted(() => ({ page: vi.fn(), general: vi.fn() }));
vi.mock("@/lib/data/landing-pages", () => ({ getPublishedLandingPage: data.page }));
vi.mock("@/lib/data/site-terms", () => ({ getGeneralTermsOrEmpty: data.general }));

import { TermsDocument } from "@/components/landing/TermsDocument";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { ConsentField } from "@/components/landing/registration/Field";
import { TermsLinkProvider } from "@/components/landing/registration/terms-link";
import { LandingRenderer } from "@/components/landing/LandingRenderer";
import TermsPage from "@/app/e/[slug]/terms/page";
import LandingPublicPage from "@/app/e/[slug]/page";
import { emptyContent, normalizeContent } from "@/lib/landing/content";

const html = (node: React.ReactNode) => renderToStaticMarkup(<>{node}</>);

describe("TermsDocument", () => {
  it("shows numbered titles as headings and keeps paragraphs", () => {
    const o = html(<TermsDocument title="Fake Course" text={"1. Payment rules\n\nFees are fake.\n\n2. Access\n\nZoom is fake."} />);
    expect(o).toContain("Fake Course");
    expect(o).toMatch(/<h2[^>]*>1\. Payment rules<\/h2>/);
    expect(o).toMatch(/<p[^>]*>Fees are fake\.<\/p>/);
  });

  it("shows <script> and & as plain text, never as markup", () => {
    const o = html(<TermsDocument title="T" text={"Rule <script>alert(1)</script> & more"} />);
    expect(o).toContain("&lt;script&gt;");
    expect(o).not.toContain("<script");
  });

  it("a very long unbroken word wraps and line breaks inside a paragraph are kept", () => {
    const o = html(<TermsDocument title="T" text={`${"W".repeat(300)}\nsecond line`} />);
    expect(o).toContain("break-words");
    expect(o).toContain("whitespace-pre-line");
  });
});

describe("footer and registration links", () => {
  const footer = (termsHref?: string) => html(<LandingFooter title="Fake" items={[]} whatsapp="" termsHref={termsHref} />);
  it("the footer shows the Terms link only when termsHref is given", () => {
    expect(footer()).not.toContain("Terms and Conditions");
    const o = footer("/e/demo/terms");
    expect(o).toContain("Terms and Conditions");
    expect(o).toContain('href="/e/demo/terms"');
  });

  it("the checkbox sentence is exactly today's without a Terms link", () => {
    render(<ConsentField checked={false} onChange={() => {}} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(document.body.textContent).toContain("I have read the registration details, payment terms and schedule. I agree that PharmaCozyme Academy may keep in touch with me");
  });

  it("with a Terms link the checkbox has a Terms and Conditions link that opens in a new tab", () => {
    render(<TermsLinkProvider href="/e/demo/terms"><ConsentField checked={false} onChange={() => {}} /></TermsLinkProvider>);
    const link = screen.getByRole("link", { name: "Terms and Conditions" });
    expect(link.getAttribute("href")).toBe("/e/demo/terms");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});

describe("the public Terms page", () => {
  const found = (terms: string) => {
    const c = emptyContent("course");
    return { page: { slug: "demo", title: "Fake Course", status: "published", kind: "course" }, content: normalizeContent({ ...c, settings: { ...c.settings, terms } }) };
  };
  const call = async () => TermsPage({ params: Promise.resolve({ slug: "demo" }) });
  beforeEach(() => { data.page.mockReset(); data.general.mockReset(); nav.notFound.mockClear(); });

  it("is a 404 for an unknown page", async () => {
    data.page.mockResolvedValue(null);
    data.general.mockResolvedValue("General");
    await expect(call()).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("is a 404 with no page text and no general text", async () => {
    data.page.mockResolvedValue(found(""));
    data.general.mockResolvedValue("");
    await expect(call()).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("shows the page text when only that exists", async () => {
    data.page.mockResolvedValue(found("Page rule"));
    data.general.mockResolvedValue("");
    expect(html(await call())).toContain("Page rule");
  });
  it("shows the general text when only that exists", async () => {
    data.page.mockResolvedValue(found(""));
    data.general.mockResolvedValue("General rule");
    expect(html(await call())).toContain("General rule");
  });
  it("the page text wins when both exist", async () => {
    data.page.mockResolvedValue(found("Page rule"));
    data.general.mockResolvedValue("General rule");
    const o = html(await call());
    expect(o).toContain("Page rule");
    expect(o).not.toContain("General rule");
  });
});

describe("the public landing page and the general Terms", () => {
  it("still renders when the general Terms cannot be read, and shows no Terms link", async () => {
    const c = emptyContent("course");
    data.page.mockResolvedValue({ page: { slug: "demo", title: "Fake", status: "published", kind: "course" }, content: c });
    data.general.mockResolvedValue("");
    const o = html(await LandingPublicPage({ params: Promise.resolve({ slug: "demo" }) }));
    expect(o).not.toContain("Terms and Conditions");
  });
  it("shows the Terms link on the landing page when only the general text exists", async () => {
    const c = emptyContent("course");
    data.page.mockResolvedValue({ page: { slug: "demo", title: "Fake", status: "published", kind: "course" }, content: c });
    data.general.mockResolvedValue("General rule");
    expect(html(await LandingPublicPage({ params: Promise.resolve({ slug: "demo" }) }))).toContain("/e/demo/terms");
  });
});

describe("the landing page", () => {
  it("shows a Terms link when given one and none when not", () => {
    const c = emptyContent("course");
    const withLink = html(<LandingRenderer content={c} status="published" kind="course" pageTitle="Fake" slug="demo" termsHref="/e/demo/terms" />);
    expect(withLink).toContain("/e/demo/terms");
    const without = html(<LandingRenderer content={c} status="published" kind="course" pageTitle="Fake" slug="demo" />);
    expect(without).not.toContain("Terms and Conditions");
  });
});
