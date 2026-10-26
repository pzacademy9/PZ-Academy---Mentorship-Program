import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { AdminCertificates, type AdminCertificatesProps } from "@/components/admin/certs/AdminCertificates";
import type { CertRecord } from "@/lib/certs/cert-model";

const cert = (over: Partial<CertRecord> = {}): CertRecord => ({
  id: "d1", certId: "PZ-2026-AAAA1111", name: "Ayesha Khan", email: "ayesha@x.com",
  category: "General", subCategory: "Courses", topic: "Clinical Research", batchId: "b1",
  batchName: "CR Batch 1", batchCreatedAt: "2026-08-08T00:00:00.000Z", issueDate: "2026-10-01", status: "sent",
  viewUrl: "https://cert.pharmacozyme.com/verify?certId=PZ-2026-AAAA1111", ...over,
});

const base = (over: Partial<AdminCertificatesProps> = {}): AdminCertificatesProps => ({
  rows: [cert()], total: 40, page: 1, pageCount: 2, pageSize: 25,
  counts: {
    byCategory: { General: 30, Official: 10 },
    bySubCategory: { Courses: 20, Workshops: 10 },
  },
  tab: "general", group: "Courses", batch: "b1", q: "aye",
  batches: [
    { id: "b1", name: "CR Batch 1", topic: "Clinical Research", subCategory: "Courses", createdAt: "2026-08-08T00:00:00.000Z", count: 12 },
    { id: "b0", name: "Old Batch", topic: "Pharmacology", subCategory: "Courses", createdAt: "2025-01-02T00:00:00.000Z", count: 1 },
  ],
  unavailable: false, ...over,
});

const hrefOf = (name: RegExp | string) => screen.getByRole("link", { name }).getAttribute("href")!;
const params = (href: string) => new URL(href, "http://x").searchParams;

describe("AdminCertificates", () => {
  it("opens the Certificates app in a new tab", () => {
    render(<AdminCertificates {...base()} />);
    const a = screen.getByRole("link", { name: /Open Certificates app/ });
    expect(a.getAttribute("href")).toBe("https://cert.pharmacozyme.com");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(screen.getByText("Certificates are made in the Certificates app. This page shows them here.")).toBeTruthy();
  });

  it("tab links switch tab and reset the other filters and page", () => {
    render(<AdminCertificates {...base({ page: 2 })} />);
    const p = params(hrefOf(/^Official/));
    expect(p.get("tab")).toBe("official");
    expect(p.get("page")).toBeNull();
    expect(p.get("group")).toBeNull();
    expect(p.get("batch")).toBeNull();
  });

  it("shows all sub-category chips with counts for each tab", () => {
    const { unmount } = render(<AdminCertificates {...base()} />);
    const chips = within(screen.getByTestId("group-chips"));
    for (const g of ["Courses", "Workshops", "Webinars", "MED-Q"]) expect(chips.getByRole("link", { name: new RegExp(`^${g}`) })).toBeTruthy();
    expect(chips.getByRole("link", { name: /^Courses/ }).textContent).toContain("20");
    expect(chips.getByRole("link", { name: /^Webinars/ }).textContent).toContain("0");
    unmount();
    render(<AdminCertificates {...base({ tab: "official", group: undefined, batch: undefined, q: undefined })} />);
    const off = within(screen.getByTestId("group-chips"));
    for (const g of ["Central Team", "Sub Team", "Ambassadors", "Affiliates", "Mentors"]) expect(off.getByRole("link", { name: new RegExp(`^${g}`) })).toBeTruthy();
  });

  it("group chips keep other params and reset page", () => {
    render(<AdminCertificates {...base({ page: 2 })} />);
    const p = params(hrefOf(/^Workshops/));
    expect(p.get("group")).toBe("Workshops");
    expect(p.get("q")).toBe("aye");
    expect(p.get("tab")).toBe("general");
    expect(p.get("page")).toBeNull();
    expect(p.get("batch")).toBeNull();
  });

  it("has no status chips row", () => {
    render(<AdminCertificates {...base()} />);
    expect(screen.queryByTestId("status-chips")).toBeNull();
  });

  it("database cards show name, sub-category and topic, count and date in the given order", () => {
    render(<AdminCertificates {...base()} />);
    const cards = within(screen.getByTestId("batch-cards"));
    const card = cards.getByRole("link", { name: /CR Batch 1/ });
    expect(params(card.getAttribute("href")!).get("batch")).toBe("b1");
    expect(within(card).getByText("Courses • Clinical Research")).toBeTruthy();
    expect(within(card).getByText("12 certificates")).toBeTruthy();
    expect(within(card).getByText("8 Aug 2026")).toBeTruthy();
    expect(within(cards.getByRole("link", { name: /Old Batch/ })).getByText("1 certificate")).toBeTruthy();
    const names = cards.getAllByRole("link").map((a) => a.textContent ?? "");
    expect(names.findIndex((t) => t.includes("CR Batch 1"))).toBeLessThan(names.findIndex((t) => t.includes("Old Batch")));
    const all = cards.getByRole("link", { name: /All batches/ });
    expect(params(all.getAttribute("href")!).get("batch")).toBeNull();
    expect(params(all.getAttribute("href")!).get("group")).toBe("Courses");
  });

  it("shows only the cards (no table, no paging) when no batch is picked and no search", () => {
    render(<AdminCertificates {...base({ batch: undefined, q: undefined })} />);
    expect(screen.getByRole("link", { name: /CR Batch 1/ })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText(/Showing/)).toBeNull();
  });

  it("shows the table when only a search is active", () => {
    render(<AdminCertificates {...base({ batch: undefined })} />);
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("search form is GET with other params as hidden inputs, without page or q", () => {
    const { container } = render(<AdminCertificates {...base({ page: 2 })} />);
    const form = container.querySelector("form")!;
    expect(form.getAttribute("method")?.toLowerCase()).toBe("get");
    const input = screen.getByPlaceholderText("Search by name, email or certificate number") as HTMLInputElement;
    expect(input.name).toBe("q");
    expect(input.defaultValue).toBe("aye");
    const hidden = Array.from(form.querySelectorAll("input[type=hidden]")).map((i) => [(i as HTMLInputElement).name, (i as HTMLInputElement).value]);
    expect(Object.fromEntries(hidden)).toEqual({ tab: "general", group: "Courses", batch: "b1" });
  });

  it("table shows only the four columns, no status chip for normal rows, and the View certificate href", () => {
    render(<AdminCertificates {...base()} />);
    const t = within(screen.getByRole("table"));
    for (const h of ["Name", "Email", "Certificate number", "Issue date"]) expect(t.getByText(h)).toBeTruthy();
    for (const h of ["Group", "Batch", "Topic", "Status"]) expect(t.queryByText(h)).toBeNull();
    for (const v of ["Ayesha Khan", "ayesha@x.com", "PZ-2026-AAAA1111", "2026-10-01"]) {
      expect(t.getAllByText(v).length).toBeGreaterThan(0);
    }
    expect(t.queryByText("Sent")).toBeNull();
    const view = t.getByRole("link", { name: "View certificate" });
    expect(view.getAttribute("href")).toBe("https://cert.pharmacozyme.com/verify?certId=PZ-2026-AAAA1111");
    expect(view.getAttribute("target")).toBe("_blank");
  });

  it("shows a chip only for pending and revoked rows", () => {
    render(
      <AdminCertificates
        {...base({
          rows: [
            cert({ id: "1", status: "generated" }),
            cert({ id: "2", status: "pending" }),
            cert({ id: "3", status: "revoked" }),
          ],
        })}
      />,
    );
    const t = within(screen.getByRole("table"));
    expect(t.getByText("Pending")).toBeTruthy();
    expect(t.getByText("Revoked")).toBeTruthy();
    expect(t.queryByText("Generated")).toBeNull();
  });

  it("shows paging text and Previous/Next links", () => {
    render(<AdminCertificates {...base()} />);
    expect(screen.getByText("Showing 1 to 25 of 40")).toBeTruthy();
    expect(params(hrefOf("Next")).get("page")).toBe("2");
    expect(screen.queryByRole("link", { name: "Previous" })).toBeNull();
  });

  it("shows the empty state", () => {
    render(<AdminCertificates {...base({ rows: [], total: 0, pageCount: 1 })} />);
    expect(screen.getByText("No certificates found.")).toBeTruthy();
  });

  it("shows the unavailable state with a Try again link", () => {
    render(<AdminCertificates {...base({ unavailable: true })} />);
    expect(screen.getByText("We could not reach the Certificates app. Try again in a minute.")).toBeTruthy();
    const retry = screen.getByRole("link", { name: "Try again" });
    expect(params(retry.getAttribute("href")!).get("tab")).toBe("general");
    expect(params(retry.getAttribute("href")!).get("q")).toBe("aye");
  });
});
