import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { AffiliatePage } from "@/components/affiliates/AffiliatePage";
import { AffiliateClosed } from "@/components/affiliates/AffiliateClosed";
import type { AffiliatePageModel } from "@/lib/data/affiliate-page";

const model = (over: Partial<AffiliatePageModel> = {}): AffiliatePageModel => ({
  name: "Sara Khan", code: "SK321", team: "Blue", percent: 8, paidCount: 9, toNextStep: 1,
  earnedPkr: 51000, balancePkr: 51000, waiting: [{ currency: "AED", amount: 40 }],
  totals: { views: 124, registered: 18, paid: 9 },
  links: [
    { pageId: "p1", title: "PPC Batch 4", url: "https://pz.test/e/ppc-b4?ref=sk321", views: 62, registered: 9, paid: 5 },
    { pageId: "p2", title: "MDC Batch 3", url: "https://pz.test/e/mdc-b3?ref=sk321", views: 0, registered: 0, paid: 0 },
  ],
  supportWa: "https://wa.me/923155614490",
  ...over,
});

const write = vi.fn().mockResolvedValue(undefined);
beforeEach(() => {
  write.mockClear();
  Object.assign(navigator, { clipboard: { writeText: write } });
});

describe("AffiliatePage: identity and numbers", () => {
  it("greets by name, shows the team and the code", () => {
    render(<AffiliatePage model={model()} />);
    expect(screen.getByRole("heading", { name: "Your affiliate page" })).toBeTruthy();
    expect(screen.getByText("Hello, Sara Khan")).toBeTruthy();
    expect(screen.getByText("Blue team")).toBeTruthy();
    expect(screen.getByText("SK321")).toBeTruthy();
  });
  it("shows no team chip when there is no team", () => {
    render(<AffiliatePage model={model({ team: null })} />);
    expect(screen.queryByText(/ team$/)).toBeNull();
  });
  it("copies the code and says so on the button", async () => {
    render(<AffiliatePage model={model()} />);
    fireEvent.click(screen.getByRole("button", { name: /copy code/i }));
    await waitFor(() => expect(write).toHaveBeenCalledWith("SK321"));
    expect(await screen.findByText("Copied")).toBeTruthy();
  });
  it("shows views, registered and paid", () => {
    render(<AffiliatePage model={model()} />);
    for (const [label, n] of [["Views", "124"], ["Registered", "18"], ["Paid", "9"]]) {
      const tile = screen.getByTestId(`tile-${label.toLowerCase()}`);
      expect(tile.textContent).toContain(label);
      expect(tile.textContent).toContain(n);
    }
  });
});

describe("AffiliatePage: commission", () => {
  it("8% with the progress to 10% and the plain count", () => {
    render(<AffiliatePage model={model()} />);
    expect(screen.getByText("Your commission: 8%")).toBeTruthy();
    expect(screen.getByText("9 of 10 paid participants")).toBeTruthy();
    expect(screen.getByText("1 more paid participant to reach 10%")).toBeTruthy();
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("9");
    expect(bar.getAttribute("aria-valuemax")).toBe("10");
  });
  it("says participants in the plural", () => {
    render(<AffiliatePage model={model({ paidCount: 3, toNextStep: 7 })} />);
    expect(screen.getByText("7 more paid participants to reach 10%")).toBeTruthy();
  });
  it("10% and the certificate once 10 are reached, with no progress bar", () => {
    render(<AffiliatePage model={model({ percent: 10, paidCount: 10, toNextStep: null })} />);
    expect(screen.getByText("Your commission: 10%")).toBeTruthy();
    expect(screen.getByText("Certificate of Achievement unlocked")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText(/more paid participant/)).toBeNull();
  });
  it("a typed (manual) percent shows alone: no progress bar, no certificate before 10", () => {
    render(<AffiliatePage model={model({ percent: 9, paidCount: 3, toNextStep: null })} />);
    expect(screen.getByText("Your commission: 9%")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText(/Certificate/)).toBeNull();
  });
});

describe("AffiliatePage: money", () => {
  it("earned and balance in PKR, with the confirmation note", () => {
    render(<AffiliatePage model={model()} />);
    expect(screen.getByTestId("earned").textContent).toContain("PKR 51,000");
    expect(screen.getByTestId("balance").textContent).toContain("PKR 51,000");
    expect(screen.getByText("Commission is counted after the student's payment is confirmed.")).toBeTruthy();
  });
  it("keeps cents when there are some", () => {
    render(<AffiliatePage model={model({ earnedPkr: 51000.5, balancePkr: 50.25 })} />);
    expect(screen.getByTestId("earned").textContent).toContain("PKR 51,000.5");
    expect(screen.getByTestId("balance").textContent).toContain("PKR 50.25");
  });
  it("shows foreign commission waiting to be converted, one line, every currency", () => {
    render(<AffiliatePage model={model({ waiting: [{ currency: "AED", amount: 40 }, { currency: "SAR", amount: 1200 }] })} />);
    expect(screen.getByText("Waiting to be converted to PKR: AED 40, SAR 1,200")).toBeTruthy();
  });
  it("shows no waiting line when nothing is waiting", () => {
    render(<AffiliatePage model={model({ waiting: [] })} />);
    expect(screen.queryByText(/Waiting to be converted/)).toBeNull();
  });
  it("has no payout button yet", () => {
    render(<AffiliatePage model={model()} />);
    expect(screen.queryByRole("button", { name: /payout|withdraw/i })).toBeNull();
  });
});

describe("AffiliatePage: links", () => {
  it("one card per open course with its link and numbers", () => {
    render(<AffiliatePage model={model()} />);
    expect(screen.getByText("Your links")).toBeTruthy();
    expect(screen.getByText("PPC Batch 4")).toBeTruthy();
    expect(screen.getByText("MDC Batch 3")).toBeTruthy();
    expect(screen.getByText("https://pz.test/e/ppc-b4?ref=sk321")).toBeTruthy();
    const card = screen.getByTestId("link-p1");
    expect(card.textContent).toContain("Views 62");
    expect(card.textContent).toContain("Registered 9");
    expect(card.textContent).toContain("Paid 5");
  });
  it("copies a course link", async () => {
    render(<AffiliatePage model={model()} />);
    fireEvent.click(screen.getAllByRole("button", { name: /copy link/i })[0]);
    await waitFor(() => expect(write).toHaveBeenCalledWith("https://pz.test/e/ppc-b4?ref=sk321"));
  });
  it("says so plainly when no course is open", () => {
    render(<AffiliatePage model={model({ links: [] })} />);
    expect(screen.getByText("No open courses right now.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /copy link/i })).toBeNull();
  });
  it("a long link can never push the phone layout sideways", () => {
    render(<AffiliatePage model={model()} />);
    const url = screen.getByText("https://pz.test/e/ppc-b4?ref=sk321");
    expect(url.className).toMatch(/truncate|break-all|break-words/);
    expect(screen.getByTestId("affiliate-page").className).toMatch(/min-w-0|overflow-x-hidden|w-full/);
  });
});

describe("AffiliatePage: footer, wording and colours", () => {
  it("keeps the page private and links to support", () => {
    render(<AffiliatePage model={model()} />);
    expect(screen.getByText("Keep this page private. Anyone with the link can open it.")).toBeTruthy();
    const link = screen.getByRole("link", { name: /message support/i });
    expect(link.getAttribute("href")).toBe("https://wa.me/923155614490");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
  it("never uses the banned words", () => {
    const { container } = render(<AffiliatePage model={model()} />);
    expect(container.textContent).not.toMatch(/official|ambassador|instant|weekly|raast|encrypted|tier/i);
  });
  it("uses only the landing and solid colour tokens, never a raw colour or a text-only token as a background", () => {
    const { container } = render(<AffiliatePage model={model()} />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toMatch(/style="[^"]*color/i);
    expect(html).not.toMatch(/(bg|border)-pz-(deep|mid|danger)\b/);
    expect(html).not.toMatch(/\b(bg|text|border)-brand-/);
  });
});

describe("AffiliateClosed", () => {
  it("says the page is no longer active and offers WhatsApp", () => {
    render(<AffiliateClosed supportWa="https://wa.me/923155614490" />);
    expect(screen.getByRole("heading", { name: "This page is no longer active." })).toBeTruthy();
    expect(screen.getByText("Message us on WhatsApp if you think this is a mistake.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /whatsapp/i }).getAttribute("href")).toBe("https://wa.me/923155614490");
  });
  it("shows nothing personal", () => {
    const { container } = render(<AffiliateClosed supportWa="https://wa.me/1" />);
    expect(container.textContent).not.toMatch(/PKR|Hello|code/i);
  });
});
