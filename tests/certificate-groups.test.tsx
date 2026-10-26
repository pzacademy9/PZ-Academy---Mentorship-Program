import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CertificateGroups, CertStatusChip } from "@/components/certs/CertificateGroups";
import type { CertRecord } from "@/lib/certs/cert-model";

const cert = (over: Partial<CertRecord> = {}): CertRecord => ({
  id: "d1", certId: "PZ-2026-AAAA1111", name: "Ayesha", email: "a@x.com",
  category: "General", subCategory: "Courses", topic: "DIT", batchId: "b1",
  batchName: "DIT Batch 1", issueDate: "2026-09-01", status: "sent",
  viewUrl: "https://cert.pharmacozyme.com/verify?certId=PZ-2026-AAAA1111", ...over,
});

describe("CertificateGroups", () => {
  it("renders General before Official with sub-group labels and cert details", () => {
    render(
      <CertificateGroups variant="admin" emptyText="none" certs={[
        cert({ id: "o", category: "Official", subCategory: "Mentors", certId: "PZ-O" }),
        cert(),
      ]} />,
    );
    const g = screen.getByRole("heading", { name: "General" });
    const o = screen.getByRole("heading", { name: "Official" });
    expect(g.compareDocumentPosition(o) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Courses")).toBeTruthy();
    expect(screen.getByText("Mentors")).toBeTruthy();
    expect(screen.getAllByText("DIT")).toHaveLength(2);
    expect(screen.getAllByText("DIT Batch 1")).toHaveLength(2);
    expect(screen.getByText("PZ-2026-AAAA1111")).toBeTruthy();
    expect(screen.getAllByText("2026-09-01")).toHaveLength(2);
  });

  it("omits Official heading when there are none", () => {
    render(<CertificateGroups variant="admin" emptyText="none" certs={[cert()]} />);
    expect(screen.queryByRole("heading", { name: "Official" })).toBeNull();
  });

  it("shows Other only when present", () => {
    render(<CertificateGroups variant="admin" emptyText="none" certs={[cert({ category: "Other", subCategory: "X" })]} />);
    expect(screen.getByRole("heading", { name: "Other" })).toBeTruthy();
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

  it("admin variant shows each status chip and mutes revoked", () => {
    render(
      <CertificateGroups variant="admin" emptyText="none" certs={[
        cert({ id: "1", certId: "C1", status: "sent" }),
        cert({ id: "2", certId: "C2", status: "generated" }),
        cert({ id: "3", certId: "C3", status: "pending" }),
        cert({ id: "4", certId: "C4", status: "revoked" }),
      ]} />,
    );
    for (const t of ["Sent", "Generated", "Pending", "Revoked"]) expect(screen.getByText(t)).toBeTruthy();
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
