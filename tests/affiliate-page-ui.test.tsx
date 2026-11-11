import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { AffiliatePage } from "@/components/affiliates/AffiliatePage";
import { AffiliateClosed } from "@/components/affiliates/AffiliateClosed";
import type { AffiliatePageModel } from "@/lib/data/affiliate-page";

const model = (over: Partial<AffiliatePageModel> = {}): AffiliatePageModel => ({
  name: "Sara Khan", code: "SK321", team: "Blue", percent: 8, automatic: true, paidCount: 19, monthPaid: 9, lastMonthPaid: 10, toNextStep: 1,
  earnedPkr: 51000, balancePkr: 51000, waiting: [{ currency: "AED", amount: 40 }],
  totals: { views: 124, registered: 18, paid: 9 },
  links: [
    { pageId: "p1", title: "PPC Batch 4", url: "https://pz.test/e/ppc-b4?ref=sk321", views: 62, registered: 9, paid: 5 },
    { pageId: "p2", title: "MDC Batch 3", url: "https://pz.test/e/mdc-b3?ref=sk321", views: 0, registered: 0, paid: 0 },
  ],
  supportWa: "https://wa.me/923155614490",
  rank: { all: null, month: null, boardUrl: "" },
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
  it("shows this month's progress towards 10% next month, and last month's count", () => {
    render(<AffiliatePage model={model()} />);
    expect(screen.getByText("Your commission: 8%")).toBeTruthy();
    expect(screen.getByText("9 of 10 paid participants this month")).toBeTruthy();
    expect(screen.getByText("1 more paid participant this month to earn 10% next month")).toBeTruthy();
    expect(screen.getByText(/Last month: 10 paid participants\./)).toBeTruthy();
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("9");
    expect(bar.getAttribute("aria-valuemax")).toBe("10");
  });
  it("says participants in the plural", () => {
    render(<AffiliatePage model={model({ monthPaid: 3, toNextStep: 7 })} />);
    expect(screen.getByText("7 more paid participants this month to earn 10% next month")).toBeTruthy();
  });
  it("once 10 are reached this month: no progress bar, and it says 10% comes next month", () => {
    render(<AffiliatePage model={model({ percent: 8, monthPaid: 10, paidCount: 10, toNextStep: null })} />);
    expect(screen.getByText("Certificate of Achievement unlocked")).toBeTruthy();
    expect(screen.getByText("You have reached 10 paid participants this month, so you earn 10% next month.")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText(/more paid participant/)).toBeNull();
  });
  it("shows 10% when last month earned it", () => {
    render(<AffiliatePage model={model({ percent: 10, lastMonthPaid: 12 })} />);
    expect(screen.getByText("Your commission: 10%")).toBeTruthy();
  });
  it("a typed (manual) percent shows alone: no progress bar, no monthly text, no certificate before 10", () => {
    render(<AffiliatePage model={model({ percent: 9, automatic: false, paidCount: 3, monthPaid: 3, toNextStep: null })} />);
    expect(screen.getByText("Your commission: 9%")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText(/Last month/)).toBeNull();
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

const own = (over: Partial<NonNullable<AffiliatePageModel["rank"]["month"]>> = {}) => ({
  rank: 3, of: 54, paid: 4, line: "2 more paid sales to pass Ali K.", teamRank: 2, team: "Blue" as const, ...over,
});
const BOARD = "https://pz.test/affiliate-board/tok";

describe("AffiliatePage: your rank", () => {
  it("shows this month first with the rank, the gap line and the team line", () => {
    render(<AffiliatePage model={model({ rank: { month: own(), all: own({ rank: 7, of: 90, line: "5 more paid sales to pass Zed Q." }), boardUrl: BOARD } })} />);
    expect(screen.getByRole("heading", { name: "Your rank" })).toBeTruthy();
    expect(screen.getByText("You are 3rd of 54 affiliates")).toBeTruthy();
    expect(screen.getByText("2 more paid sales to pass Ali K.")).toBeTruthy();
    expect(screen.getByText(/Your team/).textContent).toBe("Your team Blue is 2nd of 5.");
  });
  it("switches to all time", () => {
    render(<AffiliatePage model={model({ rank: { month: own(), all: own({ rank: 7, of: 90, line: "5 more paid sales to pass Zed Q." }), boardUrl: BOARD } })} />);
    fireEvent.click(screen.getByRole("tab", { name: "All time" }));
    expect(screen.getByText("You are 7th of 90 affiliates")).toBeTruthy();
    expect(screen.getByText("5 more paid sales to pass Zed Q.")).toBeTruthy();
    expect(screen.queryByText("2 more paid sales to pass Ali K.")).toBeNull();
  });
  it("first place has its own wording", () => {
    render(<AffiliatePage model={model({ rank: { month: own({ rank: 1, line: "You are first, 3 ahead of Bina R.", teamRank: 1 }), all: null, boardUrl: BOARD } })} />);
    expect(screen.getByText("You are 1st of 54 affiliates")).toBeTruthy();
    expect(screen.getByText("You are first, 3 ahead of Bina R.")).toBeTruthy();
  });
  it("no paid sales in the period: join-the-race prompt, no crash", () => {
    render(<AffiliatePage model={model({ rank: { month: null, all: own(), boardUrl: BOARD } })} />);
    expect(screen.getByText("Unranked")).toBeTruthy();
    expect(screen.getByText("Get your first paid sale to join the race.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /see the full board/i })).toBeTruthy();
  });
  it("no team shows no team line", () => {
    render(<AffiliatePage model={model({ rank: { month: own({ team: null, teamRank: null }), all: null, boardUrl: BOARD } })} />);
    expect(screen.queryByText(/Your team/)).toBeNull();
  });
  it("links to the board only when there is a board link", () => {
    const { unmount } = render(<AffiliatePage model={model({ rank: { month: own(), all: own(), boardUrl: BOARD } })} />);
    expect(screen.getByRole("link", { name: /see the full board/i }).getAttribute("href")).toBe(BOARD);
    unmount();
    render(<AffiliatePage model={model({ rank: { month: own(), all: own(), boardUrl: "" } })} />);
    expect(screen.queryByRole("link", { name: /see the full board/i })).toBeNull();
  });
  it("hides the whole card when the rank could not be loaded", () => {
    render(<AffiliatePage model={model()} />);
    expect(screen.queryByRole("heading", { name: "Your rank" })).toBeNull();
    expect(screen.getByText("Hello, Sara Khan")).toBeTruthy();
  });
  it("says 'of 1 affiliate' for a board of one", () => {
    render(<AffiliatePage model={model({ rank: { month: own({ rank: 1, of: 1, line: "You are first." }), all: null, boardUrl: BOARD } })} />);
    expect(screen.getByText("You are 1st of 1 affiliate")).toBeTruthy();
  });
  it("uses amber only on the rank pill: every other background and border is a landing token", () => {
    for (const rank of [1, 3]) {
      const { container, unmount } = render(<AffiliatePage model={model({ rank: { month: own({ rank }), all: null, boardUrl: BOARD } })} />);
      const card = container.querySelector('[data-testid="your-rank"]')!;
      const pill = card.querySelector('[data-testid="rank-pill"]')!;
      pill.remove();
      expect(card.innerHTML).not.toMatch(/(bg|border)-(emerald|amber|green)-/);
      unmount();
    }
  });
  it("uses only the allowed colour tokens", () => {
    const { container } = render(<AffiliatePage model={model({ rank: { month: own(), all: own(), boardUrl: BOARD } })} />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
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
