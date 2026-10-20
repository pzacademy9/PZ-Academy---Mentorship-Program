import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

import { MessageBuilder } from "@/components/admin/registrations/MessageBuilder";
import { buildRecipientBody } from "@/components/admin/registrations/builder-body";
import type { CampaignBuilderRequest, CampaignSelection } from "@/components/admin/registrations/CampaignRegistrations";
import { createSendBodySchema, previewBodySchema } from "@/lib/validations/participants";

const PAGE = "11111111-1111-4111-8111-111111111111";
const R1 = "22222222-2222-4222-8222-222222222222";
const R2 = "33333333-3333-4333-8333-333333333333";

const summary = (over: Record<string, unknown> = {}) => ({
  total: 12,
  byStatus: { paid: 9, pending: 2, reserved: 0, underpaid: 1, free: 0 },
  notPaid: 3,
  skipped: { no_email: 1, no_phone: 0, unsubscribed: 2, merged: 0 },
  members: 4,
  ...over,
});
const allPaid = () => summary({ byStatus: { paid: 12, pending: 0, reserved: 0, underpaid: 0, free: 0 }, notPaid: 0 });

const request: CampaignBuilderRequest = {
  pageId: PAGE, pageTitle: "TMC Batch 1", count: 12, selection: { mode: "ids", ids: [R1, R2] },
};

type Call = { url: string; method: string; body: unknown };
let calls: Call[];
let handlers: Record<string, (body: unknown) => { status?: number; json: unknown } | Promise<{ status?: number; json: unknown }>>;

function json(status: number, data: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as Response;
}

beforeEach(() => {
  calls = [];
  handlers = {
    "GET /api/admin/participants/templates": () => ({ json: { templates: [
      { id: "44444444-4444-4444-8444-444444444444", name: "Zoom link", subject: "Your Zoom link", emailBody: "Hi {{first_name}}", whatsappBody: "" },
    ] } }),
    "POST /api/admin/participants/preview": () => ({ json: { summary: summary(), count: 12 } }),
    "POST /api/admin/participants/sends": () => ({ status: 201, json: { sendId: "s1", count: 12 } }),
    "POST /api/admin/participants/sends/s1/run": () => ({ json: { sent: 12, failed: 0, pending: 0 } }),
    "POST /api/admin/participants/sends/s1/retry": () => ({ json: { requeued: 1 } }),
    "POST /api/admin/participants/test": () => ({ json: { ok: true } }),
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    const h = handlers[`${method} ${url}`];
    if (!h) return json(404, { error: "no handler" });
    const r = await h(body);
    return json(r.status ?? 200, r.json);
  }));
});

const count = (url: string, method = "POST") => calls.filter((c) => c.url === url && c.method === method);

async function fill(subject = "Hello", body = "Body text") {
  await screen.findByRole("option", { name: "Zoom link" });
  fireEvent.change(screen.getByLabelText("Subject"), { target: { value: subject } });
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: body } });
}

async function toReview() {
  render(<MessageBuilder channel="email" request={request} onClose={() => {}} />);
  await fill();
  fireEvent.click(screen.getByRole("button", { name: /Review and send/ }));
  await screen.findByText(/You are about to email/);
}

describe("header", () => {
  it("names no number that could disagree with the review screen", async () => {
    render(<MessageBuilder channel="email" request={request} onClose={() => {}} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Email to the selected registrations");
  });
});

describe("review step", () => {
  it("shows the exact not-paid numbers and requires the tick box before Confirm enables", async () => {
    await toReview();
    expect(screen.getByText("3 people have not paid (Pending 2, Underpaid 1). They will get this message too.")).toBeTruthy();
    const confirm = screen.getByRole("button", { name: /Confirm and send/ }) as HTMLButtonElement;
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(confirm.disabled).toBe(true);
    fireEvent.click(box);
    expect(confirm.disabled).toBe(false);
    fireEvent.click(box);
    expect(confirm.disabled).toBe(true);
  });

  it("shows campaign, count, statuses, members and skipped in plain words", async () => {
    await toReview();
    expect(within(screen.getByRole("dialog")).getByText(/TMC Batch 1/)).toBeTruthy();
    expect(within(screen.getByRole("dialog")).getByText("12 people")).toBeTruthy();
    expect(screen.getByText("Paid: 9")).toBeTruthy();
    expect(screen.getByText(/4 of them are course members/)).toBeTruthy();
    expect(screen.getByText(/2 unsubscribed/)).toBeTruthy();
    expect(screen.getByText(/1 with no email/)).toBeTruthy();
  });

  it("has no warning and no tick box when everyone is Paid", async () => {
    handlers["POST /api/admin/participants/preview"] = () => ({ json: { summary: allPaid(), count: 12 } });
    await toReview();
    expect(screen.queryByText(/have not paid/)).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect((screen.getByRole("button", { name: /Confirm and send/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("sending", () => {
  it("create gets expectedCount / expectedNotPaid from the preview and confirmNotPaid from the tick", async () => {
    await toReview();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Confirm and send/ }));
    await screen.findByText(/Sent 12, failed 0/);
    const body = count("/api/admin/participants/sends")[0].body as Record<string, unknown>;
    expect(body).toMatchObject({ pageId: PAGE, channel: "email", ids: [R1, R2], subject: "Hello", body: "Body text", expectedCount: 12, expectedNotPaid: 3, confirmNotPaid: true });
    expect(createSendBodySchema.safeParse(body).success).toBe(true);
  });

  it("sends confirmNotPaid false when everyone is Paid", async () => {
    handlers["POST /api/admin/participants/preview"] = () => ({ json: { summary: allPaid(), count: 12 } });
    await toReview();
    fireEvent.click(screen.getByRole("button", { name: /Confirm and send/ }));
    await screen.findByText(/Sent 12, failed 0/);
    expect(count("/api/admin/participants/sends")[0].body).toMatchObject({ expectedCount: 12, expectedNotPaid: 0, confirmNotPaid: false });
  });

  it("loops run until pending is 0 and shows the final counts", async () => {
    const results = [
      { sent: 8, failed: 0, pending: 4 },
      { sent: 3, failed: 1, pending: 0 },
    ];
    handlers["POST /api/admin/participants/sends/s1/run"] = () => ({ json: results.shift() });
    await toReview();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Confirm and send/ }));
    await screen.findByText("Sent 11, failed 1 (3 left out before sending)");
    expect(count("/api/admin/participants/sends/s1/run")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Resend failed" })).toBeTruthy();
  });

  it("shows progress between runs", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    let n = 0;
    handlers["POST /api/admin/participants/sends/s1/run"] = async () => {
      n += 1;
      if (n === 1) return { json: { sent: 8, failed: 0, pending: 4 } };
      await gate;
      return { json: { sent: 4, failed: 0, pending: 0 } };
    };
    await toReview();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Confirm and send/ }));
    await screen.findByText("Sent 8 of 12");
    release();
    await screen.findByText(/Sent 12, failed 0/);
  });

  it("Resend failed retries then runs again", async () => {
    const results = [{ sent: 11, failed: 1, pending: 0 }, { sent: 1, failed: 0, pending: 0 }];
    handlers["POST /api/admin/participants/sends/s1/run"] = () => ({ json: results.shift() });
    await toReview();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Confirm and send/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Resend failed" }));
    await screen.findByText(/Sent 12, failed 0/);
    expect(count("/api/admin/participants/sends/s1/retry")).toHaveLength(1);
  });

  it("double click sends exactly one create request", async () => {
    await toReview();
    fireEvent.click(screen.getByRole("checkbox"));
    const confirm = screen.getByRole("button", { name: /Confirm and send/ });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await screen.findByText(/Sent 12, failed 0/);
    expect(count("/api/admin/participants/sends")).toHaveLength(1);
  });

  it("409 count_changed shows the message, goes back to review and never runs", async () => {
    handlers["POST /api/admin/participants/sends"] = () => ({ status: 409, json: { error: "x", code: "count_changed", summary: summary() } });
    await toReview();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Confirm and send/ }));
    await screen.findByText("The list changed. Review it again.");
    expect(count("/api/admin/participants/sends/s1/run")).toHaveLength(0);
    expect(count("/api/admin/participants/sends")).toHaveLength(1);
    // Back on the review step with the tick cleared.
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("button", { name: /Confirm and send/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("other 409s show the server message and do not run", async () => {
    handlers["POST /api/admin/participants/sends"] = () => ({ status: 409, json: { error: "This exact message was already sent to this campaign.", code: "duplicate_send" } });
    await toReview();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Confirm and send/ }));
    await screen.findByText("This exact message was already sent to this campaign.");
    expect(count("/api/admin/participants/sends/s1/run")).toHaveLength(0);
  });
});

const tickAndConfirm = () => {
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: /Confirm and send/ }));
};

describe("fix round 1", () => {
  it("shows the server's recorded counts when it has them", async () => {
    handlers["POST /api/admin/participants/sends/s1/run"] = () => ({ json: { sent: 11, failed: 1, pending: 0 } });
    handlers["GET /api/admin/participants/sends/s1"] = () => ({ json: { send: {}, recipients: [
      ...Array.from({ length: 10 }, () => ({ state: "sent" })), { state: "failed" }, { state: "skipped" }, { state: "skipped" },
    ] } });
    await toReview();
    tickAndConfirm();
    await screen.findByText("Sent 10, failed 1, skipped 2");
    expect(screen.getByText(/may already have gone out/)).toBeTruthy();
  });

  it("clears the tick on a second preview", async () => {
    await toReview();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Back to editing" }));
    fireEvent.click(screen.getByRole("button", { name: /Review and send/ }));
    await screen.findByText(/You are about to email/);
    expect(count("/api/admin/participants/preview")).toHaveLength(2);
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });

  it("locks the composer while the review is open and unlocks on Back to editing", async () => {
    await toReview();
    for (const name of ["Template", "Subject", "Message"]) expect((screen.getByLabelText(name) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Portal link/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Back to editing" }));
    expect((screen.getByLabelText("Subject") as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).disabled).toBe(false);
  });

  it("a failed run shows Continue sending, which runs again and never creates again", async () => {
    let n = 0;
    handlers["POST /api/admin/participants/sends/s1/run"] = () => {
      n += 1;
      return n === 1 ? { status: 500, json: { error: "x" } } : { json: { sent: 12, failed: 0, pending: 0 } };
    };
    await toReview();
    tickAndConfirm();
    fireEvent.click(await screen.findByRole("button", { name: "Continue sending" }));
    await screen.findByText(/Sent 12, failed 0/);
    expect(count("/api/admin/participants/sends")).toHaveLength(1);
    expect(count("/api/admin/participants/sends/s1/run")).toHaveLength(2);
  });

  it("a network failure on create says it could not confirm and does not run", async () => {
    handlers["POST /api/admin/participants/sends"] = () => { throw new Error("offline"); };
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (method === "POST" && url === "/api/admin/participants/sends") throw new Error("offline");
      const h = handlers[`${method} ${url}`];
      const r = await h(undefined);
      return json(r.status ?? 200, r.json);
    });
    await toReview();
    tickAndConfirm();
    await screen.findByText("Could not confirm the send started. Check Messages sent before trying again.");
    expect(count("/api/admin/participants/sends/s1/run")).toHaveLength(0);
    expect(count("/api/admin/participants/sends")).toHaveLength(1);
    const confirmBtn = screen.getByRole("button", { name: /Confirm and send/ }) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    fireEvent.click(confirmBtn);
    expect(count("/api/admin/participants/sends")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Back to editing" }));
    fireEvent.click(await screen.findByRole("button", { name: /Review and send/ }));
    fireEvent.click(await screen.findByRole("checkbox"));
    await waitFor(() => expect((screen.getByRole("button", { name: /Confirm and send/ }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("stops after 3 flat runs, shows the paused message, and can be closed", async () => {
    handlers["POST /api/admin/participants/sends/s1/run"] = () => ({ json: { sent: 0, failed: 0, pending: 4 } });
    const onClose = vi.fn();
    render(<MessageBuilder channel="email" request={request} onClose={onClose} pauseMs={0} />);
    await fill();
    fireEvent.click(screen.getByRole("button", { name: /Review and send/ }));
    await screen.findByText(/You are about to email/);
    tickAndConfirm();
    await screen.findByText("Sending paused. Some people are still waiting. Press Continue sending to try again.");
    expect(count("/api/admin/participants/sends/s1/run").length).toBeLessThanOrEqual(5);
    fireEvent.click(screen.getByRole("button", { name: "Back to the campaign" }));
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it("count_changed without a summary re-previews once, shows the new figures, and never creates twice", async () => {
    handlers["POST /api/admin/participants/sends"] = () => ({ status: 409, json: { error: "x", code: "count_changed" } });
    let n = 0;
    handlers["POST /api/admin/participants/preview"] = () => {
      n += 1;
      return { json: { summary: n === 1 ? summary() : summary({ total: 11, notPaid: 2, byStatus: { paid: 9, pending: 2, reserved: 0, underpaid: 0, free: 0 } }), count: 11 } };
    };
    await toReview();
    tickAndConfirm();
    await screen.findByText("The list changed. Review it again.");
    await screen.findByText(/2 people have not paid \(Pending 2\)/);
    expect(count("/api/admin/participants/preview")).toHaveLength(2);
    expect(count("/api/admin/participants/sends")).toHaveLength(1);
  });
});

describe("editor", () => {
  it("picking a template fills subject and body", async () => {
    render(<MessageBuilder channel="email" request={request} onClose={() => {}} />);
    await screen.findByRole("option", { name: "Zoom link" });
    fireEvent.change(screen.getByLabelText("Template"), { target: { value: "44444444-4444-4444-8444-444444444444" } });
    expect((screen.getByLabelText("Subject") as HTMLInputElement).value).toBe("Your Zoom link");
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe("Hi {{first_name}}");
  });

  it("tag chips insert the tag", async () => {
    render(<MessageBuilder channel="email" request={request} onClose={() => {}} />);
    await screen.findByRole("option", { name: "Zoom link" });
    fireEvent.click(screen.getByRole("button", { name: /Portal link/ }));
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toContain("{{ portal_link }}");
  });

  it("Send test to me posts to the test route and says so", async () => {
    render(<MessageBuilder channel="email" request={request} onClose={() => {}} />);
    await fill();
    fireEvent.click(screen.getByRole("button", { name: "Send test to me" }));
    await screen.findByText("Test email sent to you.");
    expect(count("/api/admin/participants/test")[0].body).toEqual({ pageId: PAGE, subject: "Hello", body: "Body text" });
  });

  it("shows the server message when the test fails", async () => {
    handlers["POST /api/admin/participants/test"] = () => ({ status: 502, json: { error: "Test send failed. Check the email settings." } });
    render(<MessageBuilder channel="email" request={request} onClose={() => {}} />);
    await fill();
    fireEvent.click(screen.getByRole("button", { name: "Send test to me" }));
    await screen.findByText("Test send failed. Check the email settings.");
  });

  it("Save as template posts the name, subject and email body", async () => {
    render(<MessageBuilder channel="email" request={request} onClose={() => {}} />);
    await fill();
    fireEvent.click(screen.getByRole("button", { name: /Save as template/ }));
    fireEvent.change(screen.getByLabelText("Template name"), { target: { value: "My one" } });
    handlers["POST /api/admin/participants/templates"] = () => ({ status: 201, json: { template: { id: "55555555-5555-4555-8555-555555555555", name: "My one", subject: "Hello", emailBody: "Body text", whatsappBody: "" } } });
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    await screen.findByRole("option", { name: "My one" });
    expect(count("/api/admin/participants/templates")[0].body).toEqual({ name: "My one", subject: "Hello", emailBody: "Body text", whatsappBody: "" });
  });

  it("Review and send needs a message and does not call preview when empty", async () => {
    render(<MessageBuilder channel="email" request={request} onClose={() => {}} />);
    await screen.findByRole("option", { name: "Zoom link" });
    expect((screen.getByRole("button", { name: /Review and send/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(count("/api/admin/participants/preview")).toHaveLength(0);
  });

  it("Cancel calls onClose and sends nothing", async () => {
    const onClose = vi.fn();
    render(<MessageBuilder channel="email" request={request} onClose={onClose} />);
    await screen.findByRole("option", { name: "Zoom link" });
    fireEvent.click(screen.getByRole("button", { name: /Cancel and back/ }));
    expect(onClose).toHaveBeenCalled();
    expect(count("/api/admin/participants/sends")).toHaveLength(0);
  });

  it("Back to editing closes the review without sending", async () => {
    await toReview();
    fireEvent.click(screen.getByRole("button", { name: "Back to editing" }));
    await waitFor(() => expect(screen.queryByText(/You are about to email/)).toBeNull());
    expect(count("/api/admin/participants/sends")).toHaveLength(0);
  });
});

describe("request body from a real CampaignSelection", () => {
  it("ids mode passes the schema", () => {
    const sel: CampaignSelection = { mode: "ids", ids: [R1, R2] };
    const body = { pageId: PAGE, channel: "email", ...buildRecipientBody(PAGE, sel) };
    expect(previewBodySchema.safeParse(body).success).toBe(true);
  });

  it("filter mode drops page, empty values and passes the schema", () => {
    const sel: CampaignSelection = {
      mode: "filter",
      filters: { pageId: PAGE, status: "paid", q: "", region: "PK", page: 3 },
    };
    const r = buildRecipientBody(PAGE, sel);
    expect(r).toEqual({ filters: { pageId: PAGE, status: "paid", region: "PK" } });
    expect(previewBodySchema.safeParse({ pageId: PAGE, channel: "email", ...r }).success).toBe(true);
    const full = { pageId: PAGE, channel: "email", ...r, subject: "s", body: "b", expectedCount: 1, expectedNotPaid: 0, confirmNotPaid: false };
    expect(createSendBodySchema.safeParse(full).success).toBe(true);
  });

  it("filter mode pins the filter to this campaign even if pageId is missing", () => {
    const r = buildRecipientBody(PAGE, { mode: "filter", filters: { status: "all" } });
    expect(r).toEqual({ filters: { pageId: PAGE, status: "all" } });
  });
});
