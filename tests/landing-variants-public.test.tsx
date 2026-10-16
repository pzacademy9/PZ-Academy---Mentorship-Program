// tests/landing-variants-public.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
const notFound = vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); });
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
const getPublishedVariantPage = vi.fn();
vi.mock("@/lib/data/landing-variants", () => ({ getPublishedVariantPage: (...a: unknown[]) => getPublishedVariantPage(...a) }));
vi.mock("@/components/landing/registration/RegistrationHost", () => ({
  RegistrationHost: ({ slug, variant }: { slug: string; variant?: string }) => <div data-testid="host" data-slug={slug} data-variant={variant ?? ""} />,
}));

import VariantPage, { generateMetadata, revalidate, dynamicParams, generateStaticParams } from "@/app/e/[slug]/[...variant]/page";
import { emptyContent, newSection } from "@/lib/landing/content";
import { resolveVariant } from "@/lib/landing/resolve-variant";
import { PPC_CONFIG } from "./helpers/landing-fixtures";
import { parseVariantPath } from "@/lib/landing/variants";

function main() {
  const c = emptyContent("course");
  return {
    ...c,
    sections: [
      { ...newSection("hero", "hero1"), data: { headline: "Main headline" } },
      {
        ...newSection("curriculum", "cur1"),
        data: {
          heading: "What you will learn",
          items: [
            { title: "Module One Topic", subtitle: "", points: "", module: "module-1" },
            { title: "Module Two Topic", subtitle: "", points: "", module: "module-2" },
            { title: "Shared Topic", subtitle: "", points: "", module: "" },
          ],
        },
      },
    ],
    registration: PPC_CONFIG,
    modules: [
      { key: "module-1", title: "One", format: "2-Day Workshop", days: 2, optionKey: "m1" },
      { key: "module-2", title: "Two", format: "2-Day Workshop", days: 2, optionKey: "m2" },
    ],
  };
}
function resolved(segments: string[]) {
  const mc = main();
  const ref = parseVariantPath(segments, mc)!;
  const content = resolveVariant(mc, ref, { sections: { hero1: { fields: { headline: "UAE Module 2 headline" } } }, seo: { title: "UAE Two" } });
  return {
    page: { id: "p1", slug: "ppc-b4", kind: "course", title: "PPC Batch 4", status: "published" as const },
    content, ref, status: "published" as const,
  };
}
const params = (variant: string[]) => ({ params: Promise.resolve({ slug: "ppc-b4", variant }) });

beforeEach(() => { getPublishedVariantPage.mockReset(); notFound.mockClear(); });

describe("public variant page", () => {
  it("renders the resolved headline and only that module's curriculum, and passes the variant path to the host", async () => {
    getPublishedVariantPage.mockResolvedValue(resolved(["uae", "module-2"]));
    render(await VariantPage(params(["uae", "module-2"])));
    expect(getPublishedVariantPage).toHaveBeenCalledWith("ppc-b4", ["uae", "module-2"]);
    expect(screen.getAllByText("UAE Module 2 headline").length).toBeGreaterThan(0);
    expect(screen.getByText("Module Two Topic")).toBeTruthy();
    expect(screen.getByText("Shared Topic")).toBeTruthy();
    expect(screen.queryByText("Module One Topic")).toBeNull();
    expect(screen.getByTestId("host").getAttribute("data-variant")).toBe("uae/module-2");
  });
  it("an unknown variant is notFound()", async () => {
    getPublishedVariantPage.mockResolvedValue(null);
    await expect(VariantPage(params(["nope"]))).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("metadata uses the resolved SEO title; unknown is 'Page not found'", async () => {
    getPublishedVariantPage.mockResolvedValue(resolved(["uae", "module-2"]));
    expect((await generateMetadata(params(["uae", "module-2"]))).title).toBe("UAE Two");
    getPublishedVariantPage.mockResolvedValue(null);
    expect((await generateMetadata(params(["nope"]))).title).toBe("Page not found");
  });
  it("keeps the static ISR settings", async () => {
    expect(revalidate).toBe(3600);
    expect(dynamicParams).toBe(true);
    expect(await generateStaticParams()).toEqual([]);
  });
});

describe("file layout", () => {
  it("the static status segment still exists next to the catch-all, so it wins", () => {
    expect(existsSync("src/app/e/[slug]/status/page.tsx")).toBe(true);
    expect(existsSync("src/app/e/[slug]/[...variant]/page.tsx")).toBe(true);
    // A [...variant] catch-all must never swallow a sibling static route.
    expect(readFileSync("src/app/e/[slug]/status/page.tsx", "utf8").length).toBeGreaterThan(0);
  });
});
