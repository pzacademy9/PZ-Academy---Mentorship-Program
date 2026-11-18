// tests/audience-guided-check-download.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AudiencesPanel } from "@/components/admin/crm/AudiencesPanel";
import { AudienceCheckStep } from "@/components/admin/crm/AudienceCheckStep";
import { AudienceDownloadStep } from "@/components/admin/crm/AudienceDownloadStep";
import { DEFAULT_AUDIENCE_FILTER, encodeAudienceFilter } from "@/lib/crm/audience-filter";
import { buildAudiencePreview, type AudiencePreview } from "@/lib/crm/audience-preview";
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

const preview = (over: Partial<AudiencePreview> = {}): AudiencePreview => ({
  people: [
    { name: "Ada Test", email: "a***@example.com", country: "AE" },
    { name: "Bo Test", email: "b***@example.com", country: "PK" },
  ],
  inFile: 1196,
  leftOut: { noContact: 61, doNotContact: 27 },
  columns: ["Email", "Phone", "First name", "Last name", "Country"],
  fileName: "test-meta-audience-2026-11-18.csv",
  ...over,
});

const key = encodeAudienceFilter(DEFAULT_AUDIENCE_FILTER);

describe("AudienceCheckStep", () => {
  let respond: () => Promise<Response>;
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => respond()));
  });
  afterEach(() => vi.unstubAllGlobals());

  const ok = (p: AudiencePreview) => () =>
    Promise.resolve({ ok: true, status: 200, json: async () => p } as unknown as Response);
  const fail = (status: number, json: () => Promise<unknown>) => () =>
    Promise.resolve({ ok: false, status, json } as unknown as Response);

  function mount(onLoaded = vi.fn(), cached: AudiencePreview | null = null) {
    const onNext = vi.fn();
    const view = render(
      <AudienceCheckStep filter={DEFAULT_AUDIENCE_FILTER} filterKey={key} preview={cached}
        onLoaded={onLoaded} onBack={vi.fn()} onNext={onNext} />,
    );
    return { onLoaded, onNext, view };
  }

  it("shows loading, then a few people with masked emails, and the left-out lines", async () => {
    respond = ok(preview());
    const onLoaded = vi.fn();
    const { view } = mount(onLoaded);
    expect(screen.getByText("Loading the list…")).toBeTruthy();
    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(key, expect.objectContaining({ inFile: 1196 })));
    view.rerender(
      <AudienceCheckStep filter={DEFAULT_AUDIENCE_FILTER} filterKey={key} preview={preview()}
        onLoaded={onLoaded} onBack={vi.fn()} onNext={vi.fn()} />,
    );
    expect(screen.getByText("A few people from this list")).toBeTruthy();
    expect(screen.getByText("Ada Test")).toBeTruthy();
    expect(screen.getByText("a***@example.com")).toBeTruthy();
    expect(screen.getByText(/Only people with an email or phone can go to Meta: 1,196 of 1,284/)).toBeTruthy();
    expect(screen.getByText("61 cannot be used: no email or phone")).toBeTruthy();
    expect(screen.getByText("27 asked not to be contacted")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Next: Download/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not fetch again when a preview is already held", () => {
    mount(vi.fn(), preview());
    expect(fetch).not.toHaveBeenCalled();
  });

  it("a person with no name or email shows a blank-safe row, never undefined", () => {
    mount(vi.fn(), preview({ people: [{ name: "", email: "", country: "" }] }));
    expect(document.body.textContent).not.toMatch(/undefined/);
    expect(screen.getByText("No name")).toBeTruthy();
  });

  it("a failed request shows the error and Try again; Next stays off; Try again refetches", async () => {
    respond = fail(409, async () => ({ error: "Counting needs one small database update first." }));
    mount();
    expect(await screen.findByText("Counting needs one small database update first.")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Next: Download/ }) as HTMLButtonElement).disabled).toBe(true);
    respond = ok(preview());
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });

  it("a non-JSON failure (platform timeout) is a calm error, not a crash", async () => {
    respond = fail(504, async () => { throw new SyntaxError("not json"); });
    mount();
    expect(await screen.findByText(/Could not load the list/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("a thrown fetch is a calm error too", async () => {
    respond = () => Promise.reject(new Error("network"));
    mount();
    expect(await screen.findByText(/Could not load the list/)).toBeTruthy();
  });

  it("nobody in the file: says so and Next is off", () => {
    mount(vi.fn(), preview({ inFile: 0, people: [] }));
    expect(screen.getByText("Nobody to download for these choices.")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Next: Download/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("AudienceDownloadStep", () => {
  it("shows the file, people, columns, left-out lines and both links with the privacy note", () => {
    render(<AudienceDownloadStep filter={DEFAULT_AUDIENCE_FILTER} filterKey={key} preview={preview()} onBack={vi.fn()} />);
    expect(screen.getByText("test-meta-audience-2026-11-18.csv")).toBeTruthy();
    expect(screen.getByText("1,196 people")).toBeTruthy();
    expect(screen.getByText(/Email, Phone, First name, Last name, Country/)).toBeTruthy();
    expect(screen.getByText("61 cannot be used: no email or phone")).toBeTruthy();
    const meta = screen.getByRole("link", { name: "Download for Meta" });
    const plain = screen.getByRole("link", { name: /Download plain version/ });
    expect(meta.getAttribute("href")).toContain("/audiences/export?f=");
    expect(meta.hasAttribute("download")).toBe(true);
    expect(plain.getAttribute("href")).toContain("format=plain");
    const note = document.getElementById(plain.getAttribute("aria-describedby")!);
    expect(note?.textContent).toMatch(/real emails and phone numbers/);
    expect(screen.getByText("Plain file: keep it private.")).toBeTruthy();
  });

  it("both buttons are inert when nobody would go in the file", () => {
    render(<AudienceDownloadStep filter={DEFAULT_AUDIENCE_FILTER} filterKey={key}
      preview={preview({ inFile: 0, people: [] })} onBack={vi.fn()} />);
    expect(screen.queryByRole("link", { name: /Download/ })).toBeNull();
    expect((screen.getByRole("button", { name: "Download for Meta" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Download plain version/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Nobody to download for these choices.")).toBeTruthy();
  });
});

describe("buildAudiencePreview blank safety", () => {
  it("a contact with an empty full name previews as a blank row, no undefined", () => {
    const p = buildAudiencePreview(
      [{ fullName: "", email: "x@example.com", phone: null, country: null, doNotContact: false } as never],
      DEFAULT_AUDIENCE_FILTER,
      new Date("2026-11-18T00:00:00Z"),
    );
    expect(JSON.stringify(p)).not.toMatch(/undefined/);
  });
});

describe("AudiencesPanel steps 2 and 3", () => {
  let previewCalls: Record<string, unknown>[];
  let previewResp: () => Promise<Response>;
  beforeEach(() => {
    previewCalls = [];
    previewResp = () => Promise.resolve({ ok: true, status: 200, json: async () => preview() } as unknown as Response);
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/preview")) {
        previewCalls.push(JSON.parse(String(init?.body ?? "{}")));
        return previewResp();
      }
      return {
        ok: true, status: 200,
        json: async () => ({ total: 1284, inFile: 1196, leftOut: { noContact: 61, doNotContact: 27 }, tooLarge: false, ignoredChoices: [], needsUpdate: false, statusNeedsUpdate: false }),
      } as unknown as Response;
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  async function toStep2() {
    render(<AudiencesPanel facets={facets} saved={[]} needsUpdate={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Check count" }));
    await screen.findByText(/people match/);
    fireEvent.click(screen.getByRole("button", { name: /Next: Check the list/ }));
  }

  it("fetches the preview only when step 2 opens, then Next goes to download, Back keeps choices", async () => {
    render(<AudiencesPanel facets={facets} saved={[]} needsUpdate={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Check count" }));
    await screen.findByText(/people match/);
    expect(previewCalls.length).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: /Next: Check the list/ }));
    expect(await screen.findByText("A few people from this list")).toBeTruthy();
    expect(previewCalls.length).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: /Next: Download/ }));
    expect(await screen.findByRole("link", { name: "Download for Meta" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("A few people from this list")).toBeTruthy();
    expect(previewCalls.length).toBe(1);
  });

  it("changed choices drop the old preview: going to step 2 again fetches again", async () => {
    await toStep2();
    await screen.findByText("A few people from this list");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: /Pharmacovigilance/ }));
    await screen.findByText(/people match/, undefined, { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: /Next: Check the list/ }));
    await screen.findByText("A few people from this list");
    expect(previewCalls.length).toBe(2);
  });
});

describe("AudiencesPanel fix wave", () => {
  let previewCalls: number;
  let countBody: Record<string, unknown>;
  beforeEach(() => {
    previewCalls = 0;
    countBody = { total: 1284, inFile: 1196, leftOut: { noContact: 61, doNotContact: 27 }, tooLarge: false, ignoredChoices: [], needsUpdate: false, statusNeedsUpdate: false };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).endsWith("/preview")) {
        previewCalls += 1;
        return { ok: true, status: 200, json: async () => preview() } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => countBody } as unknown as Response;
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const stepBtn = (n: string) => screen.getByRole("button", { name: n }) as HTMLButtonElement;
  async function counted(saved: SavedAudience[] = []) {
    render(<AudiencesPanel facets={facets} saved={saved} needsUpdate={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Check count" }));
    await screen.findByText(/people match/);
  }

  it("step 3 stays locked until a preview exists; tapping 2 then lands on Check", async () => {
    await counted();
    expect(stepBtn("3 Download").disabled).toBe(true);
    expect(stepBtn("2 Check").disabled).toBe(false);
    fireEvent.click(stepBtn("2 Check"));
    await screen.findByText("A few people from this list");
    expect(stepBtn("3 Download").disabled).toBe(false);
  });

  it("an unusable count (nobody in the file) keeps 2 and 3 locked", async () => {
    countBody = { ...countBody, inFile: 0 };
    await counted();
    expect(stepBtn("2 Check").disabled).toBe(true);
    expect(stepBtn("3 Download").disabled).toBe(true);
  });

  it("Bring in finishing on step 3 drops to Check and refetches, not a blank page", async () => {
    await counted();
    fireEvent.click(screen.getByRole("button", { name: /Next: Check the list/ }));
    await screen.findByText("A few people from this list");
    fireEvent.click(screen.getByRole("button", { name: /Next: Download/ }));
    await screen.findByRole("link", { name: "Download for Meta" });
    fireEvent.click(screen.getByRole("button", { name: "Finish bring in" }));
    await waitFor(() => expect(previewCalls).toBe(2));
    expect(await screen.findByText("A few people from this list")).toBeTruthy();
  });

  it("Reset on the default choices then Next goes to step 2 and stays", async () => {
    await counted();
    fireEvent.click(screen.getByRole("button", { name: "Reset all filters" }));
    fireEvent.click(screen.getByRole("button", { name: /Next: Check the list/ }));
    await screen.findByText("A few people from this list");
    expect(stepBtn("2 Check").getAttribute("aria-current")).toBe("step");
  });

  it("loading a saved audience equal to the current choices jumps to step 2 and stays", async () => {
    const saved: SavedAudience = {
      id: "11111111-1111-4111-8111-111111111111", name: "All", filter: DEFAULT_AUDIENCE_FILTER,
      invalid: false, createdAt: "2026-11-17T10:00:00Z",
    };
    await counted([saved]);
    fireEvent.click(screen.getByRole("button", { name: "Saved audiences" }));
    fireEvent.click(screen.getByRole("button", { name: "Load All" }));
    await screen.findByText("A few people from this list");
    expect(stepBtn("2 Check").getAttribute("aria-current")).toBe("step");
  });

  it("focus moves to the step heading on Next and Back, not on first mount", async () => {
    await counted();
    expect(document.activeElement).toBe(document.body);
    fireEvent.click(screen.getByRole("button", { name: /Next: Check the list/ }));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Check the list" }));
    await screen.findByText("A few people from this list");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Who do you want?" }));
  });

  it("the sentence is clamped on phone and the full text sits in Details", async () => {
    await counted();
    const s = screen.getByText(/You are choosing:/);
    expect(s.className).toMatch(/line-clamp-2/);
    const details = document.querySelector('[id$="-details"]')!;
    expect(details.textContent).toMatch(/Everyone who registered or bought/);
  });

  it("steps 2 and 3 restate the sentence; step 3 has both file names and the full privacy note", async () => {
    await counted();
    fireEvent.click(screen.getByRole("button", { name: /Next: Check the list/ }));
    await screen.findByText("A few people from this list");
    expect(screen.getByText(/You are choosing:/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Next: Download/ }));
    await screen.findByRole("link", { name: "Download for Meta" });
    expect(screen.getByText(/You are choosing:/)).toBeTruthy();
    expect(screen.getByText("test-plain-meta-audience-2026-11-18.csv")).toBeTruthy();
    const plain = screen.getByRole("link", { name: /Download plain version/ });
    expect(document.getElementById(plain.getAttribute("aria-describedby")!)?.textContent).toMatch(/delete it after uploading/);
  });

  it("ignored choices are named on step 3", async () => {
    countBody = { ...countBody, ignoredChoices: ["Old course"] };
    await counted();
    fireEvent.click(screen.getByRole("button", { name: /Next: Check the list/ }));
    await screen.findByText("A few people from this list");
    fireEvent.click(screen.getByRole("button", { name: /Next: Download/ }));
    await screen.findByRole("link", { name: "Download for Meta" });
    expect(screen.getByText(/ignored: Old course/)).toBeTruthy();
  });
});
