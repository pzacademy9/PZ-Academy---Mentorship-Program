// tests/audience-guided-steps.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { AudiencesPanel } from "@/components/admin/crm/AudiencesPanel";
import { AudienceStepper } from "@/components/admin/crm/AudienceStepper";
import { AudienceSummary } from "@/components/admin/crm/AudienceSummary";
import { audienceExportUrls } from "@/lib/crm/audience-export-url";
import { DEFAULT_AUDIENCE_FILTER, encodeAudienceFilter } from "@/lib/crm/audience-filter";
import type { AudienceFacets } from "@/lib/data/audience-query";
import type { SavedAudience } from "@/lib/data/audience-saved";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => async () => true }));
vi.mock("@/components/admin/crm/BringInDialog", () => ({
  BringInDialog: ({ onDone }: { onDone: () => void }) => <button type="button" onClick={onDone}>Finish bring in</button>,
}));

const facets: AudienceFacets = {
  courses: [{ name: "Pharmacovigilance", count: 300 }],
  countries: [{ code: "AE", count: 40 }],
  unknownCountry: 0,
  landingPages: [],
  statusCounts: {},
  needsUpdate: false,
  statusNeedsUpdate: false,
};

const countBody = (over: Record<string, unknown> = {}) => ({
  total: 1284,
  inFile: 1196,
  leftOut: { noContact: 61, doNotContact: 27 },
  tooLarge: false,
  ignoredChoices: [],
  needsUpdate: false,
  statusNeedsUpdate: false,
  ...over,
});

let body: Record<string, unknown>;
// When set, count calls wait for it, so a test can look at the page while a count is still running.
let gate: Promise<void> | null;
let fetchCalls: { url: string; body: Record<string, unknown> }[];
beforeEach(() => {
  body = countBody();
  gate = null;
  fetchCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const isCount = String(url).endsWith("/count");
      if (isCount) fetchCalls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      if (isCount && gate) await gate;
      return { ok: true, status: 200, json: async () => body } as unknown as Response;
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const renderPanel = (saved: SavedAudience[] = []) =>
  render(<AudiencesPanel facets={facets} saved={saved} needsUpdate={false} />);
const check = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Check count" }));
  await screen.findByText(/people match/);
};
const next = () => screen.getByRole("button", { name: /Next: Check the list/ }) as HTMLButtonElement;

describe("AudienceStepper", () => {
  it("shows three steps, marks the current one, disables steps after maxStep", () => {
    const onGo = vi.fn();
    render(<AudienceStepper step={1} maxStep={1} onGo={onGo} />);
    const who = screen.getByRole("button", { name: "1 Who" });
    expect(who.getAttribute("aria-current")).toBe("step");
    expect(screen.getByRole("button", { name: "2 Check" }).getAttribute("aria-current")).toBeNull();
    expect((screen.getByRole("button", { name: "2 Check" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "3 Download" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Active")).toBeTruthy();
  });

  it("steps up to maxStep can be clicked", () => {
    const onGo = vi.fn();
    render(<AudienceStepper step={2} maxStep={3} onGo={onGo} />);
    expect(screen.getByRole("button", { name: "2 Check" }).getAttribute("aria-current")).toBe("step");
    fireEvent.click(screen.getByRole("button", { name: "3 Download" }));
    expect(onGo).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByRole("button", { name: "1 Who" }));
    expect(onGo).toHaveBeenCalledWith(1);
  });
});

describe("AudienceSummary", () => {
  const done = (over: Record<string, unknown> = {}) => ({
    status: "done" as const,
    key: "k",
    data: countBody(over),
  });
  const base = { filter: DEFAULT_AUDIENCE_FILTER, currentKey: "k", onNext: vi.fn(), onReset: vi.fn(), onCheck: vi.fn(), nextLabel: "Next: Check the list" };

  it("reads 'You are choosing:' with the default sentence and the count", () => {
    render(<AudienceSummary {...base} count={done()} />);
    expect(screen.getByText(/You are choosing:/).textContent).toContain("Everyone who registered or bought");
    expect(screen.getByText("1,284 people match")).toBeTruthy();
    expect(screen.getByText("1,196 uploadable to Meta")).toBeTruthy();
  });

  it("lists the chosen filter lines", () => {
    render(<AudienceSummary {...base} filter={{ ...DEFAULT_AUDIENCE_FILTER, mode: "live", statuses: ["paid"] }} count={done()} />);
    const t = screen.getByText(/You are choosing:/).textContent!;
    expect(t).toContain("Live only");
    expect(t).toContain("Paid");
  });

  it("Next is off while counting, off with nobody in the file, on otherwise", () => {
    const { rerender } = render(<AudienceSummary {...base} count={{ status: "loading", key: "k" }} />);
    expect((screen.getByRole("button", { name: /Next: Check the list/ }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<AudienceSummary {...base} count={done({ inFile: 0, total: 3 })} />);
    expect((screen.getByRole("button", { name: /Next: Check the list/ }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<AudienceSummary {...base} count={done({ tooLarge: true })} />);
    expect((screen.getByRole("button", { name: /Next: Check the list/ }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<AudienceSummary {...base} count={done()} />);
    expect((screen.getByRole("button", { name: /Next: Check the list/ }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Next: Check the list/ }));
    expect(base.onNext).toHaveBeenCalled();
  });

  it("an older count for other choices shows the stale note and keeps Next off", () => {
    render(<AudienceSummary {...base} currentKey="other" count={done()} />);
    expect(screen.getByText(/Choices changed/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Next: Check the list/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("audienceExportUrls", () => {
  it("builds the Meta and plain links from the filter key", () => {
    const key = encodeAudienceFilter(DEFAULT_AUDIENCE_FILTER);
    const u = audienceExportUrls(key);
    expect(u.meta).toBe(`/api/admin/crm/audiences/export?f=${key}`);
    expect(u.plain).toBe(`${u.meta}&format=plain`);
  });
});

describe("guided page, step 1", () => {
  it("starts on step 1 with the strip and the default sentence; no download links", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "1 Who" }).getAttribute("aria-current")).toBe("step");
    expect((screen.getByRole("button", { name: "2 Check" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/You are choosing:/).textContent).toContain("Everyone who registered or bought");
    expect(screen.queryByText(/Download for Meta/)).toBeNull();
    expect(screen.queryByText(/Download plain version/)).toBeNull();
    expect(next().disabled).toBe(true);
  });

  it("after a done count Next goes to step 2, Back returns", async () => {
    renderPanel();
    await check();
    expect(next().disabled).toBe(false);
    fireEvent.click(next());
    expect(screen.getByRole("button", { name: "2 Check" }).getAttribute("aria-current")).toBe("step");
    expect(screen.queryByRole("button", { name: "UAE" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "1 Who" }).getAttribute("aria-current")).toBe("step");
    expect(screen.getByRole("button", { name: "UAE" })).toBeTruthy();
  });

  it("Reset all filters restores defaults", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "UAE" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset all filters" }));
    expect(screen.getByRole("button", { name: "UAE" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("changing a choice clears maxStep and Next goes off", async () => {
    renderPanel();
    await check();
    expect((screen.getByRole("button", { name: "2 Check" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "UAE" }));
    expect((screen.getByRole("button", { name: "2 Check" }) as HTMLButtonElement).disabled).toBe(true);
    expect(next().disabled).toBe(true);
  });

  it("a same-choices recount (Bring in) keeps the user on step 2, while counting and after", async () => {
    renderPanel();
    await check();
    fireEvent.click(next());
    expect(screen.getByRole("button", { name: "2 Check" }).getAttribute("aria-current")).toBe("step");
    let release!: () => void;
    gate = new Promise<void>((r) => { release = r; });
    const before = fetchCalls.length;
    fireEvent.click(screen.getByRole("button", { name: "Finish bring in" }));
    // The recount itself has started (fresh data asked for) and is still running.
    await waitFor(() => expect(fetchCalls.length).toBe(before + 1));
    expect(fetchCalls[before].body.fresh).toBe(true);
    // Let the loading state render, then check the user was not moved.
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("button", { name: "2 Check" }).getAttribute("aria-current")).toBe("step");
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    await act(async () => { release(); await Promise.resolve(); });
    await waitFor(() => expect(fetchCalls.length).toBe(before + 1));
    expect(screen.getByRole("button", { name: "2 Check" }).getAttribute("aria-current")).toBe("step");
  });

  it("loading a saved audience while on step 2 goes back to step 1 straight away", async () => {
    const saved: SavedAudience = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Gulf",
      filter: { ...DEFAULT_AUDIENCE_FILTER, countries: ["AE"] },
      invalid: false,
      createdAt: "2026-11-17T10:00:00Z",
    };
    renderPanel([saved]);
    await check();
    fireEvent.click(next());
    fireEvent.click(screen.getByRole("button", { name: "Saved audiences" }));
    fireEvent.click(screen.getByRole("button", { name: "Load Gulf" }));
    expect(screen.getByRole("button", { name: "1 Who" }).getAttribute("aria-current")).toBe("step");
  });

  it("the sentence is always in the page, outside the phone-hidden details", () => {
    renderPanel();
    const sentence = screen.getByText(/You are choosing:/);
    expect(sentence.closest('[id$="-details"]')).toBeNull();
    expect(sentence.closest(".hidden")).toBeNull();
  });

  it("loading a saved audience goes to step 2 once its count is done", async () => {
    const saved: SavedAudience = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Gulf",
      filter: { ...DEFAULT_AUDIENCE_FILTER, countries: ["AE"] },
      invalid: false,
      createdAt: "2026-11-17T10:00:00Z",
    };
    renderPanel([saved]);
    fireEvent.click(screen.getByRole("button", { name: "Saved audiences" }));
    fireEvent.click(screen.getByRole("button", { name: "Load Gulf" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "2 Check" }).getAttribute("aria-current")).toBe("step"),
    );
  });
});
