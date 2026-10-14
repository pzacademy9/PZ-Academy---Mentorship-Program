import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

vi.mock("server-only", () => ({}));
const pages = vi.hoisted(() => ({ getPublishedLandingPage: vi.fn() }));
vi.mock("@/lib/data/landing-pages", () => pages);
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));

import { SuccessScreen, type SuccessScreenProps } from "@/components/landing/registration/SuccessScreen";
import { StatusLookup } from "@/components/landing/registration/StatusLookup";
import { RegistrationFlow } from "@/components/landing/registration/RegistrationFlow";
import { successCopy, statusView, lookupMessage } from "@/lib/landing/registration/outcome-copy";
import { initialState } from "@/lib/landing/registration/form-state";
import { emptyContent, updateRegistration } from "@/lib/landing/content";
import StatusPage from "@/app/e/[slug]/status/page";
import type { RegisterSuccess } from "@/components/landing/registration/types";
import { ppcConfig, webinarConfig, publicConfig } from "./fixtures/registration-fixtures";

const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

const paid: RegisterSuccess = {
  refId: "PZA-PPC-042", total: 4800, currency: "PKR",
  waGroups: [{ label: "Full Course", url: "https://chat.whatsapp.com/IGAWff910JFIzNCw42qGle" }],
  verifyMessage: "Hi PZ Academy! I just registered for PPC Batch 3 and submitted my payment voucher.\n\nRef: PZA-PPC-042",
};
const base: SuccessScreenProps = {
  slug: "ppc", config: ppcConfig, result: paid, lead: { name: "Sara Ali", email: "sara@mail.com" },
  mode: "live", isFree: false, testMode: false, isGuest: true, onClose: () => {},
};

describe("outcome copy", () => {
  it("paid live: three steps ending with the WhatsApp group", () => {
    const c = successCopy({ mode: "live", isFree: false, email: "a@b.co", eventLabel: "PPC Batch 3", hasGroups: true });
    expect(c.title).toBe("Registration submitted!");
    expect(c.subtitle).toMatch(/under review/i);
    expect(c.steps).toHaveLength(3);
    expect(c.steps[1]).toMatch(/confirmation email/i);
    expect(c.steps[2]).toMatch(/whatsapp group/i);
  });
  it("paid recorded talks about the learning portal and the certificate", () => {
    const c = successCopy({ mode: "recorded", isFree: false, email: "a@b.co", eventLabel: "PPC Batch 3", hasGroups: false });
    expect(c.subtitle).toMatch(/learning portal link/i);
    expect(c.steps[2]).toMatch(/certificate/i);
  });
  it("free names the email the joining details go to", () => {
    const c = successCopy({ mode: "live", isFree: true, email: "a@b.co", eventLabel: "Webinar 20", hasGroups: true });
    expect(c.title).toBe("You're registered!");
    expect(c.subtitle).toBe("You're in for Webinar 20. Your joining details are on their way to a@b.co.");
    expect(c.steps[1]).toMatch(/whatsapp group/i);
  });
  it("maps every status to plain words, and only problems offer WhatsApp", () => {
    expect(statusView("pending")).toMatchObject({ tone: "pending", pill: "Pending", showWhatsApp: false });
    expect(statusView("paid")).toMatchObject({ tone: "ok", pill: "Paid", showWhatsApp: false });
    expect(statusView("free")).toMatchObject({ tone: "ok", pill: "Registered", showWhatsApp: false });
    expect(statusView("underpaid")).toMatchObject({ tone: "attention", pill: "Needs attention", showWhatsApp: true });
    expect(statusView("reserved")).toMatchObject({ tone: "attention", pill: "Needs attention", showWhatsApp: true });
  });
  it("explains lookup failures", () => {
    expect(lookupMessage(404)).toMatch(/couldn't find a registration/i);
    expect(lookupMessage(429)).toMatch(/too many tries/i);
    expect(lookupMessage(0)).toMatch(/couldn't reach our server/i);
    expect(lookupMessage(500)).toMatch(/something went wrong/i);
  });
});

describe("SuccessScreen", () => {
  it("paid live: title, focused heading, reference with copy, steps, group, verify, account and status links", () => {
    const onClose = vi.fn();
    render(<SuccessScreen {...base} onClose={onClose} />);
    const heading = screen.getByRole("heading", { name: "Registration Submitted!" });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByTestId("registration-ref").textContent).toBe("PZA-PPC-042");
    expect(screen.getByRole("button", { name: "Copy reference number" })).toBeTruthy();
    expect(screen.getByText(/amount we will check: pkr 4,800/i)).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    const join = screen.getByRole("link", { name: "Join the Full Course WhatsApp group" });
    expect(join.getAttribute("href")).toBe("https://chat.whatsapp.com/IGAWff910JFIzNCw42qGle");
    expect(join.getAttribute("target")).toBe("_blank");
    expect(join.getAttribute("rel")).toContain("noopener");
    expect(join.className).toContain("text-landing-near-black");
    const verify = screen.getByRole("link", { name: /message us on whatsapp to verify/i }).getAttribute("href")!;
    expect(verify.startsWith("https://wa.me/923700199429?text=")).toBe(true);
    expect(decodeURIComponent(verify.split("text=")[1])).toContain("PZA-PPC-042");
    expect(screen.getByRole("link", { name: "Create account" }).getAttribute("href")).toBe("/register");
    expect(screen.getByText(/create a free pz academy account with sara@mail.com/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /check your registration status/i }).getAttribute("href")).toBe("/e/ppc/status?ref=PZA-PPC-042");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it("recorded: no group buttons and the portal wording", () => {
    render(<SuccessScreen {...base} mode="recorded" result={{ ...paid, waGroups: [] }} />);
    expect(screen.queryByRole("link", { name: /^join the/i })).toBeNull();
    expect(screen.getByText(/learning portal link by email within 24 hours/i)).toBeTruthy();
  });
  it("free: joining details by email, the free group, no amount and no verify button", () => {
    const free: RegisterSuccess = { refId: "PZA-DPT-007", total: 0, currency: "PKR", waGroups: [{ label: "Free Access", url: "https://chat.whatsapp.com/HKo9nNrUCsB84AXPD3QPmH" }], verifyMessage: "" };
    render(<SuccessScreen {...base} config={webinarConfig} result={free} isFree />);
    expect(screen.getByRole("heading", { name: "You're Registered!" })).toBeTruthy();
    expect(screen.getByText(/joining details are on their way to sara@mail.com/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Join the Free Access WhatsApp group" })).toBeTruthy();
    expect(screen.queryByText(/amount we will check/i)).toBeNull();
    expect(screen.queryByRole("link", { name: /message us on whatsapp/i })).toBeNull();
  });
  it("test mode: shows the note and hides the status link, the verify button and the account card", () => {
    render(<SuccessScreen {...base} testMode isGuest={false} result={{ ...paid, refId: "TEST-48213" }} />);
    expect(screen.getByTestId("success-test-banner").textContent).toMatch(/test registration: nothing was saved to the sheet/i);
    expect(screen.getByTestId("registration-ref").textContent).toBe("TEST-48213");
    expect(screen.queryByRole("link", { name: /check your registration status/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /message us on whatsapp/i })).toBeNull();
    expect(screen.queryByRole("link", { name: "Create account" })).toBeNull();
  });
  it("never renders a group link that is not a WhatsApp invite, and hides the account card when logged in", () => {
    render(<SuccessScreen {...base} isGuest={false} result={{ ...paid, waGroups: [{ label: "Bad", url: "https://evil.example/join" }] }} />);
    expect(screen.queryByRole("link", { name: /join the bad/i })).toBeNull();
    expect(screen.queryByRole("link", { name: "Create account" })).toBeNull();
  });
});

describe("RegistrationFlow after a successful submit", () => {
  it("shows the success screen with the reference", () => {
    const form = { ...initialState(ppcConfig, { country: "PK", me: null }), optionKeys: ["full"], lead: { name: "Sara Ali", email: "sara@mail.com", whatsapp: "923001234567", profession: "Pharmacist", city: "Lahore", discovery: "" } };
    render(
      <RegistrationFlow slug="ppc" config={publicConfig(ppcConfig)} me={null} testMode={false} tracking={false}
        form={form} setForm={() => {}} result={paid} setResult={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByTestId("registration-done")).toBeTruthy();
    expect(screen.getByText("PZA-PPC-042")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create account" })).toBeTruthy();
  });
});

describe("StatusLookup", () => {
  const fill = (ref: string, email: string) => {
    fireEvent.change(screen.getByLabelText("Reference number"), { target: { value: ref } });
    fireEvent.change(screen.getByLabelText("Email you registered with"), { target: { value: email } });
    fireEvent.click(screen.getByRole("button", { name: "Check status" }));
  };
  it("prefills the reference from ?ref= but never the email", () => {
    window.history.replaceState({}, "", "/e/ppc/status?ref=pza-ppc-042&email=x@y.co");
    render(<StatusLookup slug="ppc" />);
    expect((screen.getByLabelText("Reference number") as HTMLInputElement).value).toBe("PZA-PPC-042");
    expect((screen.getByLabelText("Email you registered with") as HTMLInputElement).value).toBe("");
  });
  it("checks both fields before calling the server and focuses the first problem", () => {
    render(<StatusLookup slug="ppc" />);
    fireEvent.click(screen.getByRole("button", { name: "Check status" }));
    expect(screen.getByText("Enter your reference number, like PZA-PPC-042.")).toBeTruthy();
    expect(screen.getByText("Enter the email you registered with.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Reference number"));
    expect(fetchMock()).not.toHaveBeenCalled();
  });
  it("shows a pending registration in plain words", async () => {
    fetchMock().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: "pending", name: "Sara Ali", eventLabel: "PPC Batch 3" }) });
    render(<StatusLookup slug="ppc" whatsappNumber="923700199429" />);
    fill("pza-ppc-042", " Sara@Mail.com ");
    expect(await screen.findByText("Pending")).toBeTruthy();
    expect(fetchMock().mock.calls[0][0]).toBe("/api/landing/ppc/status?ref=PZA-PPC-042&email=sara%40mail.com");
    expect(screen.getByText(/hi sara,/i)).toBeTruthy();
    expect(screen.getByText(/ppc batch 3/i)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /message us on whatsapp/i })).toBeNull();
  });
  it("offers WhatsApp when the registration needs attention", async () => {
    fetchMock().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: "underpaid", name: "Sara Ali", eventLabel: "PPC Batch 3" }) });
    render(<StatusLookup slug="ppc" whatsappNumber="923700199429" />);
    fill("PZA-PPC-042", "sara@mail.com");
    expect(await screen.findByText("Needs attention")).toBeTruthy();
    const wa = screen.getByRole("link", { name: /message us on whatsapp/i }).getAttribute("href")!;
    expect(wa.startsWith("https://wa.me/923700199429?text=")).toBe(true);
    expect(decodeURIComponent(wa)).toContain("PZA-PPC-042");
  });
  it("explains a wrong pair, too many tries and being offline", async () => {
    render(<StatusLookup slug="ppc" />);
    fetchMock().mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
    fill("PZA-PPC-042", "sara@mail.com");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/couldn't find a registration/i));
    fetchMock().mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) });
    fireEvent.click(screen.getByRole("button", { name: "Check status" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/too many tries/i));
    fetchMock().mockRejectedValueOnce(new TypeError("offline"));
    fireEvent.click(screen.getByRole("button", { name: "Check status" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/couldn't reach our server/i));
  });
});

describe("/e/[slug]/status page", () => {
  const found = (registration = ppcConfig) => ({
    page: { id: "page-1", slug: "ppc", kind: "course" as const, title: "PPC Batch 3", status: "published" as const },
    content: updateRegistration(emptyContent("course"), registration),
  });
  it("renders the lookup for a published page with the built-in form on", async () => {
    pages.getPublishedLandingPage.mockResolvedValue(found());
    render(await StatusPage({ params: Promise.resolve({ slug: "ppc" }) }));
    expect(screen.getByRole("heading", { level: 1, name: "Check your registration" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /back to ppc batch 3/i }).getAttribute("href")).toBe("/e/ppc");
    expect(screen.getByLabelText("Reference number")).toBeTruthy();
  });
  it("404s for a missing page, but keeps working after the built-in form is switched off", async () => {
    pages.getPublishedLandingPage.mockResolvedValue(null);
    await expect(StatusPage({ params: Promise.resolve({ slug: "gone" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    pages.getPublishedLandingPage.mockResolvedValue(found({ ...ppcConfig, enabled: false }));
    render(await StatusPage({ params: Promise.resolve({ slug: "ppc" }) }));
    expect(screen.getByLabelText("Reference number")).toBeTruthy();
  });
  it("stays static and out of search results", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/app/e/[slug]/status/page.tsx"), "utf8");
    expect(src).not.toMatch(/\bcookies\s*\(/);
    expect(src).not.toMatch(/\bheaders\s*\(/);
    expect(src).toMatch(/export const revalidate = 3600/);
    expect(src).toMatch(/index:\s*false/);
  });
});
