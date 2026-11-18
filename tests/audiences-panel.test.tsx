// tests/audiences-panel.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, waitFor, act } from "@testing-library/react";
import { AudiencesPanel } from "@/components/admin/crm/AudiencesPanel";
import { decodeAudienceFilter, DEFAULT_AUDIENCE_FILTER, type AudienceFilter } from "@/lib/crm/audience-filter";
import type { AudienceFacets } from "@/lib/data/audience-query";
import type { SavedAudience } from "@/lib/data/audience-saved";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => async () => true }));

const facets = (over: Partial<AudienceFacets> = {}): AudienceFacets => ({
  courses: [
    { name: "Pharmacovigilance", count: 300 },
    { name: "OPD Practice", count: 120 },
  ],
  countries: [
    { code: "AE", count: 40 },
    { code: "PK", count: 500 },
  ],
  unknownCountry: 412,
  landingPages: [],
  statusCounts: {},
  needsUpdate: false,
  statusNeedsUpdate: false,
  ...over,
});

const countBody = (over: Record<string, unknown> = {}) => ({
  total: 1284,
  inFile: 1196,
  leftOut: { noContact: 61, doNotContact: 27 },
  tooLarge: false,
  ignoredChoices: [],
  needsUpdate: false,
  ...over,
});

type Call = { url: string; init?: RequestInit };
let calls: Call[];
let handler: (url: string, init?: RequestInit) => { status?: number; body: unknown };

const json = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

beforeEach(() => {
  calls = [];
  handler = () => ({ body: countBody() });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const r = handler(url, init);
      return json(r.status ?? 200, r.body);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const renderPanel = (opts: { saved?: SavedAudience[]; needsUpdate?: boolean; f?: AudienceFacets } = {}) =>
  render(<AudiencesPanel facets={opts.f ?? facets()} saved={opts.saved ?? []} needsUpdate={opts.needsUpdate ?? false} />);

const countCalls = () => calls.filter((c) => c.url === "/api/admin/crm/audiences/count");
const lastCountBody = () => JSON.parse(String(countCalls().at(-1)?.init?.body)) as AudienceFilter;
const checkCount = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Check count" }));
  await screen.findByText(/people match|too many people|Could not|not valid|after the end/i);
};

describe("audiences panel", () => {
  it("chips and segmented controls build the request body", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Pharmacovigilance" }));
    fireEvent.click(screen.getByRole("radio", { name: "Recorded" }));
    fireEvent.click(screen.getByRole("button", { name: "UAE" }));
    fireEvent.click(screen.getByRole("button", { name: "Not known (412)" }));
    fireEvent.click(screen.getByRole("radio", { name: "Paid" }));
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-01-01" } });
    await checkCount();
    expect(lastCountBody()).toEqual({
      courses: ["Pharmacovigilance"],
      mode: "recorded",
      countries: ["AE", "unknown"],
      statuses: ["paid"],
      from: "2026-01-01",
      to: null,
    });
    expect(screen.getByRole("button", { name: "Pharmacovigilance" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("shows the three count lines and the left-out reasons", async () => {
    renderPanel();
    await checkCount();
    expect(screen.getByText("1,284 people match")).toBeTruthy();
    expect(screen.getByText("1,196 will go in the file")).toBeTruthy();
    expect(screen.getByText("88 left out: 61 have no email or phone, 27 asked not to be contacted")).toBeTruthy();
  });

  it("download links carry f= for the chosen filter and format=plain for the plain one", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "OPD Practice" }));
    fireEvent.click(screen.getByRole("radio", { name: "Live" }));
    await checkCount();
    const meta = screen.getByRole("link", { name: /Download for Meta/ });
    const plain = screen.getByRole("link", { name: /Download plain version/ });
    expect(meta.hasAttribute("download")).toBe(true);
    const metaUrl = new URL(meta.getAttribute("href")!, "http://x");
    const plainUrl = new URL(plain.getAttribute("href")!, "http://x");
    expect(metaUrl.pathname).toBe("/api/admin/crm/audiences/export");
    expect(metaUrl.searchParams.get("format")).toBeNull();
    expect(plainUrl.searchParams.get("format")).toBe("plain");
    const decoded = decodeAudienceFilter(metaUrl.searchParams.get("f")!);
    expect(decoded).toEqual({ ok: true, filter: { ...DEFAULT_AUDIENCE_FILTER, courses: ["OPD Practice"], mode: "live" } });
    expect(plainUrl.searchParams.get("f")).toBe(metaUrl.searchParams.get("f"));
  });

  it("downloads are disabled buttons before a count and when nobody would go in the file", async () => {
    renderPanel();
    expect(screen.queryByRole("link", { name: /Download for Meta/ })).toBeNull();
    expect((screen.getByRole("button", { name: /Download for Meta/ }) as HTMLButtonElement).disabled).toBe(true);
    handler = () => ({ body: countBody({ total: 3, inFile: 0, leftOut: { noContact: 3, doNotContact: 0 } }) });
    await checkCount();
    expect(screen.queryByRole("link", { name: /Download/ })).toBeNull();
    expect((screen.getByRole("button", { name: /Download plain version/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("too large: only the plain message, no numbers, no download links", async () => {
    handler = () => ({ body: countBody({ total: 60000, inFile: 59000, tooLarge: true }) });
    renderPanel();
    await checkCount();
    expect(screen.getByText(/too many people for one file/i)).toBeTruthy();
    expect(screen.getByText(/50,000/)).toBeTruthy();
    expect(screen.queryByText(/people match/)).toBeNull();
    expect(screen.queryByText(/will go in the file/)).toBeNull();
    expect(screen.queryByRole("link", { name: /Download/ })).toBeNull();
  });

  it("names ignored choices next to the downloads", async () => {
    handler = () => ({ body: countBody({ ignoredChoices: ["Old Course"] }) });
    renderPanel();
    await checkCount();
    const warn = within(screen.getByTestId("audience-result")).getByText(/no longer exist and are ignored: Old Course/);
    expect(warn).toBeTruthy();
    // Shown once on the page, not again above the filters.
    expect(screen.getAllByText(/no longer exist and are ignored/)).toHaveLength(1);
  });

  it("only the counts are announced, not the buttons or the privacy note", async () => {
    renderPanel();
    await checkCount();
    const card = screen.getByTestId("audience-result");
    expect(card.getAttribute("aria-live")).toBeNull();
    const live = card.querySelectorAll("[aria-live]");
    expect(live).toHaveLength(1);
    expect(live[0].getAttribute("aria-live")).toBe("polite");
    expect(live[0].textContent).toContain("1,284 people match");
    expect(live[0].textContent).not.toMatch(/Download|Keep it private|Check count/);
  });

  it("a failed count shows a plain error line", async () => {
    handler = () => ({ status: 400, body: { error: "The start date is after the end date." } });
    renderPanel();
    await checkCount();
    expect(screen.getByText("The start date is after the end date.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Download/ })).toBeNull();
  });

  it("changing a filter makes the count stale and disables downloads", async () => {
    renderPanel();
    await checkCount();
    expect(screen.getByRole("link", { name: /Download for Meta/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "UAE" }));
    expect(screen.queryByRole("link", { name: /Download for Meta/ })).toBeNull();
  });

  it("counts once, 400 ms after the last change", async () => {
    vi.useFakeTimers();
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "UAE" }));
    act(() => vi.advanceTimersByTime(200));
    fireEvent.click(screen.getByRole("button", { name: "Pharmacovigilance" }));
    act(() => vi.advanceTimersByTime(399));
    expect(countCalls()).toHaveLength(0);
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(countCalls()).toHaveLength(1);
    expect(lastCountBody().countries).toEqual(["AE"]);
    expect(lastCountBody().courses).toEqual(["Pharmacovigilance"]);
  });

  it("imported-sheets note shows only when Recorded or Live is chosen", () => {
    renderPanel();
    const note = /old imported sheets have no recorded or live value/i;
    expect(screen.queryByText(note)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Recorded" }));
    expect(screen.getByText(note)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Live" }));
    expect(screen.getByText(note)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Either" }));
    expect(screen.queryByText(note)).toBeNull();
  });

  it("shows the country note", () => {
    renderPanel();
    expect(screen.getByText("Country comes from the phone number.")).toBeTruthy();
  });

  it("save flow: name field, POST, appears in the select", async () => {
    const item: SavedAudience = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Gulf recorded buyers",
      filter: { ...DEFAULT_AUDIENCE_FILTER, mode: "recorded" },
      invalid: false,
      createdAt: "2026-11-17T10:00:00Z",
    };
    handler = (url) => (url === "/api/admin/crm/audiences/saved" ? { body: { item } } : { body: countBody() });
    renderPanel();
    fireEvent.click(screen.getByRole("radio", { name: "Recorded" }));
    fireEvent.click(screen.getByRole("button", { name: "Save this audience" }));
    fireEvent.change(screen.getByPlaceholderText("Name, for example Gulf recorded buyers"), {
      target: { value: "Gulf recorded buyers" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("option", { name: "Gulf recorded buyers" })).toBeTruthy());
    const post = calls.find((c) => c.url === "/api/admin/crm/audiences/saved")!;
    expect(post.init?.method).toBe("POST");
    expect(JSON.parse(String(post.init?.body))).toEqual({
      name: "Gulf recorded buyers",
      filter: { ...DEFAULT_AUDIENCE_FILTER, mode: "recorded" },
    });
  });

  it("save flow: a 409 shows the plain message", async () => {
    handler = (url) =>
      url === "/api/admin/crm/audiences/saved"
        ? { status: 409, body: { error: "A saved audience with this name already exists." } }
        : { body: countBody() };
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Save this audience" }));
    fireEvent.change(screen.getByPlaceholderText("Name, for example Gulf recorded buyers"), { target: { value: "Dup" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("A saved audience with this name already exists.")).toBeTruthy();
  });

  it("loads a saved audience; one that needs checking is disabled", () => {
    const good: SavedAudience = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Gulf",
      filter: { ...DEFAULT_AUDIENCE_FILTER, countries: ["AE"], statuses: ["paid"] },
      invalid: false,
      createdAt: "2026-11-17T10:00:00Z",
    };
    const bad: SavedAudience = { id: "22222222-2222-4222-8222-222222222222", name: "Broken", filter: null, invalid: true, createdAt: "2026-11-16T10:00:00Z" };
    renderPanel({ saved: [good, bad] });
    const badOpt = screen.getByRole("option", { name: /Broken \(needs checking\)/ }) as HTMLOptionElement;
    expect(badOpt.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Saved audiences"), { target: { value: good.id } });
    expect(screen.getByRole("button", { name: "UAE" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("radio", { name: "Paid" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.change(screen.getByLabelText("Saved audiences"), { target: { value: bad.id } });
    expect(screen.getByRole("button", { name: "UAE" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("Reset filters restores the defaults", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "UAE" }));
    fireEvent.click(screen.getByRole("radio", { name: "Live" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.getByRole("button", { name: "UAE" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("radio", { name: "Either" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Both" }).getAttribute("aria-checked")).toBe("true");
  });

  it("needsUpdate shows the notice and the filters still render", () => {
    renderPanel({ needsUpdate: true });
    expect(screen.getByText(/needs one small one-time setup step first/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pharmacovigilance" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Recorded" })).toBeTruthy();
  });

  it("more than 8 courses: the rest are reached through Add course", () => {
    const courses = Array.from({ length: 10 }, (_, i) => ({ name: `Course ${i + 1}`, count: 100 - i }));
    renderPanel({ f: facets({ courses }) });
    expect(screen.queryByRole("button", { name: "Course 10" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add course" }));
    fireEvent.change(screen.getByLabelText("Find a course"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Course 10" }));
    expect(screen.getByRole("button", { name: "Course 10" }).getAttribute("aria-pressed")).toBe("true");
  });
});
