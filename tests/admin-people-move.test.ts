import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NAV_ITEMS } from "@/components/dashboard/nav";
import { StudentsTabs } from "@/components/admin/students/StudentsTabs";

const read = (p: string) => readFileSync(p, "utf8");

describe("People moved under Students", () => {
  it("nav has Students but no People item", () => {
    const admin = NAV_ITEMS.filter((i) => i.roles.includes("admin"));
    expect(admin.some((i) => i.href === "/dashboard/admin/students")).toBe(true);
    expect(NAV_ITEMS.some((i) => i.href === "/dashboard/admin/people")).toBe(false);
  });

  it("old people page permanently redirects to the new address", () => {
    const src = read("src/app/dashboard/admin/people/page.tsx");
    expect(src).toContain("permanentRedirect");
    expect(src).toContain('"/dashboard/admin/students/ids"');
  });

  it("new Student IDs page exists and keeps the admin guard", () => {
    const p = "src/app/dashboard/admin/students/ids/page.tsx";
    expect(existsSync(p)).toBe(true);
    expect(read(p)).toContain("requireAdminPage");
    expect(read(p)).toContain("Student IDs");
  });

  it("StudentsTabs renders both labels and marks the active one", () => {
    const html = renderToStaticMarkup(createElement(StudentsTabs, { active: "ids" }));
    expect(html).toContain("All students");
    expect(html).toContain("Student IDs");
    expect(html).toContain('href="/dashboard/admin/students/ids"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="page"[^>]*>Student IDs|Student IDs<\/a>/);
    const html2 = renderToStaticMarkup(createElement(StudentsTabs, { active: "all" }));
    expect(html2).toMatch(/href="\/dashboard\/admin\/students"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/dashboard\/admin\/students"/);
  });
});
