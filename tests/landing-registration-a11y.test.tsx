import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import fs from "node:fs";
import path from "node:path";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/landing/compress-image", () => ({ compressImage: async (f: File) => f }));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

import { RegistrationLauncher } from "@/components/landing/registration/RegistrationLauncher";
import { RegistrationHost } from "@/components/landing/registration/RegistrationHost";
import { RegistrationFlow } from "@/components/landing/registration/RegistrationFlow";
import { SuccessScreen } from "@/components/landing/registration/SuccessScreen";
import { StatusLookup } from "@/components/landing/registration/StatusLookup";
import { RegistrationSetup } from "@/components/admin/landing/registration/RegistrationSetup";
import { initialState, type FormState } from "@/lib/landing/registration/form-state";
import { computeQuote } from "@/lib/landing/registration/pricing";
import type { RegisterSuccess } from "@/components/landing/registration/types";
import { ACCOUNTS, ppcConfig, publicConfig } from "./fixtures/registration-fixtures";

const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/config")) return { ok: true, status: 200, json: async () => publicConfig(ppcConfig) };
    if (url === "/api/landing/me") return { ok: true, json: async () => null };
    if (url.endsWith("/quote")) {
      const b = JSON.parse(String(init!.body));
      const quote = computeQuote({ config: ppcConfig, ...b, now: new Date() });
      const promo = b.promoCode === "PZ10" && quote.ok ? { ok: true, promoId: "p1", code: "PZ10", discount: 480, total: quote.total - 480 } : undefined;
      return { ok: true, json: async () => ({ quote, ...(promo ? { promo } : {}) }) };
    }
    if (url.includes("/status?")) return { ok: true, status: 200, json: async () => ({ status: "underpaid", name: "Sara Ali", eventLabel: "PPC Batch 3" }) };
    return { ok: true, json: async () => ({}) };
  }));
});
afterEach(() => vi.unstubAllGlobals());

function Harness({ initial, professions }: { initial: FormState; professions?: string[] }) {
  const [form, setForm] = useState(initial);
  const [result, setResult] = useState<RegisterSuccess | null>(null);
  return (
    <RegistrationFlow slug="ppc" config={publicConfig(professions ? { ...ppcConfig, professions } : ppcConfig)} me={null} testMode={false} tracking={false}
      form={form} setForm={setForm} result={result} setResult={setResult} onClose={() => {}} />
  );
}
const lead = { name: "Sara Ali", email: "sara@mail.com", whatsapp: "923001234567", profession: "Pharmacist", city: "Lahore", discovery: "" };
const start = (over: Partial<FormState> = {}): FormState => ({ ...initialState(ppcConfig, { country: "PK", me: null }), optionKeys: ["full"], ...over });

/** Every visible button and link must be at least 44 px tall (WCAG 2.5.8 / Apple HIG) on phones. */
const TALL = /(^|\s|!)(min-h-1[12]|h-1[12]|size-1[12])(\s|$)/;
function expectTouchTargets(root: HTMLElement) {
  const els = Array.from(root.querySelectorAll<HTMLElement>("button, a[href]")).filter((el) => !el.closest("[aria-hidden='true']"));
  expect(els.length).toBeGreaterThan(0);
  for (const el of els) expect(el.className, el.getAttribute("aria-label") ?? el.textContent ?? "").toMatch(TALL);
}

describe("keyboard and focus", () => {
  it("focus goes into the form when it opens and back to the Register button when it closes", async () => {
    render(<><RegistrationLauncher className="x"><span>Register now</span></RegistrationLauncher><RegistrationHost slug="ppc" tracking={false} /></>);
    const button = screen.getByRole("button", { name: "Register now" });
    button.focus();
    fireEvent.click(button);
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(button));
  });
  it("Continue moves focus to the first field that needs fixing", () => {
    render(<Harness initial={start({ step: "details" })} />);
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(document.activeElement).toBe(screen.getByLabelText("Full name"));
  });
  it("finished steps are announced as done", () => {
    render(<Harness initial={start({ step: "pay", lead })} />);
    const steps = within(screen.getByTestId("registration-step-indicator")).getAllByRole("listitem");
    expect(steps[0].textContent).toMatch(/\(done\)/);
    expect(steps[1].textContent).toMatch(/\(done\)/);
    expect(steps[2].textContent).not.toMatch(/\(done\)/);
    expect(steps[2].getAttribute("aria-current")).toBe("step");
  });
});

describe("touch targets", () => {
  it("pay step, with an applied promo and an account open", async () => {
    const { container } = render(<Harness initial={start({ step: "pay", lead, paymentMethod: "faysal", promoInput: "PZ10", promoApplied: "PZ10" })} />);
    expect(await screen.findByRole("button", { name: "Remove promo code" })).toBeTruthy();
    expectTouchTargets(container);
  });
  it("upload step, with a receipt chosen", () => {
    const voucher = new File(["%PDF"], "receipt.pdf", { type: "application/pdf" });
    const { container } = render(<Harness initial={start({ step: "upload", lead, paymentMethod: "faysal", voucher })} />);
    expect(screen.getByRole("button", { name: "Remove receipt" })).toBeTruthy();
    expectTouchTargets(container);
  });
  it("success screen and status lookup", async () => {
    const result: RegisterSuccess = { refId: "PZA-PPC-042", total: 4800, currency: "PKR", waGroups: [{ label: "Full Course", url: "https://chat.whatsapp.com/IGAWff910JFIzNCw42qGle" }], verifyMessage: "Hi" };
    const a = render(<SuccessScreen slug="ppc" config={ppcConfig} result={result} lead={{ name: "Sara Ali", email: "sara@mail.com" }} mode="live" isFree={false} testMode={false} isGuest onClose={() => {}} />);
    expectTouchTargets(a.container);
    a.unmount();
    const b = render(<StatusLookup slug="ppc" whatsappNumber="923700199429" />);
    fireEvent.change(screen.getByLabelText("Reference number"), { target: { value: "PZA-PPC-042" } });
    fireEvent.change(screen.getByLabelText("Email you registered with"), { target: { value: "sara@mail.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Check status" }));
    expect(await screen.findByRole("link", { name: /message us on whatsapp/i })).toBeTruthy();
    expectTouchTargets(b.container);
  });
});

describe("admin stepper", () => {
  it("a step's problem count is read out in words", () => {
    const bad = { ...ppcConfig, regions: ppcConfig.regions.map((g) => (g.key === "KSA" ? { ...g, accountKeys: [] } : g)) };
    render(<RegistrationSetup registration={bad} accounts={ACCOUNTS} step="accounts" onStep={() => {}} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /^5 payment accounts 1 problem$/i })).toBeTruthy();
  });
});

describe("reduced motion", () => {
  const dir = path.join(process.cwd(), "src/components/landing/registration");
  it("every animation class in the public registration UI is behind motion-safe", () => {
    const MOTION = /[\w:[\]=!/-]*(?:animate-(?!none)[\w-]+|slide-(?:in|out)[\w-]*|fade-(?:in|out)[\w-]*|zoom-(?:in|out)[\w-]*|\bscale-\d+)/g;
    for (const f of fs.readdirSync(dir).filter((n) => /\.(tsx|ts)$/.test(n))) {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      for (const token of src.match(MOTION) ?? []) {
        expect(token.includes("motion-safe:") || token.includes("motion-reduce:"), `${f}: ${token}`).toBe(true);
      }
    }
  });
  it("the global stylesheet switches animations off when the OS asks", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toMatch(/animation-duration:\s*0\.01ms !important/);
  });
});

describe("colour contrast of the landing palette (WCAG AA, 4.5:1 for text)", () => {
  function landingColors(): Record<string, string> {
    const src = fs.readFileSync(path.join(process.cwd(), "tailwind.config.ts"), "utf8");
    const block = /\blanding:\s*\{([\s\S]*?)\n\s*\}/.exec(src);
    if (!block) throw new Error("landing colour group not found in tailwind.config.ts");
    const out: Record<string, string> = {};
    for (const m of Array.from(block[1].matchAll(/'?([a-z-]+)'?\s*:\s*'(#[0-9A-Fa-f]{6})'/g))) out[m[1]] = m[2];
    return out;
  }
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const c = landingColors();
  it.each([
    ["on-surface", "surface"], ["on-surface", "surface-container-lowest"],
    ["muted", "surface"], ["muted", "surface-container-lowest"], ["muted", "surface-container-low"], ["muted", "mint-light"],
    ["near-black", "surface-container-low"], ["near-black", "mint-light"],
    ["primary", "surface"], ["primary", "surface-container-lowest"], ["primary", "mint-light"],
    ["deep", "surface-container-lowest"], ["deep", "mint-light"],
    ["on-primary", "primary"], ["on-primary", "primary-hover"],
    ["near-black", "whatsapp"], ["near-black", "whatsapp-hover"],
  ])("%s text on %s", (fg, bg) => {
    expect(c[fg], fg).toBeTruthy();
    expect(c[bg], bg).toBeTruthy();
    expect(ratio(c[fg], c[bg])).toBeGreaterThanOrEqual(4.5);
  });
  it("white on the WhatsApp green would fail, which is why the Join buttons use near-black text", () => {
    expect(ratio(c["on-primary"], c.whatsapp)).toBeLessThan(4.5);
  });
});

describe("review follow-ups", () => {
  it("copy buttons name the account as well as the row", async () => {
    render(<Harness initial={start({ step: "pay", lead, paymentMethod: "faysal" })} />);
    const names = screen.getAllByRole("button", { name: /^copy /i }).map((b) => b.getAttribute("aria-label"));
    expect(new Set(names).size).toBe(names.length);
  });
  it("free-text profession is capped at the schema length", () => {
    render(<Harness initial={start({ step: "details" })} professions={[]} />);
    const input = screen.getByLabelText("Profession");
    expect(input.tagName).toBe("INPUT");
    expect((input as HTMLInputElement).maxLength).toBe(120);
  });
  it("status result resets when the reference changes and is not a live region", async () => {
    render(<StatusLookup slug="ppc" whatsappNumber="923700199429" />);
    fireEvent.change(screen.getByLabelText("Reference number"), { target: { value: "PZA-PPC-042" } });
    fireEvent.change(screen.getByLabelText("Email you registered with"), { target: { value: "sara@mail.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Check status" }));
    await screen.findByRole("link", { name: /message us on whatsapp/i });
    expect(document.querySelector("[aria-live]")).toBeNull();
    fireEvent.change(screen.getByLabelText("Reference number"), { target: { value: "PZA-PPC-043" } });
    expect(screen.queryByRole("link", { name: /message us on whatsapp/i })).toBeNull();
  });
});
