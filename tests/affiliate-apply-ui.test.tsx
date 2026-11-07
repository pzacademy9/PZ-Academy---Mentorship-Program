import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
const policies = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/data/site-terms", () => ({ getAffiliatePolicies: policies.get }));

import { ApplyForm } from "@/components/affiliates/ApplyForm";
import ApplyPage, { metadata } from "@/app/affiliate-apply/page";

const reply = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });
const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;

function fill(label: RegExp | string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function fillAll() {
  fill(/^Full name/i, "Test Person");
  fill(/^Email/i, "test.person@example.com");
  fill(/^WhatsApp/i, "+923001234567");
  fill(/^City/i, "Lahore");
  fill(/^Country/i, "Pakistan");
  fill(/^School, university or workplace/i, "Test University");
  fill(/^Field of study or work/i, "PharmD");
  fill(/^Why do you want to join/i, "I help my class find good courses.");
  fireEvent.click(screen.getByLabelText(/I have read and agree/i));
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  policies.get.mockReset();
});

describe("ApplyForm", () => {
  it("uses the approved copy and never the banned words", () => {
    render(<ApplyForm />);
    const text = document.body.textContent ?? "";
    for (const s of ["Affiliate Programme", "Join our affiliate team", "Earn commission when students you refer pay for a course.", "8% to 10% of what your student pays, once payment is confirmed", "Students get 10% off with your code", "PKR 3,500, paid by JazzCash, Easypaisa or bank", "We review every application. If you are accepted, your affiliate code and private link are sent to your email.", "We use this only to review your application and contact you."])
      expect(text).toContain(s);
    expect(text).not.toMatch(/official|ambassador|encrypted|48h|leadership|instant|weekly|raast|tiers|15% to 25%/i);
  });
  it("links the three documents in the tick", () => {
    render(<ApplyForm />);
    expect(screen.getByRole("link", { name: "Affiliate Terms" }).getAttribute("href")).toBe("/affiliate-apply/terms");
    expect(screen.getByRole("link", { name: "Affiliate Rules" }).getAttribute("href")).toBe("/affiliate-apply/rules");
    expect(screen.getByRole("link", { name: "Privacy Policy" }).getAttribute("href")).toBe("/affiliate-apply/privacy");
  });
  it("shows an inline error for a bad email and does not send", async () => {
    render(<ApplyForm />);
    fillAll();
    fill(/^Email/i, "nope");
    fireEvent.click(screen.getByRole("button", { name: /submit application/i }));
    expect(await screen.findByText(/valid email/i)).toBeTruthy();
    expect(fetchMock()).not.toHaveBeenCalled();
  });
  it("disables submit while sending and shows the success text after a 201", async () => {
    let done: (v: unknown) => void = () => {};
    fetchMock().mockReturnValue(new Promise((r) => (done = r)));
    render(<ApplyForm />);
    fillAll();
    const btn = screen.getByRole("button", { name: /submit application/i }) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(btn.disabled).toBe(true));
    done(reply(201, { ok: true }));
    expect(await screen.findByText("Thanks, we have your application")).toBeTruthy();
    expect(fetchMock().mock.calls[0][0]).toBe("/api/affiliates/apply");
  });
  it("shows the server message on a duplicate", async () => {
    fetchMock().mockResolvedValue(reply(409, { error: "You have already applied with this email." }));
    render(<ApplyForm />);
    fillAll();
    fireEvent.click(screen.getByRole("button", { name: /submit application/i }));
    expect(await screen.findByText("You have already applied with this email.")).toBeTruthy();
  });
  it("sends the honeypot empty", async () => {
    fetchMock().mockResolvedValue(reply(201, { ok: true }));
    render(<ApplyForm />);
    fillAll();
    fireEvent.click(screen.getByRole("button", { name: /submit application/i }));
    await waitFor(() => expect(fetchMock()).toHaveBeenCalled());
    expect(JSON.parse(fetchMock().mock.calls[0][1].body).website).toBe("");
  });
});

describe("affiliate-apply page", () => {
  it("is noindex, nofollow", () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });
  it("shows the form when the documents are ready", async () => {
    policies.get.mockResolvedValue({ ready: true, version: "v" });
    const o = renderToStaticMarkup(await ApplyPage());
    expect(o).toContain("Join our affiliate team");
  });
  it("shows 'Applications are not open yet' instead of the form while not ready", async () => {
    policies.get.mockResolvedValue({ ready: false, version: "" });
    const o = renderToStaticMarkup(await ApplyPage());
    expect(o).toContain("Applications are not open yet");
    expect(o).not.toContain("Submit application");
  });
  it("shows the same notice when reading the documents fails", async () => {
    policies.get.mockRejectedValue(new Error("db"));
    expect(renderToStaticMarkup(await ApplyPage())).toContain("Applications are not open yet");
  });
});
