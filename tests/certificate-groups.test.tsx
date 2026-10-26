import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CertificateGroups, CertStatusChip } from "@/components/certs/CertificateGroups";
import type { CertRecord } from "@/lib/certs/cert-model";

const cert = (over: Partial<CertRecord> = {}): CertRecord => ({
  id: "d1", certId: "PZ-2026-AAAA1111", name: "Ayesha", email: "a@x.com",
  category: "General", subCategory: "Courses", topic: "DIT", batchId: "b1",
  batchName: "DIT Batch 1", batchCreatedAt: "2026-08-01", issueDate: "2026-09-01", status: "sent",
  viewUrl: "https://cert.pharmacozyme.com/verify?certId=PZ-2026-AAAA1111", ...over,
});

describe("CertificateGroups", () => {
  it("renders a plain list, newest first, with no group headings", () => {
    render(
      <CertificateGroups variant="admin" emptyText="none" certs={[
        cert({ id: "old", certId: "PZ-OLD", issueDate: "2026-01-01" }),
        cert({ id: "new", category: "Official", subCategory: "Mentors", certId: "PZ-NEW", issueDate: "2026-09-01", batchName: "Mentor Batch", topic: "Mentoring" }),
      ]} />,
    );
    expect(screen.queryByRole("heading")).toBeNull();
    const rows = screen.getAllByTestId(/cert-row-/);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual(["cert-row-new", "cert-row-old"]);
    expect(screen.getByText("Mentor Batch")).toBeTruthy();
    expect(screen.getByText("Mentors \u2022 Mentoring")).toBeTruthy();
    expect(screen.getByText("Courses \u2022 DIT")).toBeTruthy();
    expect(screen.getByText("PZ-NEW")).toBeTruthy();
    expect(screen.getByText("2026-09-01")).toBeTruthy();
  });

  it("link opens viewUrl safely", () => {
    render(<CertificateGroups variant="admin" emptyText="none" certs={[cert()]} />);
    const a = screen.getByRole("link", { name: /View certificate/ });
    expect(a.getAttribute("href")).toBe("https://cert.pharmacozyme.com/verify?certId=PZ-2026-AAAA1111");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("never renders an unsafe viewUrl into an href", () => {
    render(<CertificateGroups variant="admin" emptyText="none" certs={[cert({ viewUrl: "javascript:alert(1)" })]} />);
    const a = screen.getByRole("link", { name: /View certificate/ });
    expect(a.getAttribute("href")).toBe("https://cert.pharmacozyme.com/verify?certId=PZ-2026-AAAA1111");
  });

  it("student variant always shows Issued", () => {
    render(<CertificateGroups variant="student" emptyText="none" certs={[cert({ status: "generated" }), cert({ id: "z", status: "sent" })]} />);
    expect(screen.getAllByText("Issued")).toHaveLength(2);
    expect(screen.queryByText("Sent")).toBeNull();
  });

  it("student pending card singular and plural", () => {
    const { unmount } = render(<CertificateGroups variant="student" emptyText="none" certs={[cert()]} pendingCount={1} />);
    expect(screen.getByText("1 certificate is being prepared. We will tell you here when it is ready.")).toBeTruthy();
    unmount();
    render(<CertificateGroups variant="student" emptyText="none" certs={[cert()]} pendingCount={3} />);
    expect(screen.getByText("3 certificates are being prepared. We will tell you here when they are ready.")).toBeTruthy();
  });

  it("pending card shown even with no issued certs, and not shown for zero", () => {
    const { unmount } = render(<CertificateGroups variant="student" emptyText="nothing yet" certs={[]} pendingCount={2} />);
    expect(screen.getByText(/2 certificates are being prepared/)).toBeTruthy();
    unmount();
    render(<CertificateGroups variant="student" emptyText="nothing yet" certs={[]} pendingCount={0} />);
    expect(screen.queryByText(/being prepared/)).toBeNull();
  });

  it("admin variant shows a chip only for Pending and Revoked, and mutes revoked", () => {
    render(
      <CertificateGroups variant="admin" emptyText="none" certs={[
        cert({ id: "1", certId: "C1", status: "sent" }),
        cert({ id: "2", certId: "C2", status: "generated" }),
        cert({ id: "3", certId: "C3", status: "pending" }),
        cert({ id: "4", certId: "C4", status: "revoked" }),
      ]} />,
    );
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(screen.getByText("Revoked")).toBeTruthy();
    expect(screen.queryByText("Sent")).toBeNull();
    expect(screen.queryByText("Generated")).toBeNull();
    expect(screen.getByTestId("cert-row-4").className).toContain("opacity-60");
    expect(screen.getByTestId("cert-row-1").className).not.toContain("opacity-60");
  });

  it("empty shows emptyText", () => {
    render(<CertificateGroups variant="student" emptyText="No certificates yet" certs={[]} />);
    expect(screen.getByText("No certificates yet")).toBeTruthy();
  });

  it("CertStatusChip renders label", () => {
    render(<CertStatusChip status="revoked" />);
    expect(screen.getByText("Revoked")).toBeTruthy();
  });
});
