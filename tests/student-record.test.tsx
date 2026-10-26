import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { StudentRecord, parseTab, type Tab } from "@/components/admin/students/StudentRecord";
import type { StudentRecordData } from "@/lib/data/admin-students";
import type { CertRecord } from "@/lib/certs/cert-model";

const cert = (over: Partial<CertRecord> = {}): CertRecord => ({
  id: "c1",
  certId: "PZ-2026-AAAA1111",
  name: "Ayesha Khan",
  email: "ayesha@x.com",
  category: "General",
  subCategory: "Courses",
  topic: "Clinical Research",
  batchId: "b1",
  batchName: "Batch 1",
  issueDate: "2026-09-10",
  status: "sent",
  viewUrl: "https://cert.pharmacozyme.com/verify?certId=PZ-2026-AAAA1111",
  ...over,
});

const data = (over: Partial<StudentRecordData> = {}): StudentRecordData => ({
  profile: {
    id: "11111111-1111-4111-8111-111111111111",
    fullName: "Ayesha Khan",
    email: "ayesha@x.com",
    phone: "0300 1234567",
    joinedAt: "2026-09-01T10:00:00Z",
  },
  tiles: { courses: 2, progress: 40, attended: "3 of 5", averageFeedback: 4.5, certificate: "issued" },
  enrollments: [
    { id: "e1", courseId: "c1", courseTitle: "Clinical Research", status: "active", enrolledAt: "2026-09-02T10:00:00Z", paymentAmountPkr: 25000 },
    { id: "e2", courseId: "c2", courseTitle: "Pharmacovigilance", status: "pending", enrolledAt: "2026-09-03T10:00:00Z", paymentAmountPkr: null },
    { id: "e3", courseId: "c3", courseTitle: "Regulatory Affairs", status: "rejected", enrolledAt: "2026-09-04T10:00:00Z", paymentAmountPkr: null },
    { id: "e4", courseId: "c4", courseTitle: "Old Course", status: "expired", enrolledAt: "2026-09-05T10:00:00Z", paymentAmountPkr: null },
  ],
  progressByCourse: [
    { courseId: "c1", courseTitle: "Clinical Research", totalLessons: 10, completedLessons: 4, percent: 40 },
  ],
  attendance: [{ id: "a1", courseTitle: "Clinical Research", sessionDate: "2026-09-12", markedAt: "2026-09-12T10:00:00Z" }],
  feedback: [
    { id: "f1", submittedAt: "2026-09-13T10:00:00Z", comments: "Great <b>course</b>", rating: 4 },
    { id: "f2", submittedAt: "2026-09-14T10:00:00Z", comments: "", rating: null },
  ],
  mentorship: [
    { id: "m1", mentorName: "Dr Sana", packageName: "Career Pack", status: "active", sessionsTotal: 4, createdAt: "2026-09-15T10:00:00Z" },
  ],
  certs: { state: "ok", certs: [cert()], pendingCount: 0 },
  recentActivity: [{ at: "2026-09-12T10:00:00Z", text: "Enrolled in Clinical Research" }],
  attention: [{ key: "k1", title: "Payment pending", detail: "Pharmacovigilance is waiting for payment." }],
  ...over,
});

const empty = (): StudentRecordData =>
  data({
    enrollments: [],
    progressByCourse: [],
    attendance: [],
    feedback: [],
    mentorship: [],
    certs: { state: "ok", certs: [], pendingCount: 0 },
    recentActivity: [],
    attention: [],
    tiles: { courses: 0, progress: 0, attended: "0 of 0", averageFeedback: null, certificate: "none" },
  });

const show = (d: StudentRecordData, tab: Tab = "overview") => render(<StudentRecord data={d} tab={tab} />);

describe("parseTab", () => {
  it("accepts valid tabs and falls back to overview", () => {
    expect(parseTab("certificates")).toBe("certificates");
    expect(parseTab("nope")).toBe("overview");
    expect(parseTab(undefined)).toBe("overview");
    expect(parseTab(["courses", "progress"])).toBe("overview");
  });
});

describe("StudentRecord", () => {
  it("header shows back link, name, email, phone, joined date", () => {
    show(data());
    expect(screen.getByRole("link", { name: "Back to Students" }).getAttribute("href")).toBe("/dashboard/admin/students");
    expect(screen.getByRole("heading", { name: "Ayesha Khan" })).toBeTruthy();
    expect(screen.getByText("ayesha@x.com")).toBeTruthy();
    expect(screen.getByText("0300 1234567")).toBeTruthy();
    expect(screen.getByText(/Joined/)).toBeTruthy();
  });

  it("tiles show the fixture values", () => {
    show(data());
    const tile = (label: string) => screen.getByTestId(`tile-${label.toLowerCase().replace(/ .*/, "")}`);
    expect(within(tile("Courses")).getByText("2")).toBeTruthy();
    expect(within(tile("Progress")).getByText("40%")).toBeTruthy();
    expect(within(tile("Sessions attended")).getByText("3 of 5")).toBeTruthy();
    expect(within(tile("Average feedback")).getByText("4.5")).toBeTruthy();
    expect(within(tile("Certificate")).getByText("Issued")).toBeTruthy();
  });

  it("tile dashes for null feedback and unknown certificate", () => {
    show(data({ tiles: { courses: 0, progress: 0, attended: "0 of 0", averageFeedback: null, certificate: "unknown" } }));
    const tile = (label: string) => screen.getByTestId(`tile-${label.toLowerCase().replace(/ .*/, "")}`);
    expect(within(tile("Average feedback")).getByText("—")).toBeTruthy();
    expect(within(tile("Certificate")).getByText("—")).toBeTruthy();
  });

  it("certificate tile pending and none", () => {
    const { unmount } = show(data({ tiles: { ...data().tiles, certificate: "pending" } }));
    expect(within(screen.getByTestId("tile-certificate")).getByText("Pending")).toBeTruthy();
    unmount();
    show(data({ tiles: { ...data().tiles, certificate: "none" } }));
    expect(within(screen.getByTestId("tile-certificate")).getByText("None")).toBeTruthy();
  });

  it("default tab is overview with activity and attention", () => {
    show(data());
    expect(screen.getByText("Recent activity")).toBeTruthy();
    expect(screen.getByText("Enrolled in Clinical Research")).toBeTruthy();
    expect(screen.getByText("Needs attention")).toBeTruthy();
    expect(screen.getByText("Payment pending")).toBeTruthy();
    expect(screen.getByText("Pharmacovigilance is waiting for payment.")).toBeTruthy();
    expect(screen.queryByText("View certificate")).toBeNull();
    expect(screen.getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBe("page");
  });

  it("overview empty states", () => {
    show(empty());
    expect(screen.getByText("No activity yet.")).toBeTruthy();
    expect(screen.getByText("Nothing needs attention.")).toBeTruthy();
  });

  it("tab links have the right hrefs", () => {
    show(data());
    const base = "/dashboard/admin/students/11111111-1111-4111-8111-111111111111";
    expect(screen.getByRole("link", { name: "Overview" }).getAttribute("href")).toBe(base);
    expect(screen.getByRole("link", { name: "Courses and payments" }).getAttribute("href")).toBe(`${base}?tab=courses`);
    expect(screen.getByRole("link", { name: "Progress" }).getAttribute("href")).toBe(`${base}?tab=progress`);
    expect(screen.getByRole("link", { name: "Attendance" }).getAttribute("href")).toBe(`${base}?tab=attendance`);
    expect(screen.getByRole("link", { name: "Feedback" }).getAttribute("href")).toBe(`${base}?tab=feedback`);
    expect(screen.getByRole("link", { name: "Certificates" }).getAttribute("href")).toBe(`${base}?tab=certificates`);
    expect(screen.getByRole("link", { name: "Mentorship" }).getAttribute("href")).toBe(`${base}?tab=mentorship`);
  });

  it("certificates tab shows grouped certificates", () => {
    show(data(), "certificates");
    expect(screen.getByRole("heading", { name: "Certificates" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "General" })).toBeTruthy();
    expect(screen.getByText("Clinical Research")).toBeTruthy();
    expect(screen.getByText("View certificate")).toBeTruthy();
    expect(screen.queryByText("Recent activity")).toBeNull();
  });

  it("certificates tab empty text", () => {
    show(empty(), "certificates");
    expect(screen.getByText("No certificates found for this email.")).toBeTruthy();
  });

  it("no-email certs: distinct message in the certificates tab", () => {
    const d = data({ certs: { state: "no-email" }, tiles: { ...data().tiles, certificate: "unknown" } });
    show(d, "certificates");
    expect(
      screen.getByText("This student has no email address on their account, so certificates cannot be matched."),
    ).toBeTruthy();
    expect(screen.queryByText("We could not reach the Certificates app. Try again in a minute.")).toBeNull();
  });

  it("unavailable certs: error only in certificates tab, overview still renders", () => {
    const d = data({ certs: { state: "unavailable" }, tiles: { ...data().tiles, certificate: "unknown" } });
    const { unmount } = show(d, "certificates");
    expect(screen.getByText("We could not reach the Certificates app. Try again in a minute.")).toBeTruthy();
    unmount();
    show(d, "overview");
    expect(screen.queryByText("We could not reach the Certificates app. Try again in a minute.")).toBeNull();
    expect(screen.getByText("Recent activity")).toBeTruthy();
    expect(within(screen.getByTestId("tile-certificate")).getByText("—")).toBeTruthy();
  });

  it("courses tab: status chips, date, Open enrollment links, no amount", () => {
    show(data(), "courses");
    const row = (title: string) => screen.getByText(title).closest("li") as HTMLElement;
    expect(within(row("Clinical Research")).getByText("Paid")).toBeTruthy();
    expect(within(row("Pharmacovigilance")).getByText("Pending")).toBeTruthy();
    expect(within(row("Regulatory Affairs")).getByText("Rejected")).toBeTruthy();
    expect(within(row("Old Course")).getByText("Expired")).toBeTruthy();
    const link = within(row("Clinical Research")).getByRole("link", { name: "Open enrollment" });
    expect(link.getAttribute("href")).toBe("/dashboard/admin/enrollments/e1");
    expect(within(row("Clinical Research")).getByText(/PKR 25,000/)).toBeTruthy();
    expect(within(row("Pharmacovigilance")).getByText(/—/)).toBeTruthy();
  });

  it("reserved enrollment maps to Pending", () => {
    show(
      data({
        enrollments: [{ id: "e9", courseId: "c9", courseTitle: "Reserved One", status: "reserved", enrolledAt: "2026-09-02T10:00:00Z", paymentAmountPkr: null }],
      }),
      "courses",
    );
    expect(within(screen.getByText("Reserved One").closest("li") as HTMLElement).getByText("Pending")).toBeTruthy();
  });

  it("unrecognised statuses show a capitalised value, never a prototype member", () => {
    const mk = (id: string, status: string) => ({ id, courseId: id, courseTitle: `C ${id}`, status, enrolledAt: "2026-09-02T10:00:00Z", paymentAmountPkr: null });
    show(data({ enrollments: [mk("x1", "constructor"), mk("x2", "")] }), "courses");
    expect(within(screen.getByText("C x1").closest("li") as HTMLElement).getByText("Constructor")).toBeTruthy();
    expect(within(screen.getByText("C x2").closest("li") as HTMLElement).getByText("Unknown")).toBeTruthy();
  });

  it("mentorship session count is pluralised", () => {
    show(data({ mentorship: [{ id: "m2", mentorName: "M", packageName: "P", status: "done", sessionsTotal: 1, createdAt: "2026-09-15T10:00:00Z" }] }), "mentorship");
    expect(screen.getByText("1 session")).toBeTruthy();
  });

  it("progress tab: bars labelled by course", () => {
    show(data(), "progress");
    const bar = screen.getByRole("progressbar", { name: /Clinical Research/ });
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    expect(screen.getByText(/4 of 10 lessons/)).toBeTruthy();
    expect(screen.getAllByText("40%").length).toBeGreaterThan(1);
  });

  it("attendance tab lists sessions", () => {
    show(data(), "attendance");
    expect(screen.getByText("Clinical Research")).toBeTruthy();
    expect(screen.getByText(/^12 Sep/)).toBeTruthy();
  });

  it("feedback tab: rating text and plain comments", () => {
    const { container } = show(data(), "feedback");
    expect(screen.getByText("4 / 5")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("Great <b>course</b>")).toBeTruthy();
    expect(container.querySelector("b")).toBeNull();
  });

  it("mentorship tab rows", () => {
    show(data(), "mentorship");
    expect(screen.getByText("Dr Sana")).toBeTruthy();
    expect(screen.getByText("Career Pack")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText(/4 sessions/)).toBeTruthy();
  });

  it("empty states on every tab", () => {
    const cases: [Tab, string][] = [
      ["courses", "No courses yet."],
      ["progress", "No progress yet."],
      ["attendance", "No attendance recorded yet."],
      ["feedback", "No feedback yet."],
      ["mentorship", "No mentorship bookings yet."],
    ];
    for (const [tab, text] of cases) {
      const { unmount } = show(empty(), tab);
      expect(screen.getByText(text)).toBeTruthy();
      unmount();
    }
  });

  it("left-out actions never appear", () => {
    for (const tab of ["overview", "courses", "certificates", "mentorship"] as Tab[]) {
      const { unmount } = show(data(), tab);
      for (const t of [/Export CSV/i, /Sync Status/i, /WhatsApp/i, /Edit student/i, /Enroll in course/i, /Generate statement/i, /Send reminder/i]) {
        expect(screen.queryByText(t)).toBeNull();
      }
      expect(screen.queryByRole("button")).toBeNull();
      unmount();
    }
  });

  it("hostile name renders as text", () => {
    const { container } = show(data({ profile: { ...data().profile, fullName: "<script>alert(1)</script>" } }));
    expect(screen.getByRole("heading", { name: "<script>alert(1)</script>" })).toBeTruthy();
    expect(container.querySelector("script")).toBeNull();
  });
});
