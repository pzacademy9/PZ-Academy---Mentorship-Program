import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
const { refresh, toast } = vi.hoisted(() => ({ refresh: vi.fn(), toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
vi.mock("sonner", () => ({ toast }));

import { StatusChangeControl } from "@/components/admin/registrations/StatusChangeControl";
import { RegistrationDetailView } from "@/components/admin/registrations/RegistrationDetailView";
import type { RegistrationDetail } from "@/lib/data/landing-registration-admin";
import type { RegistrationRecord } from "@/lib/data/landing-registrations";
import { STATUS_CHANGE_MESSAGES } from "@/lib/landing/registration/status-rules";

function rec(over: Partial<RegistrationRecord> = {}): RegistrationRecord {
  return {
    id: "r1", pageId: "p1", rowType: "individual", leadRegistrationId: null, refId: "DIA-0042",
    name: "Sara Ali", email: "sara@example.com", whatsapp: "+923001234567", profession: "Pharmacist",
    city: "Lahore", region: "PK", discovery: "Instagram", consent: true, optionLabel: "PPC Live",
    optionKeys: [], mode: "live", tierKey: "individual", groupSize: 1, promoCodeText: null,
    expectedAmount: 5000, amountReceived: null, currency: "PKR", paymentMethod: null,
    voucherUrl: null, status: "pending", emailStatus: null, agentId: null, studentId: null,
    utm: {}, variantKey: "", isTest: false, createdAt: "2026-10-04T11:42:00Z",
    statusChangedAt: null, statusSource: "app", ...over,
  };
}
function detail(over: Partial<RegistrationDetail> = {}, lead: Partial<RegistrationRecord> = {}): RegistrationDetail {
  return {
    lead: rec(lead), members: [], page: { id: "p1", title: "PPC Masterclass", slug: "ppc" },
    agentName: null, events: [], emails: [], messages: [], access: { mode: "live", hasAccount: false, enrollmentStatus: null, portalOpen: null, hasCourse: false, modules: null }, ...over,
  };
}
const view = (d: RegistrationDetail, showAgent = true) => (
  <RegistrationDetailView detail={d} backHref="/dashboard/admin/enrollments/registrations/all" backLabel="Back to registrations" endpoint="/api/admin/registrations/r1" showAgent={showAgent} />
);

const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); refresh.mockReset(); toast.success.mockReset(); toast.error.mockReset(); });
afterEach(() => vi.unstubAllGlobals());

function openControl(status: "pending" | "paid" | "reserved" | "underpaid" | "free" = "pending") {
  render(<StatusChangeControl registrationId="r1" endpoint="/api/admin/registrations/r1" status={status} expectedAmount={5000} currency="PKR" studentName="Sara Ali" />);
  fireEvent.click(screen.getByRole("button", { name: /change status/i }));
}

describe("StatusChangeControl", () => {
  it("underpaid requires an amount before submit", async () => {
    openControl();
    fireEvent.click(screen.getByRole("radio", { name: /underpaid/i }));
    expect(screen.getByText(/5,000/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /save status/i }));
    expect(await screen.findByText(STATUS_CHANGE_MESSAGES["amount-required"])).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("409 shows the reload message", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "stale" }) });
    openControl();
    fireEvent.click(screen.getByRole("radio", { name: /^paid/i }));
    fireEvent.click(screen.getByRole("button", { name: /save status/i }));
    expect(await screen.findByText("Someone else changed this just now. Reload to see the latest.")).toBeTruthy();
    expect((screen.getByRole("button", { name: /save status/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /reload/i }));
    expect(refresh).toHaveBeenCalled();
  });

  it("a 422 shows the server's message, not the reload notice", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422, json: async () => ({ error: STATUS_CHANGE_MESSAGES["already-in-status"] }) });
    openControl();
    fireEvent.click(screen.getByRole("radio", { name: /^paid/i }));
    fireEvent.click(screen.getByRole("button", { name: /save status/i }));
    expect(await screen.findByText(STATUS_CHANGE_MESSAGES["already-in-status"])).toBeTruthy();
    expect(screen.queryByText(/Reload to see the latest/)).toBeNull();
    expect(screen.queryByRole("button", { name: /reload/i })).toBeNull();
  });

  it("sends status and from, then refreshes", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "r1", status: "paid" }) });
    openControl();
    fireEvent.click(screen.getByRole("radio", { name: /^paid/i }));
    fireEvent.click(screen.getByRole("button", { name: /save status/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/registrations/r1");
    expect(JSON.parse(init.body)).toEqual({ status: "paid", from: "pending" });
    expect(toast.success).toHaveBeenCalled();
  });

  it("shows the server message on 400", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "Plain server words." }) });
    openControl();
    fireEvent.click(screen.getByRole("radio", { name: /^paid/i }));
    fireEvent.click(screen.getByRole("button", { name: /save status/i }));
    expect(await screen.findByText("Plain server words.")).toBeTruthy();
  });
});

describe("RegistrationDetailView", () => {
  it("non-https voucher is plain text", () => {
    const { unmount } = render(view(detail({}, { voucherUrl: "javascript:alert(1)" })));
    expect(screen.getByText("javascript:alert(1)")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /javascript/i })).toBeNull();
    unmount();
    render(view(detail({}, { voucherUrl: "https://drive.google.com/x" })));
    expect(screen.getByRole("link", { name: /drive\.google\.com/ }).getAttribute("href")).toBe("https://drive.google.com/x");
  });

  it("history lists actor, time and source", () => {
    const d = detail({ events: [
      { at: "2026-10-05T09:32:00Z", from: "pending", to: "paid", source: "app", actorName: "Sarah Jenkins", registrationName: "Sara Ali" },
      { at: "2026-10-04T11:42:00Z", from: null, to: "reserved", source: "sheet", actorName: null, registrationName: "Sara Ali" },
    ] });
    render(view(d));
    expect(screen.getByText("Sarah Jenkins")).toBeTruthy();
    expect(screen.getByText("App")).toBeTruthy();
    expect(screen.getByText("Sheet")).toBeTruthy();
    expect(screen.getByText(/5 Oct 2026/)).toBeTruthy();
  });

  it("members listed under the lead", () => {
    const d = detail({ members: [rec({ id: "m1", rowType: "member", name: "Ayesha Noor", email: "a@x.com", leadRegistrationId: "r1" })] }, { rowType: "lead", groupSize: 2 });
    render(view(d));
    const panel = screen.getByRole("region", { name: /group members/i });
    expect(within(panel).getByText("Ayesha Noor")).toBeTruthy();
    expect(within(panel).getByText("Sara Ali")).toBeTruthy();
    expect(screen.getByText("Changing the lead changes the whole group.")).toBeTruthy();
  });

  it("free rows show no change control", () => {
    render(view(detail({}, { status: "free", expectedAmount: null })));
    expect(screen.queryByRole("button", { name: /change status/i })).toBeNull();
  });

  it("agent card only when asked", () => {
    const d = detail({ agentName: "Zoya Khan" });
    const { unmount } = render(view(d, true));
    expect(screen.getByText("Zoya Khan")).toBeTruthy();
    unmount();
    render(view(d, false));
    expect(screen.queryByText("Zoya Khan")).toBeNull();
  });
});

describe("status dialog edge cases", () => {
  it("a leftover amount does not block Paid after switching away from Underpaid", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "r1", status: "paid" }) });
    openControl();
    fireEvent.click(screen.getByRole("radio", { name: /underpaid/i }));
    fireEvent.change(screen.getByLabelText("Amount received"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("radio", { name: /^paid/i }));
    fireEvent.click(screen.getByRole("button", { name: /save status/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ status: "paid", from: "pending" });
  });

  it("Reload in the conflict state refreshes and closes the dialog", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "stale" }) });
    openControl();
    fireEvent.click(screen.getByRole("radio", { name: /^paid/i }));
    fireEvent.click(screen.getByRole("button", { name: /save status/i }));
    fireEvent.click(await screen.findByRole("button", { name: /reload/i }));
    expect(refresh).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("campaign details use plain labels, not raw utm keys", () => {
    render(view(detail({}, { utm: { utm_source: "facebook", utm_campaign: "ppc3" } })));
    expect(screen.getByText("Where they came from: facebook")).toBeTruthy();
    expect(screen.getByText("Campaign: ppc3")).toBeTruthy();
    expect(screen.queryByText(/utm_/)).toBeNull();
  });

  it("an empty promo code shows None used", () => {
    render(view(detail({}, { promoCodeText: "" })));
    expect(screen.getByText("None used")).toBeTruthy();
  });

  it("history uses the standard status names", () => {
    render(view(detail({ events: [{ at: "2026-10-05T09:32:00Z", from: "pending", to: "underpaid", source: "app", actorName: "A", registrationName: "Sara Ali" }] })));
    expect(screen.getByText("Pending → Underpaid")).toBeTruthy();
  });
});

describe("StatusChangeControl refresh after save", () => {
  const props = { registrationId: "r1", endpoint: "/api/admin/registrations/r1", expectedAmount: 5000, currency: "PKR", studentName: "Sara Ali" } as const;
  const reload = vi.fn();
  const realLocation = window.location;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    reload.mockReset();
    Object.defineProperty(window, "location", { configurable: true, value: { ...realLocation, reload } });
  });
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, "location", { configurable: true, value: realLocation });
  });

  async function save() {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "r1", status: "paid" }) });
    const utils = render(<StatusChangeControl {...props} status="pending" />);
    fireEvent.click(screen.getByRole("button", { name: /change status/i }));
    fireEvent.click(screen.getByRole("radio", { name: /^paid/i }));
    fireEvent.click(screen.getByRole("button", { name: /save status/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    return utils;
  }

  it("closes the dialog, toasts and refreshes after a successful save", async () => {
    await save();
    expect(toast.success).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("does a full reload if the refreshed page never shows the new status", async () => {
    await save();
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload once the refreshed page shows the new status", async () => {
    const { rerender } = await save();
    rerender(<StatusChangeControl {...props} status="paid" />);
    await vi.advanceTimersByTimeAsync(5000);
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload after the control is gone", async () => {
    const { unmount } = await save();
    unmount();
    await vi.advanceTimersByTimeAsync(5000);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("RegistrationDetailView: emails and course access", () => {
  const sent = [
    { kind: "paid" as const, toEmail: "sara@example.com", sentAt: "2026-10-05T09:35:00Z" },
    { kind: "portal_link" as const, toEmail: "sara@example.com", sentAt: "2026-10-05T09:36:00Z" },
    { kind: "underpaid" as const, toEmail: "sara@example.com", sentAt: "2026-10-05T09:37:00Z" },
    { kind: "reserved" as const, toEmail: "sara@example.com", sentAt: "2026-10-04T11:43:00Z" },
  ];

  it("admin sees an email row per email with its type chip and address", () => {
    render(view(detail({ emails: sent })));
    const card = screen.getByRole("heading", { name: "Emails sent" }).closest("section")!;
    for (const label of ["Paid", "Portal link", "Underpaid", "Reserved"]) expect(within(card).getByText(label)).toBeTruthy();
    expect(within(card).getAllByText("sara@example.com")).toHaveLength(4);
  });

  it("admin sees a builder email and a WhatsApp mark in the same card", () => {
    render(view(detail({ emails: sent, messages: [
      { registrationId: "r1", channel: "email", subject: "Module 2 Schedule", state: "sent", sentAt: "2026-10-15T11:42:00Z", sendCreatedAt: "2026-10-15T11:40:00Z" },
      { registrationId: "r1", channel: "whatsapp", subject: "", state: "sent", sentAt: "2026-10-16T08:00:00Z", sendCreatedAt: "2026-10-16T07:50:00Z" },
    ] })));
    const card = screen.getByRole("heading", { name: "Emails sent" }).closest("section")!;
    expect(within(card).getByText("Module 2 Schedule")).toBeTruthy();
    expect(within(card).getByText("Sent via WhatsApp")).toBeTruthy();
  });

  it("agent view with messages in the data still shows none", () => {
    render(view(detail({ messages: [{ registrationId: "r1", channel: "email", subject: "Secret subject", state: "sent", sentAt: "2026-10-15T11:42:00Z", sendCreatedAt: "2026-10-15T11:40:00Z" }] }), false));
    expect(screen.queryByText("Secret subject")).toBeNull();
  });

  it("shows the empty state when no email was sent", () => {
    render(view(detail()));
    expect(screen.getByText("No emails sent yet")).toBeTruthy();
  });

  it("agent view hides the emails card", () => {
    render(view(detail({ emails: sent }), false));
    expect(screen.queryByRole("heading", { name: "Emails sent" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Course access" })).toBeTruthy();
  });

  it("guest without an account, portal closed", () => {
    render(view(detail({ access: { mode: "recorded", hasAccount: false, enrollmentStatus: null, portalOpen: false, hasCourse: true, modules: null } })));
    const card = screen.getByRole("heading", { name: "Course access" }).closest("section")!;
    expect(within(card).getByText("Recorded")).toBeTruthy();
    expect(within(card).getByText("Account: not signed up yet")).toBeTruthy();
    expect(within(card).getByText("Portal: closed")).toBeTruthy();
    expect(within(card).getByText("Modules appear once they sign up")).toBeTruthy();
    expect(within(card).queryByText("No course on this page")).toBeNull();
  });

  it("signed up with a course but no enrollment yet: modules wait for payment", () => {
    render(view(detail({ access: { mode: "live", hasAccount: true, enrollmentStatus: null, portalOpen: null, hasCourse: true, modules: null } })));
    const card = screen.getByRole("heading", { name: "Course access" }).closest("section")!;
    expect(within(card).getByText("Modules appear once the registration is paid")).toBeTruthy();
    expect(within(card).queryByText("Modules appear once they sign up")).toBeNull();
  });

  it("portal not set up yet when there is no enrollment", () => {
    render(view(detail({ access: { mode: "live", hasAccount: false, enrollmentStatus: null, portalOpen: null, hasCourse: true, modules: null } })));
    expect(screen.getByText("Portal: not set up yet")).toBeTruthy();
  });

  it("an enrollment with no modules says so", () => {
    render(view(detail({ access: { mode: "live", hasAccount: true, enrollmentStatus: "active", portalOpen: true, hasCourse: true, modules: [] } })));
    expect(screen.getByText("No modules yet")).toBeTruthy();
  });

  it("page with no course says so", () => {
    render(view(detail()));
    expect(screen.getByText("No course on this page")).toBeTruthy();
  });

  it("lists modules with Open and Closed chips", () => {
    render(view(detail({ access: { mode: "live", hasAccount: true, enrollmentStatus: "active", portalOpen: true, hasCourse: true, modules: [
      { id: "m1", title: "Module One", open: true }, { id: "m2", title: "Module Two", open: false },
    ] } })));
    const card = screen.getByRole("heading", { name: "Course access" }).closest("section")!;
    expect(within(card).getByText("Live")).toBeTruthy();
    expect(within(card).getByText("Account: signed up")).toBeTruthy();
    expect(within(card).getByText("Portal: open")).toBeTruthy();
    expect(within(screen.getByText("Module One").closest("li")!).getByText("Open")).toBeTruthy();
    expect(within(screen.getByText("Module Two").closest("li")!).getByText("Closed")).toBeTruthy();
    expect(screen.queryByText("No course on this page")).toBeNull();
  });
});
