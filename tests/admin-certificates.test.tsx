import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { AdminCertificates, type AdminCertificatesProps } from "@/components/admin/certs/AdminCertificates";
import type { CertRecord } from "@/lib/certs/cert-model";

const cert = (over: Partial<CertRecord> = {}): CertRecord => ({
  id: "d1", certId: "PZ-2026-AAAA1111", name: "Ayesha Khan", email: "ayesha@x.com",
  category: "General", subCategory: "Courses", topic: "Clinical Research", batchId: "b1",
  batchName: "CR Batch 1", issueDate: "2026-10-01", status: "sent",
  viewUrl: "https://cert.pharmacozyme.com/verify?certId=PZ-2026-AAAA1111", ...over,
});

const base = (over: Partial<AdminCertificatesProps> = {}): AdminCertificatesProps => ({
  rows: [cert()], total: 40, page: 1, pageCount: 2, pageSize: 25,
  counts: {
    byCategory: { General: 30, Official: 10 },
    bySubCategory: { Courses: 20, Workshops: 10 },
    byStatus: { sent: 5, generated: 3, pending: 2, revoked: 1 },
  },
  tab: "general", group: "Courses", batch: "b1", status: "sent", q: "aye",
  batches: [{ id: "b1", name: "CR Batch 1", topic: "Clinical Research", count: 12 }],
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

  it("group chips keep other params and reset page", () => {
    render(<AdminCertificates {...base({ page: 2 })} />);
    const p = params(hrefOf(/^Workshops/));
    expect(p.get("group")).toBe("Workshops");
    expect(p.get("status")).toBe("sent");
    expect(p.get("q")).toBe("aye");
    expect(p.get("tab")).toBe("general");
    expect(p.get("page")).toBeNull();
    expect(p.get("batch")).toBeNull();
  });

  it("status chips keep other params, reset page, and All clears status", () => {
    render(<AdminCertificates {...base({ page: 2 })} />);
    const p = params(hrefOf(/^Pending/));
    expect(p.get("status")).toBe("pending");
    expect(p.get("group")).toBe("Courses");
    expect(p.get("batch")).toBe("b1");
    expect(p.get("page")).toBeNull();
    const all = screen.getByTestId("status-chips");
    expect(params(within(all).getByRole("link", { name: /^All/ }).getAttribute("href")!).get("status")).toBeNull();
  });

  it("batch cards set batch; All batches clears it", () => {
    render(<AdminCertificates {...base()} />);
    const cards = screen.getByTestId("batch-cards");
    const card = within(cards).getByRole("link", { name: /CR Batch 1/ });
    expect(params(card.getAttribute("href")!).get("batch")).toBe("b1");
    expect(within(card).getByText("12 certificates")).toBeTruthy();
    const all = within(cards).getByRole("link", { name: /All batches/ });
    expect(params(all.getAttribute("href")!).get("batch")).toBeNull();
    expect(params(all.getAttribute("href")!).get("group")).toBe("Courses");
  });

  it("search form is GET with other params as hidden inputs, without page or q", () => {
    const { container } = render(<AdminCertificates {...base({ page: 2 })} />);
    const form = container.querySelector("form")!;
    expect(form.getAttribute("method")?.toLowerCase()).toBe("get");
    const input = screen.getByPlaceholderText("Search by name, email or certificate number") as HTMLInputElement;
    expect(input.name).toBe("q");
    expect(input.defaultValue).toBe("aye");
    const hidden = Array.from(form.querySelectorAll("input[type=hidden]")).map((i) => [(i as HTMLInputElement).name, (i as HTMLInputElement).value]);
    expect(Object.fromEntries(hidden)).toEqual({ tab: "general", group: "Courses", batch: "b1", status: "sent" });
  });

  it("table shows every column and the View certificate href", () => {
    render(<AdminCertificates {...base()} />);
    const t = within(screen.getByRole("table"));
    for (const h of ["Name", "Email", "Group", "Batch", "Topic", "Certificate number", "Issue date", "Status"]) {
      expect(t.getByText(h)).toBeTruthy();
    }
    for (const v of ["Ayesha Khan", "ayesha@x.com", "Courses", "CR Batch 1", "Clinical Research", "PZ-2026-AAAA1111", "2026-10-01", "Sent"]) {
      expect(t.getAllByText(v).length).toBeGreaterThan(0);
    }
    const view = t.getByRole("link", { name: "View certificate" });
    expect(view.getAttribute("href")).toBe("https://cert.pharmacozyme.com/verify?certId=PZ-2026-AAAA1111");
    expect(view.getAttribute("target")).toBe("_blank");
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
