import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

import { MessageBuilder } from "@/components/admin/registrations/MessageBuilder";
import { WhatsAppSendList } from "@/components/admin/registrations/WhatsAppSendList";
import type { CampaignBuilderRequest } from "@/components/admin/registrations/CampaignRegistrations";
import { clearMode } from "@/lib/crm/whatsapp-mode";

const PAGE = "11111111-1111-4111-8111-111111111111";
const R1 = "22222222-2222-4222-8222-222222222222";
const request: CampaignBuilderRequest = { pageId: PAGE, pageTitle: "TMC Batch 1", count: 3, selection: { mode: "ids", ids: [R1] } };

const summary = (over: Record<string, unknown> = {}) => ({
  total: 3,
  byStatus: { paid: 1, pending: 1, reserved: 0, underpaid: 1, free: 0 },
  notPaid: 2,
  skipped: { no_email: 0, no_phone: 1, unsubscribed: 0, merged: 0 },
  members: 0,
  ...over,
});

const BODY = "Hi {{ first_name }}, ref {{ ref_id }} & link {{ portal_link }}";
const rec = (o: Record<string, unknown>) => ({
  id: "x", send_id: "s1", registration_id: "reg-x", name: "Name", email: "", phone: "", state: "pending", reason: "",
  sent_at: null, status_at_send: "paid", is_member: false, claimed_at: null, ...o,
});
const detail = (recipients: unknown[]) => ({
  send: { id: "s1", channel: "whatsapp", body: BODY, subject: "" },
  recipients,
  refIds: { "reg-a": "REF-0001", "reg-b": "REF-0002", "reg-c": "REF-0003" },
  portalUrl: "https://example.com/portal/tmc",
});
const pendingRows = () => [
  rec({ id: "ra", registration_id: "reg-a", name: "Ayesha Siddiqui", phone: "0300 1234567" }),
  rec({ id: "rb", registration_id: "reg-b", name: "Tariq Mansoor", phone: "", state: "skipped", reason: "no_phone" }),
  rec({ id: "rc", registration_id: "reg-c", name: "Bilal Ahmed", phone: "+923217892200", state: "sent", sent_at: "2026-10-20T09:14:00.000Z" }),
];

type Call = { url: string; method: string; body: unknown };
let calls: Call[];
let handlers: Record<string, (body: unknown) => { status?: number; json: unknown }>;
const json = (status: number, data: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => data }) as Response;

beforeEach(() => {
  calls = [];
  clearMode("participants");
  handlers = {
    "GET /api/admin/participants/templates": () => ({ json: { templates: [
      { id: "44444444-4444-4444-8444-444444444444", name: "Reminder", subject: "Mail subject", emailBody: "Email text", whatsappBody: "WhatsApp text {{ first_name }}" },
    ] } }),
    "POST /api/admin/participants/preview": () => ({ json: { summary: summary(), count: 3 } }),
    "POST /api/admin/participants/sends": () => ({ status: 201, json: { sendId: "s1", count: 2 } }),
    "GET /api/admin/participants/sends/s1": () => ({ json: detail(pendingRows()) }),
    "PATCH /api/admin/participants/sends/s1/recipients/ra": () => ({ json: { ok: true } }),
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    const h = handlers[`${method} ${url}`];
    if (!h) return json(404, { error: "no handler" });
    const r = h(body);
    return json(r.status ?? 200, r.json);
  }));
});

const count = (url: string, method = "POST") => calls.filter((c) => c.url === url && c.method === method);

describe("WhatsAppSendList", () => {
  it("builds the link from the per-person rendered message, URL-encoded", async () => {
    render(<WhatsAppSendList sendId="s1" onClose={() => {}} />);
    const link = (await screen.findByRole("link", { name: /Open WhatsApp for Ayesha Siddiqui/ })) as HTMLAnchorElement;
    const href = link.getAttribute("href")!;
    expect(href.startsWith("whatsapp://send?phone=923001234567&text=")).toBe(true);
    const text = decodeURIComponent(href.split("&text=")[1]);
    expect(text).toBe("Hi Ayesha, ref REF-0001 & link https://example.com/portal/tmc");
    expect(href).toContain(encodeURIComponent("& link"));
  });

  it("uses the WhatsApp Web address when Web is chosen, and remembers it", async () => {
    render(<WhatsAppSendList sendId="s1" onClose={() => {}} />);
    await screen.findByRole("link", { name: /Open WhatsApp for Ayesha/ });
    fireEvent.click(screen.getByRole("button", { name: /WhatsApp Web/ }));
    const link = screen.getByRole("link", { name: /Open WhatsApp for Ayesha/ });
    expect(link.getAttribute("href")!.startsWith("https://web.whatsapp.com/send?phone=923001234567&text=")).toBe(true);
    expect(window.sessionStorage.getItem("pz-whatsapp-mode:participants")).toBe("web");
  });

  it("a skipped row says No phone number and has no link or button", async () => {
    render(<WhatsAppSendList sendId="s1" onClose={() => {}} />);
    await screen.findByText("Tariq Mansoor");
    expect(screen.getByText("No phone number")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Tariq/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Mark Tariq/ })).toBeNull();
  });

  it("rows already sent come back sent from the server, with the time", async () => {
    render(<WhatsAppSendList sendId="s1" onClose={() => {}} />);
    await screen.findByText("Bilal Ahmed");
    expect(screen.getByText(/^Sent \d{1,2}:\d{2}/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Open WhatsApp for Bilal/ })).toBeNull();
    expect(screen.getByText("Sent 1 of 2")).toBeTruthy();
  });

  it("opening WhatsApp does not mark anything sent", async () => {
    render(<WhatsAppSendList sendId="s1" onClose={() => {}} />);
    const link = await screen.findByRole("link", { name: /Open WhatsApp for Ayesha/ });
    link.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(link);
    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
  });

  it("Mark sent calls PATCH once with sent true and shows Sent", async () => {
    render(<WhatsAppSendList sendId="s1" onClose={() => {}} />);
    const btn = await screen.findByRole("button", { name: /Mark Ayesha Siddiqui as sent/ });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByText("Sent 2 of 2")).toBeTruthy());
    const patches = calls.filter((c) => c.method === "PATCH");
    expect(patches).toHaveLength(1);
    expect(patches[0].url).toBe("/api/admin/participants/sends/s1/recipients/ra");
    expect(patches[0].body).toEqual({ sent: true });
    expect(screen.queryByRole("link", { name: /Open WhatsApp for Ayesha/ })).toBeNull();
  });

  it("a failed Mark sent keeps the row pending and says so", async () => {
    handlers["PATCH /api/admin/participants/sends/s1/recipients/ra"] = () => ({ status: 500, json: { error: "Could not update the recipient" } });
    render(<WhatsAppSendList sendId="s1" onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Mark Ayesha Siddiqui as sent/ }));
    expect(await screen.findByText("Could not update the recipient")).toBeTruthy();
    expect(screen.getByText("Sent 1 of 2")).toBeTruthy();
  });
});

async function toReview(over: { summary?: unknown } = {}) {
  if (over.summary) handlers["POST /api/admin/participants/preview"] = () => ({ json: { summary: over.summary, count: 3 } });
  render(<MessageBuilder channel="whatsapp" request={request} onClose={() => {}} />);
  await screen.findByRole("option", { name: "Reminder" });
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hello {{ first_name }}" } });
  fireEvent.click(screen.getByRole("button", { name: /Review and send/ }));
  await screen.findByText(/You are about to message/);
}

describe("MessageBuilder in WhatsApp mode", () => {
  it("has no subject field and no Send test to me, and no email wording", async () => {
    render(<MessageBuilder channel="whatsapp" request={request} onClose={() => {}} />);
    await screen.findByRole("option", { name: "Reminder" });
    expect(screen.queryByLabelText("Subject")).toBeNull();
    expect(screen.queryByRole("button", { name: /Send test to me/ })).toBeNull();
    expect(screen.queryByText(/unsubscribe/i)).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("WhatsApp to the selected registrations");
  });

  it("is ready with a message alone", async () => {
    render(<MessageBuilder channel="whatsapp" request={request} onClose={() => {}} />);
    await screen.findByRole("option", { name: "Reminder" });
    const go = screen.getByRole("button", { name: /Review and send/ }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hi" } });
    expect(go.disabled).toBe(false);
  });

  it("picking a template fills the message from the WhatsApp text", async () => {
    render(<MessageBuilder channel="whatsapp" request={request} onClose={() => {}} />);
    await screen.findByRole("option", { name: "Reminder" });
    fireEvent.change(screen.getByLabelText("Template"), { target: { value: "44444444-4444-4444-8444-444444444444" } });
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe("WhatsApp text {{ first_name }}");
  });

  it("Save as template stores the text as the WhatsApp text", async () => {
    handlers["POST /api/admin/participants/templates"] = () => ({ status: 201, json: { template: { id: "t9", name: "Mine", subject: "", emailBody: "", whatsappBody: "Hi" } } });
    render(<MessageBuilder channel="whatsapp" request={request} onClose={() => {}} />);
    await screen.findByRole("option", { name: "Reminder" });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: /Save as template/ }));
    fireEvent.change(screen.getByLabelText("Template name"), { target: { value: "Mine" } });
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(count("/api/admin/participants/templates")).toHaveLength(1));
    expect(count("/api/admin/participants/templates")[0].body).toEqual({ name: "Mine", subject: "", emailBody: "", whatsappBody: "Hi" });
  });

  it("previews with channel whatsapp and shows the same warning that needs the tick", async () => {
    await toReview();
    expect(count("/api/admin/participants/preview")[0].body).toMatchObject({ channel: "whatsapp" });
    expect(screen.getByText("2 people have not paid (Pending 1, Underpaid 1). They will get this message too.")).toBeTruthy();
    const confirm = screen.getByRole("button", { name: /Confirm and send/ }) as HTMLButtonElement;
    expect(confirm.textContent).toContain("3 messages");
    expect(confirm.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(confirm.disabled).toBe(false);
  });

  it("creates with channel whatsapp and the expected figures, then shows the list with no run call", async () => {
    await toReview();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Confirm and send/ }));
    await screen.findByRole("link", { name: /Open WhatsApp for Ayesha/ });
    const creates = count("/api/admin/participants/sends");
    expect(creates).toHaveLength(1);
    expect(creates[0].body).toMatchObject({
      pageId: PAGE, channel: "whatsapp", body: "Hello {{ first_name }}", subject: "",
      expectedCount: 3, expectedNotPaid: 2, confirmNotPaid: true,
    });
    expect(calls.some((c) => c.url.endsWith("/run"))).toBe(false);
  });

  it("everyone paid: no warning, confirmNotPaid false", async () => {
    await toReview({ summary: summary({ byStatus: { paid: 3, pending: 0, reserved: 0, underpaid: 0, free: 0 }, notPaid: 0 }) });
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Confirm and send/ }));
    await screen.findByRole("link", { name: /Open WhatsApp for Ayesha/ });
    expect(count("/api/admin/participants/sends")[0].body).toMatchObject({ expectedNotPaid: 0, confirmNotPaid: false });
  });

  it("double click creates once", async () => {
    await toReview({ summary: summary({ notPaid: 0 }) });
    const b = screen.getByRole("button", { name: /Confirm and send/ });
    fireEvent.click(b);
    fireEvent.click(b);
    await screen.findByRole("link", { name: /Open WhatsApp for Ayesha/ });
    expect(count("/api/admin/participants/sends")).toHaveLength(1);
  });

  it("409 count_changed goes back to review with the message and creates nothing more", async () => {
    handlers["POST /api/admin/participants/sends"] = () => ({ status: 409, json: { code: "count_changed", error: "The list changed. Review it again.", summary: summary({ total: 4, notPaid: 0 }) } });
    await toReview({ summary: summary({ notPaid: 0 }) });
    fireEvent.click(screen.getByRole("button", { name: /Confirm and send/ }));
    expect(await screen.findByText("The list changed. Review it again.")).toBeTruthy();
    expect(count("/api/admin/participants/sends")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Confirm and send \(4 messages\)/ })).toBeTruthy();
  });

  it("closing the list reports that a send was started", async () => {
    const onClose = vi.fn();
    handlers["POST /api/admin/participants/preview"] = () => ({ json: { summary: summary({ notPaid: 0 }), count: 3 } });
    render(<MessageBuilder channel="whatsapp" request={request} onClose={onClose} />);
    await screen.findByRole("option", { name: "Reminder" });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: /Review and send/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Confirm and send/ }));
    await screen.findByRole("link", { name: /Open WhatsApp for Ayesha/ });
    fireEvent.click(screen.getByRole("button", { name: "Back to the campaign" }));
    expect(onClose).toHaveBeenCalledWith(true);
  });
});

describe("Send WhatsApp on the campaign page", () => {
  it("opens the WhatsApp builder from inside the page", async () => {
    const { CampaignRegistrations } = await import("@/components/admin/registrations/CampaignRegistrations");
    const row = {
      id: "r1", refId: null, name: "Person 1", email: "p1@x.com", pageId: "pg1", pageTitle: "TMC Batch 1",
      optionLabel: "Full course", mode: "live", region: "PK", expectedAmount: 100, amountReceived: null, currency: "PKR",
      status: "paid", agentId: null, agentName: null, groupSize: 1, isTest: false, createdAt: "2026-10-01T10:00:00Z", statusChangedAt: null,
    };
    render(
      <CampaignRegistrations
        pageId="pg1" pageTitle="TMC Batch 1" rows={[row] as never} total={1} pageSize={25}
        counts={{ all: 1, pending: 0, reserved: 0, underpaid: 0, paid: 1, free: 0 }}
        basePath="/x" detailHrefBase="/y" filters={{ pageId: "pg1" }} query={{}}
        filterOptions={{ regions: [], optionLabels: [] }}
      />,
    );
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getByRole("button", { name: "Send WhatsApp" }));
    expect((await screen.findByRole("heading", { level: 1, name: /WhatsApp to the selected registrations/ })).textContent).toContain("TMC Batch 1");
    expect(screen.queryByLabelText("Subject")).toBeNull();
  });
});
