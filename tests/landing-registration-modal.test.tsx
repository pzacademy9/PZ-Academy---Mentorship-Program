import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { useState } from "react";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/landing/compress-image", () => ({ compressImage: async (f: File) => f }));
const pixel = vi.hoisted(() => ({ track: vi.fn((..._a: unknown[]) => "evt") }));
vi.mock("@/components/landing/registration/pixel", async (orig) => ({ ...(await orig<object>()), track: pixel.track }));
const funnel = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/components/landing/registration/funnel", async (orig) => ({ ...(await orig<object>()), sendFunnelEvent: funnel.send }));

import { RegistrationFlow } from "@/components/landing/registration/RegistrationFlow";
import { RegistrationModal } from "@/components/landing/registration/RegistrationModal";
import { CopyButton } from "@/components/landing/registration/CopyButton";
import { initialState, MAX_VOUCHER_BYTES, type FormState } from "@/lib/landing/registration/form-state";
import { computeQuote } from "@/lib/landing/registration/pricing";
import type { RegisterSuccess, MeProfile } from "@/components/landing/registration/types";
import type { RegistrationConfig } from "@/lib/landing/registration/config";
import { ppcConfig, webinarConfig, publicConfig } from "./fixtures/registration-fixtures";

const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;
let registerResponse: { status: number; body: unknown } | "offline";
let lastRegisterForm: FormData | null;
let registerCalls = 0;

function installFetch(cfg: RegistrationConfig) {
  fetchMock().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/quote")) {
      const b = JSON.parse(String(init!.body));
      const quote = computeQuote({ config: cfg, ...b, now: new Date() });
      const promo = b.promoCode === "PZ10" && quote.ok ? { ok: true, promoId: "p1", code: "PZ10", discount: Math.round(quote.total / 10), total: quote.total - Math.round(quote.total / 10) }
        : b.promoCode === "OLD" ? { ok: false, reason: "expired" } : undefined;
      return { ok: true, json: async () => ({ quote, ...(promo ? { promo } : {}) }) };
    }
    if (url.endsWith("/register")) {
      registerCalls += 1;
      lastRegisterForm = init!.body as FormData;
      if (registerResponse === "offline") throw new TypeError("Failed to fetch");
      const r = registerResponse;
      return { ok: r.status < 300, status: r.status, json: async () => r.body };
    }
    if (url === "/api/landing/me") return { ok: true, json: async () => null };
    if (url.endsWith("/config")) return { ok: true, status: 200, json: async () => publicConfig(cfg) };
    return { ok: true, json: async () => ({}) };
  });
}

const success: RegisterSuccess = { refId: "PZA-PPC-042", total: 4800, currency: "PKR", waGroups: [{ label: "Full Course", url: "https://chat.whatsapp.com/IGAWff910JFIzNCw42qGle" }], verifyMessage: "Hi PZ Academy! I just registered for PPC Batch 3." };

function Harness({ cfg = ppcConfig, me = null, testMode = false, country = "PK" }: { cfg?: RegistrationConfig; me?: MeProfile | null; testMode?: boolean; country?: string }) {
  const pc = publicConfig(cfg, { country });
  const [form, setForm] = useState<FormState>(() => initialState(cfg, { country, me }));
  const [result, setResult] = useState<RegisterSuccess | null>(null);
  return <RegistrationFlow slug="ppc" config={pc} me={me} testMode={testMode} tracking form={form} setForm={setForm} result={result} setResult={setResult} onClose={() => {}} />;
}

const cont = () => fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
function fillLead() {
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Sara Ali" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "Sara@Mail.com" } });
  fireEvent.change(screen.getByLabelText("WhatsApp number"), { target: { value: "923001234567" } });
  fireEvent.change(screen.getByLabelText("Profession"), { target: { value: "Pharmacist" } });
  fireEvent.change(screen.getByLabelText("City / Country"), { target: { value: "Lahore" } });
}
const payload = () => JSON.parse(String(lastRegisterForm!.get("payload")));

/** Walks a guest through choose, details and pay so a test can start on the upload step. */
function toUploadStep() {
  fireEvent.click(screen.getByRole("radio", { name: /full course/i }));
  cont(); fillLead(); cont();
  fireEvent.click(screen.getByRole("radio", { name: /faysal bank/i }));
  cont();
}

beforeEach(() => {
  // Early Bird (ends 2026-10-15T19:00Z) is still on: PKR Full Course individual = 4,800.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-13T10:00:00Z"));
  vi.stubGlobal("fetch", vi.fn());
  registerResponse = { status: 201, body: success };
  lastRegisterForm = null;
  registerCalls = 0;
  pixel.track.mockClear();
  funnel.send.mockClear();
  installFetch(ppcConfig);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("RegistrationFlow (paid, guest)", () => {
  it("walks choose → details → pay → upload and submits the right payload with the voucher", async () => {
    render(<Harness />);
    expect(within(screen.getByTestId("registration-step-indicator")).getAllByRole("listitem")).toHaveLength(4);
    cont();
    expect(screen.getByText("Choose what you want to join.")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /full course/i }));
    await waitFor(() => expect(screen.getByTestId("order-total").textContent).toMatch(/PKR/));
    cont();
    fillLead();
    cont();
    expect(screen.getByRole("heading", { name: /pay/i })).toBeTruthy();
    expect(pixel.track).toHaveBeenCalledWith("InitiateCheckout", expect.any(Object), expect.any(String));
    fireEvent.click(screen.getByRole("radio", { name: /faysal bank/i }));
    cont();
    const file = new File(["%PDF-1.4"], "receipt.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/payment screenshot or receipt/i), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText("receipt.pdf")).toBeTruthy());
    fireEvent.click(screen.getByRole("checkbox", { name: /i have read and understood/i }));
    fireEvent.click(screen.getByRole("button", { name: /complete registration/i }));
    await waitFor(() => expect(screen.getByTestId("registration-done")).toBeTruthy());
    expect(screen.getByText("PZA-PPC-042")).toBeTruthy();
    const p = payload();
    expect(p).toMatchObject({ regionKey: "PK", mode: "live", optionKeys: ["full"], tierKey: "individual", groupSize: 1, paymentMethod: "faysal", promoCode: "", honeypot: "", testMode: false, members: [] });
    expect(p.lead).toMatchObject({ email: "sara@mail.com", consent: true, city: "Lahore" });
    expect(typeof p.attribution.eventId).toBe("string");
    expect(p.attribution).toHaveProperty("fbp");
    expect(p.attribution).toHaveProperty("fbc");
    expect((lastRegisterForm!.get("voucher") as File).name).toBe("receipt.pdf");
    expect(pixel.track).toHaveBeenCalledWith("CompleteRegistration", expect.objectContaining({ value: 4800, currency: "PKR" }), p.attribution.eventId);
    // The Join buttons come from the reply only.
    expect(screen.getByRole("link", { name: /join the full course whatsapp group/i }).getAttribute("href")).toBe("https://chat.whatsapp.com/IGAWff910JFIzNCw42qGle");
}, 20000);

  it("choosing every module switches to the package and says so", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("checkbox", { name: /module 1/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /module 2/i }));
    expect((screen.getByRole("radio", { name: /full course/i }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("status").textContent).toMatch(/switched to full course/i);
  });

  it("a group of 3 asks for two members and validates them", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: /full course/i }));
    fireEvent.click(screen.getByRole("radio", { name: /group of 3/i }));
    cont();
    fillLead();
    cont();
    expect(screen.getByText("Enter member 2's full name.")).toBeTruthy();
    expect(screen.getByText("Enter member 3's full name.")).toBeTruthy();
    expect(screen.getByText("Choose member 2's profession.")).toBeTruthy();
    for (const [n, email] of [[2, "sara@mail.com"], [3, "zed@mail.com"]] as const) {
      fireEvent.change(screen.getByLabelText(`Member ${n} full name`), { target: { value: `Member ${n}` } });
      fireEvent.change(screen.getByLabelText(`Member ${n} email`), { target: { value: email } });
      fireEvent.change(screen.getByLabelText(`Member ${n} WhatsApp number`), { target: { value: "923001112222" } });
      fireEvent.change(screen.getByLabelText(`Member ${n} profession`), { target: { value: "Nurse" } });
    }
    cont();
    expect(screen.getByText("Each person needs their own email address.")).toBeTruthy();
  });

  it("shows only the chosen country's accounts on the pay step and copies a value", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<Harness country="AE" />);
    fireEvent.click(screen.getByRole("radio", { name: /full course/i }));
    cont(); fillLead(); cont();
    expect(screen.getByRole("radio", { name: /mashreq bank/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /paypal/i })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /faysal bank/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Copy IBAN" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("AE800330000019101064212"));
    expect(await screen.findByText(/copied/i)).toBeTruthy();
  });

  it("applies a valid promo code and explains an expired one", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: /full course/i }));
    cont(); fillLead(); cont();
    const box = screen.getByLabelText("Promo code");
    fireEvent.change(box, { target: { value: "old" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/expired/i));
    fireEvent.change(box, { target: { value: "pz10" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(screen.getByText(/off applied/i)).toBeTruthy());
    expect(screen.getByTestId("order-total").textContent).toMatch(/4,320/);
  });

  it("a server field error sends the person back to that field's step", async () => {
    registerResponse = { status: 400, body: { error: "Use a different email address.", field: "lead.email" } };
    render(<Harness />);
    toUploadStep();
    fireEvent.change(screen.getByLabelText(/payment screenshot or receipt/i), { target: { files: [new File(["x"], "r.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(screen.getByText("r.pdf")).toBeTruthy());
    fireEvent.click(screen.getByRole("checkbox", { name: /i have read and understood/i }));
    fireEvent.click(screen.getByRole("button", { name: /complete registration/i }));
    await waitFor(() => expect(screen.getByText("Use a different email address.")).toBeTruthy());
    expect((screen.getByLabelText("Email") as HTMLInputElement).getAttribute("aria-invalid")).toBe("true");
  });

  it("an open registration (409 on the email) lands on the email field", async () => {
    registerResponse = { status: 409, body: { error: "This email already has a registration for this event that is waiting for payment.", field: "lead.email" } };
    render(<Harness />);
    toUploadStep();
    fireEvent.change(screen.getByLabelText(/payment screenshot or receipt/i), { target: { files: [new File(["x"], "r.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(screen.getByText("r.pdf")).toBeTruthy());
    fireEvent.click(screen.getByRole("checkbox", { name: /i have read and understood/i }));
    fireEvent.click(screen.getByRole("button", { name: /complete registration/i }));
    await waitFor(() => expect(screen.getByText(/waiting for payment/i)).toBeTruthy());
    expect((screen.getByLabelText("Email") as HTMLInputElement).getAttribute("aria-invalid")).toBe("true");
  });

  it("a promo that ran out at submit (409 promoCode) goes back to the pay step", async () => {
    registerResponse = { status: 409, body: { error: "This promo code has been fully used.", field: "promoCode" } };
    render(<Harness />);
    toUploadStep();
    fireEvent.change(screen.getByLabelText(/payment screenshot or receipt/i), { target: { files: [new File(["x"], "r.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(screen.getByText("r.pdf")).toBeTruthy());
    fireEvent.click(screen.getByRole("checkbox", { name: /i have read and understood/i }));
    fireEvent.click(screen.getByRole("button", { name: /complete registration/i }));
    await waitFor(() => expect(screen.getByLabelText("Promo code")).toBeTruthy());
    expect(screen.getByText("This promo code has been fully used.")).toBeTruthy();
  });

  for (const [name, resp, text] of [
    ["rate limited", { status: 429, body: {} }, /too many attempts/i],
    ["full", { status: 409, body: { error: "Sorry, all seats are taken." } }, /all seats are taken/i],
    ["offline", "offline", /couldn't reach our server/i],
  ] as const) {
    it(`keeps every answer and explains when the server says ${name}`, async () => {
      registerResponse = resp as typeof registerResponse;
      render(<Harness />);
      toUploadStep();
      fireEvent.change(screen.getByLabelText(/payment screenshot or receipt/i), { target: { files: [new File(["x"], "r.pdf", { type: "application/pdf" })] } });
      await waitFor(() => expect(screen.getByText("r.pdf")).toBeTruthy());
      fireEvent.click(screen.getByRole("checkbox", { name: /i have read and understood/i }));
      fireEvent.click(screen.getByRole("button", { name: /complete registration/i }));
      await waitFor(() => expect(screen.getByTestId("registration-form-error").textContent).toMatch(text));
      expect(screen.getByText("r.pdf")).toBeTruthy();
      expect((screen.getByRole("button", { name: /complete registration/i }) as HTMLButtonElement).disabled).toBe(false);
    });
  }

  it("rejects a wrong file type or an over-4-MB file in the modal, before any upload", async () => {
    render(<Harness />);
    toUploadStep();
    const input = screen.getByLabelText(/payment screenshot or receipt/i);
    fireEvent.change(input, { target: { files: [new File(["x"], "notes.docx", { type: "application/msdword" })] } });
    await waitFor(() => expect(screen.getByText("Upload a JPG, PNG, WebP or PDF file.")).toBeTruthy());
    expect(screen.queryByText("notes.docx")).toBeNull();
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(MAX_VOUCHER_BYTES + 1)], "huge.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(screen.getByText(/bigger than 4 MB/)).toBeTruthy());
    expect(screen.queryByText("huge.pdf")).toBeNull();
    expect(registerCalls).toBe(0);
  });

  it("hides the honeypot from people and assistive technology, and sends it inside the JSON payload", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: /full course/i }));
    cont();
    const trap = document.querySelector("input[name='website']") as HTMLInputElement;
    expect(trap.tabIndex).toBe(-1);
    expect(trap.closest("[aria-hidden='true']")).not.toBeNull();
    fillLead();
    fireEvent.change(trap, { target: { value: "bot" } });
    cont();
    fireEvent.click(screen.getByRole("radio", { name: /faysal bank/i }));
    cont();
    fireEvent.change(screen.getByLabelText(/payment screenshot or receipt/i), { target: { files: [new File(["x"], "r.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(screen.getByText("r.pdf")).toBeTruthy());
    fireEvent.click(screen.getByRole("checkbox", { name: /i have read and understood/i }));
    fireEvent.click(screen.getByRole("button", { name: /complete registration/i }));
    await waitFor(() => expect(lastRegisterForm).not.toBeNull());
    expect(payload().honeypot).toBe("bot");
    expect(lastRegisterForm!.get("honeypot")).toBeNull();
  });
});

describe("RegistrationFlow (logged in, free, test mode)", () => {
  const me: MeProfile = { name: "Ayesha Khan", email: "ayesha@mail.com", whatsapp: "923001234567", profession: "Pharmacist" };
  it("collapses to Confirm your details with the account email locked", () => {
    render(<Harness me={me} />);
    fireEvent.click(screen.getByRole("radio", { name: /full course/i }));
    cont();
    expect(screen.getByText(/registering as ayesha khan · ayesha@mail.com/i)).toBeTruthy();
    expect(screen.queryByLabelText("Full name")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /change/i }));
    expect((screen.getByLabelText("Email") as HTMLInputElement).readOnly).toBe(true);
  });
  it("the free plan skips pay and upload and submits without a voucher", async () => {
    installFetch(webinarConfig);
    registerResponse = { status: 201, body: { ...success, refId: "PZA-DPT-007", total: 0 } };
    render(<Harness cfg={webinarConfig} />);
    fireEvent.click(screen.getByRole("radio", { name: /free access/i }));
    expect(screen.queryByRole("radio", { name: /group/i })).toBeNull();
    await waitFor(() => expect(within(screen.getByTestId("registration-step-indicator")).getAllByRole("listitem")).toHaveLength(2));
    cont();
    fillLead();
    fireEvent.click(screen.getByRole("checkbox", { name: /i have read and understood/i }));
    fireEvent.click(screen.getByRole("button", { name: /complete registration/i }));
    await waitFor(() => expect(screen.getByText("PZA-DPT-007")).toBeTruthy());
    expect(payload()).toMatchObject({ optionKeys: ["free"], paymentMethod: "", promoCode: "" });
    expect(lastRegisterForm!.get("voucher")).toBeNull();
  });
  it("test mode shows the banner, sends testMode, and fires no Meta or funnel events", async () => {
    installFetch(webinarConfig);
    registerResponse = { status: 201, body: { ...success, refId: "TEST-12345", total: 0 } };
    render(<Harness cfg={webinarConfig} testMode />);
    expect(screen.getByTestId("test-mode-banner").textContent).toMatch(/test mode - nothing real is saved/i);
    fireEvent.click(screen.getByRole("radio", { name: /free access/i }));
    cont(); fillLead();
    fireEvent.click(screen.getByRole("checkbox", { name: /i have read and understood/i }));
    fireEvent.click(screen.getByRole("button", { name: /complete registration/i }));
    await waitFor(() => expect(screen.getByTestId("registration-done")).toBeTruthy());
    expect(payload().testMode).toBe(true);
    expect(screen.getByText("TEST-12345")).toBeTruthy();
    expect(screen.getByTestId("success-test-banner").textContent).toMatch(/nothing was saved to the sheet/i);
    expect(pixel.track).not.toHaveBeenCalled();
    expect(funnel.send).not.toHaveBeenCalled();
  });
});

describe("RegistrationModal", () => {
  it("opens as a labelled dialog, loads the form and closes on Escape", async () => {
    const onClose = vi.fn();
    render(<RegistrationModal slug="ppc" open onClose={onClose} tracking={false} />);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: /register/i })).toBeTruthy();
    await waitFor(() => expect(within(dialog).getByRole("radio", { name: /full course/i })).toBeTruthy());
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
  it("shows a retry when the form cannot load", async () => {
    fetchMock().mockImplementation(async () => { throw new TypeError("offline"); });
    render(<RegistrationModal slug="ppc" open onClose={() => {}} tracking={false} />);
    expect(await screen.findByRole("button", { name: /try again/i })).toBeTruthy();
  });
  it("shows the closed notice for a closed page", async () => {
    fetchMock().mockImplementation(async (url: string) => (url.endsWith("/config") ? { ok: true, status: 200, json: async () => publicConfig(ppcConfig, { status: "closed" }) } : { ok: true, json: async () => null }));
    render(<RegistrationModal slug="ppc" open onClose={() => {}} tracking={false} />);
    expect(await screen.findByText(/registration is closed/i)).toBeTruthy();
  });
});

describe("fix round 1", () => {
  const freeText = { ...ppcConfig, professions: [] as string[] };

  it("a page with no profession list asks for a typed profession (lead and members) and completes", async () => {
    installFetch(freeText);
    render(<Harness cfg={freeText} />);
    fireEvent.click(screen.getByRole("radio", { name: /full course/i }));
    fireEvent.click(screen.getByRole("radio", { name: /group of 3/i }));
    cont();
    expect(screen.getByLabelText("Profession").tagName).toBe("INPUT");
    cont();
    expect(screen.getByText("Enter your profession.")).toBeTruthy();
    expect(screen.getByText("Enter member 2's profession.")).toBeTruthy();
    fillLead();
    for (const [n, email] of [[2, "m2@mail.com"], [3, "m3@mail.com"]] as const) {
      fireEvent.change(screen.getByLabelText(`Member ${n} full name`), { target: { value: `Member ${n}` } });
      fireEvent.change(screen.getByLabelText(`Member ${n} email`), { target: { value: email } });
      fireEvent.change(screen.getByLabelText(`Member ${n} WhatsApp number`), { target: { value: "923001112222" } });
      fireEvent.change(screen.getByLabelText(`Member ${n} profession`), { target: { value: `Dentist ${n}` } });
    }
    fireEvent.change(screen.getByLabelText("Profession"), { target: { value: "Pharmacy owner" } });
    cont();
    fireEvent.click(screen.getByRole("radio", { name: /faysal bank/i }));
    cont();
    fireEvent.change(screen.getByLabelText(/payment screenshot or receipt/i), { target: { files: [new File(["x"], "r.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(screen.getByText("r.pdf")).toBeTruthy());
    fireEvent.click(screen.getByRole("checkbox", { name: /i have read and understood/i }));
    fireEvent.click(screen.getByRole("button", { name: /complete registration/i }));
    await waitFor(() => expect(screen.getByTestId("registration-done")).toBeTruthy());
    expect(payload().lead.profession).toBe("Pharmacy owner");
    expect(payload().members.map((m: { profession: string }) => m.profession)).toEqual(["Dentist 2", "Dentist 3"]);
  }, 20000);

  async function freeSubmit(resp: { status: number; body: unknown }) {
    installFetch(webinarConfig);
    registerResponse = resp;
    render(<Harness cfg={webinarConfig} />);
    fireEvent.click(screen.getByRole("radio", { name: /free access/i }));
    cont(); fillLead();
    fireEvent.click(screen.getByRole("checkbox", { name: /i have read and understood/i }));
    fireEvent.click(screen.getByRole("button", { name: /complete registration/i }));
  }

  for (const field of ["regionKey", "mode", "tierKey", "groupSize", "members", "members.4.name"]) {
    it(`a server error on "${field}" with no place on screen shows in the form-level message`, async () => {
      await freeSubmit({ status: 422, body: { error: `Problem with ${field}.`, field } });
      await waitFor(() => expect(screen.getByTestId("registration-form-error").textContent).toMatch(new RegExp(`Problem with ${field.replace(".", "\.")}`)));
    });
  }

  it("a server error on lead.profession shows on the profession field and moves focus to it", async () => {
    installFetch(freeText);
    registerResponse = { status: 400, body: { error: "Choose a profession.", field: "lead.profession" } };
    render(<Harness cfg={freeText} />);
    fireEvent.click(screen.getByRole("radio", { name: /full course/i }));
    cont(); fillLead(); cont();
    fireEvent.click(screen.getByRole("radio", { name: /faysal bank/i }));
    cont();
    fireEvent.change(screen.getByLabelText(/payment screenshot or receipt/i), { target: { files: [new File(["x"], "r.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(screen.getByText("r.pdf")).toBeTruthy());
    fireEvent.click(screen.getByRole("checkbox", { name: /i have read and understood/i }));
    fireEvent.click(screen.getByRole("button", { name: /complete registration/i }));
    await waitFor(() => expect(screen.getByText("Choose a profession.")).toBeTruthy());
    const input = screen.getByLabelText("Profession");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(input));
  }, 20000);

  it("moves focus to the first invalid field after a failed Continue", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: /full course/i }));
    cont();
    cont();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Full name")));
  });

  it("moves focus to the message when a choice step has an error but no invalid input", async () => {
    render(<Harness />);
    cont();
    await waitFor(() => expect((document.activeElement as HTMLElement).textContent).toBe("Choose what you want to join."));
  });

  describe("CopyButton fallback", () => {
    afterEach(() => { delete (document as { execCommand?: unknown }).execCommand; });
    const noClipboard = () => vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error("no")) } });

    it("does not say Copied when execCommand returns false, and offers a hint", async () => {
      noClipboard();
      (document as { execCommand: unknown }).execCommand = vi.fn(() => false);
      render(<CopyButton value="123" label="Account No." />);
      fireEvent.click(screen.getByRole("button", { name: "Copy Account No." }));
      expect(await screen.findByText(/couldn't copy, press and hold to copy/i)).toBeTruthy();
      expect(screen.queryByText(/copied/i)).toBeNull();
      expect(document.body.querySelector("textarea")).toBeNull();
    });
    it("says Copied when the fallback works, using a textarea inside the button's parent", async () => {
      noClipboard();
      let parent: Element | null = null;
      (document as { execCommand: unknown }).execCommand = vi.fn(() => { parent = document.querySelector("textarea")?.parentElement ?? null; return true; });
      render(<div data-testid="dlg"><CopyButton value="123" label="Account No." /></div>);
      fireEvent.click(screen.getByRole("button", { name: "Copy Account No." }));
      expect(await screen.findByText(/✓ copied/i)).toBeTruthy();
      expect(screen.getByTestId("dlg").contains(parent)).toBe(true);
    });
  });
});
