import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
const { toastError, confirmFn } = vi.hoisted(() => ({ toastError: vi.fn(), confirmFn: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: toastError } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => confirmFn }));

import { LandingPagesList } from "@/components/admin/landing/LandingPagesList";
import { validateSlug } from "@/lib/landing/slug";
import { NewPageDialog } from "@/components/admin/landing/NewPageDialog";
import { DuplicatePageDialog } from "@/components/admin/landing/DuplicatePageDialog";

const pages = [
  { id: "a", slug: "ppc-b3", kind: "course" as const, title: "PPC Batch 3", status: "published" as const, revision: 3, publishedAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", hasUnpublishedChanges: true },
  { id: "b", slug: "w21", kind: "webinar" as const, title: "Webinar 21", status: "draft" as const, revision: 1, publishedAt: null, updatedAt: "2026-10-02T00:00:00Z", hasUnpublishedChanges: true },
];
const closedPage = { id: "c", slug: "mdc-b2", kind: "workshop" as const, title: "MDC Batch 2", status: "closed" as const, revision: 2, publishedAt: "2026-09-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", hasUnpublishedChanges: false };

beforeEach(() => { push.mockReset(); refresh.mockReset(); toastError.mockReset(); confirmFn.mockReset(); confirmFn.mockResolvedValue(true); vi.stubGlobal("fetch", vi.fn()); });

describe("LandingPagesList", () => {
  it("shows status badges; chip and View live appear only for the live page, in both layouts", () => {
    const { container } = render(<LandingPagesList pages={pages} />);
    const table = screen.getByRole("table");
    const cards = container.querySelector("ul") as HTMLElement;
    for (const scope of [table, cards]) {
      const rows = Array.from(scope.querySelectorAll(scope === table ? "tbody tr" : ":scope > li")) as HTMLElement[];
      expect(rows).toHaveLength(2);
      const [live, draft] = rows;
      expect(within(live).getByText("Live")).toBeTruthy();
      expect(within(live).getAllByText(/unpublished changes/i)).toHaveLength(1);
      expect(within(live).getAllByRole("link", { name: /view live/i })).toHaveLength(1);
      expect(within(draft).getByText("Draft")).toBeTruthy();
      expect(within(draft).queryByText(/unpublished changes/i)).toBeNull();
      expect(within(draft).queryByRole("link", { name: /view live/i })).toBeNull();
    }
    expect(screen.getAllByText(/unpublished changes/i)).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: /view live/i })).toHaveLength(2);
  });
  it("formats dates in the fixed Karachi zone (20:00Z on 2 Oct is 3 Oct)", () => {
    render(<LandingPagesList pages={[{ ...pages[1], updatedAt: "2026-10-02T20:00:00Z" }]} />);
    expect(screen.getAllByText(/3 Oct 2026/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/2 Oct 2026/)).toBeNull();
  });
  it("shows exact count tiles, an honest traffic stub, disabled tabs and a showing footer", () => {
    render(<LandingPagesList pages={[...pages, closedPage]} />);
    expect(screen.getByText("Analytics coming soon")).toBeTruthy();
    expect(screen.getByText("Showing 3 of 3 pages")).toBeTruthy();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("aria-disabled")).toBe("true");
    expect(tabs[2].getAttribute("aria-disabled")).toBe("true");
    expect(within(tabs[1]).getByText("Coming soon")).toBeTruthy();
    const total = screen.getByText("Total pages").parentElement as HTMLElement;
    expect(within(total).getByText("3")).toBeTruthy();
  });
  it("does not call the status route when the confirm is declined", async () => {
    confirmFn.mockResolvedValue(false);
    render(<LandingPagesList pages={pages} />);
    fireEvent.click(screen.getAllByRole("button", { name: /close registration/i })[0]);
    await waitFor(() => expect(confirmFn).toHaveBeenCalled());
    expect(fetch).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
  it("tells the user when the status request fails to reach the server", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("network"));
    render(<LandingPagesList pages={pages} />);
    fireEvent.click(screen.getAllByRole("button", { name: /close registration/i })[0]);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Could not reach the server. Please try again."));
    expect(refresh).not.toHaveBeenCalled();
  });
  it("shows an empty state with a create button when there are no pages", () => {
    render(<LandingPagesList pages={[]} />);
    expect(screen.getAllByRole("button", { name: /new page|create your first page/i }).length).toBeGreaterThan(0);
  });
  it("closes registration through the status route and refreshes", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<LandingPagesList pages={pages} />);
    fireEvent.click(screen.getAllByRole("button", { name: /close registration/i })[0]);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/admin/landing-pages/a/status");
    expect(JSON.parse(init.body)).toEqual({ status: "closed" });
  });
  it("offers Reopen registration for closed pages and posts published", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<LandingPagesList pages={[closedPage]} />);
    expect(screen.queryByRole("button", { name: /close registration/i })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /reopen registration/i })[0]);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/admin/landing-pages/c/status");
    expect(JSON.parse(init.body)).toEqual({ status: "published" });
  });
});

describe("NewPageDialog", () => {
  it("derives and shows the page link from the name, and posts to create then opens the editor", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: "new1" }) });
    render(<NewPageDialog open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: /workshop/i }));
    fireEvent.change(screen.getByLabelText(/page name/i), { target: { value: "MDC Batch 4" } });
    expect(screen.getByText("/e/mdc-batch-4")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /create page/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/admin/landing-pages/new1"));
    expect(JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)).toMatchObject({ title: "MDC Batch 4", kind: "workshop" });
  });
  it("shows the server's message when the link is taken and does not navigate", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "A page with that link already exists. Please choose a different link." }) });
    render(<NewPageDialog open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText(/page name/i), { target: { value: "PPC Batch 3" } });
    fireEvent.click(screen.getByRole("button", { name: /create page/i }));
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeTruthy());
    expect(push).not.toHaveBeenCalled();
  });
  it("blocks submit with no usable link (non-Latin name) and says why", () => {
    render(<NewPageDialog open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText(/page name/i), { target: { value: "دورة" } });
    expect((screen.getByRole("button", { name: /create page/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe(validateSlug("").ok ? "" : (validateSlug("") as { message: string }).message);
  });
  it("clears the server error when the name or the link is edited", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "A page with that link already exists." }) });
    render(<NewPageDialog open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText(/page name/i), { target: { value: "PPC Batch 3" } });
    fireEvent.click(screen.getByRole("button", { name: /create page/i }));
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /change/i }));
    fireEvent.change(screen.getByLabelText(/link ending/i), { target: { value: "ppc-batch-9" } });
    expect(screen.queryByText(/already exists/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /create page/i }));
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/page name/i), { target: { value: "PPC Batch 9" } });
    expect(screen.queryByText(/already exists/i)).toBeNull();
  });
  it("shows the stale-dates helper only when a seeded template is chosen, and sends templateId", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: "n2" }) });
    render(<NewPageDialog open onOpenChange={() => {}} />);
    const helper = /come from the original page/i;
    expect(screen.queryByText(helper)).toBeNull();
    fireEvent.change(screen.getByLabelText(/start from/i), { target: { value: "ppc-batch-3" } });
    expect(screen.getByText(helper)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/start from/i), { target: { value: "blank-course" } });
    expect(screen.queryByText(helper)).toBeNull();
    fireEvent.change(screen.getByLabelText(/start from/i), { target: { value: "ppc-batch-3" } });
    fireEvent.change(screen.getByLabelText(/page name/i), { target: { value: "PPC Batch 4" } });
    fireEvent.click(screen.getByRole("button", { name: /create page/i }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)).toMatchObject({ kind: "course", templateId: "ppc-batch-3" });
  });
  it("only lists templates for the chosen kind", () => {
    render(<NewPageDialog open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: /webinar/i }));
    const opts = Array.from((screen.getByLabelText(/start from/i) as HTMLSelectElement).options).map((o) => o.value);
    expect(opts).toEqual(["blank-webinar", "w20-diabetes"]);
  });
});

describe("DuplicatePageDialog", () => {
  it("prefills the name, posts to duplicate and opens the editor on 201", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: "dup1" }) });
    render(<DuplicatePageDialog page={pages[0]} open onOpenChange={() => {}} />);
    expect((screen.getByLabelText(/page name/i) as HTMLInputElement).value).toBe("PPC Batch 3 (copy)");
    expect(screen.getByText("/e/ppc-batch-3-copy")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /duplicate page/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/admin/landing-pages/dup1"));
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/admin/landing-pages/a/duplicate");
    expect(JSON.parse(init.body)).toMatchObject({ title: "PPC Batch 3 (copy)" });
  });
  it("clears the server error when the link is edited", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "A page with that link already exists." }) });
    render(<DuplicatePageDialog page={pages[0]} open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /duplicate page/i }));
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /change/i }));
    fireEvent.change(screen.getByLabelText(/link ending/i), { target: { value: "ppc-b3-copy-2" } });
    expect(screen.queryByText(/already exists/i)).toBeNull();
  });
  it("shows the server's error inline", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "A page with that link already exists." }) });
    render(<DuplicatePageDialog page={pages[0]} open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /duplicate page/i }));
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeTruthy());
    expect(push).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Task 10 stage 1: FieldInput, SectionForm, compress-image
// ---------------------------------------------------------------------------
import { SectionForm } from "@/components/admin/landing/SectionForm";
import { FieldInput } from "@/components/admin/landing/FieldInput";
import { compressImage } from "@/lib/landing/compress-image";
import { emptyContent, updateSectionData } from "@/lib/landing/content";
import { SECTION_DEFS } from "@/lib/landing/sections";

describe("SectionForm", () => {
  it("shows plain labels, help text and a required marker, and reports edits as the full data object", () => {
    const onChange = vi.fn();
    const data = updateSectionData(emptyContent("course"), emptyContent("course").sections[0].id, {}).sections[0].data;
    render(<SectionForm type="hero" data={data} onChange={onChange} />);
    expect(screen.getByLabelText("Headline")).toBeTruthy();
    expect(screen.getAllByText(/required to publish/i).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "New title" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ headline: "New title" }));
  });
  it("adds, reorders and removes list items, and stops adding at maxItems", () => {
    const onChange = vi.fn();
    render(<SectionForm type="faq" data={{ heading: "H", items: [{ q: "1", a: "a" }, { q: "2", a: "b" }] }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /add question/i }));
    expect(onChange.mock.calls.at(-1)![0].items).toHaveLength(3);
    fireEvent.click(screen.getAllByRole("button", { name: /move question 2 up/i })[0]);
    expect(onChange.mock.calls.at(-1)![0].items.map((i: { q: string }) => i.q)).toEqual(["2", "1"]);
    fireEvent.click(screen.getAllByRole("button", { name: /remove question 1/i })[0]);
    expect(onChange.mock.calls.at(-1)![0].items).toHaveLength(1);
  });
  it("disables Add at maxItems and Move up/down at the ends", () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ text: `b${i}` }));
    render(<SectionForm type="hero" data={{ badges: six }} onChange={() => {}} />);
    expect((screen.getByRole("button", { name: "Add highlight" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Move Highlight 1 up" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Move Highlight 6 down" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("flags an unsafe link inline", () => {
    render(<SectionForm type="hero" data={{ secondaryCtaUrl: "javascript:alert(1)" }} onChange={() => {}} />);
    expect(screen.getByText(/starting with https/i)).toBeTruthy();
  });
});

describe("FieldInput validation messages", () => {
  const urlField = SECTION_DEFS.hero.fields.find((f) => f.key === "secondaryCtaUrl")!;
  const yt = (SECTION_DEFS.video_reviews.fields.find((f) => f.key === "items")!.itemFields ?? []).find((f) => f.kind === "youtube")!;

  it("shows no message for an empty or valid link, and never blocks typing", () => {
    const onChange = vi.fn();
    const { rerender } = render(<FieldInput field={urlField} value="" onChange={onChange} />);
    expect(screen.queryByText(/starting with https/i)).toBeNull();
    rerender(<FieldInput field={urlField} value="https://example.com" onChange={onChange} />);
    expect(screen.queryByText(/starting with https/i)).toBeNull();
    rerender(<FieldInput field={urlField} value="not a link" onChange={onChange} />);
    expect(screen.getByText(/starting with https/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(urlField.label), { target: { value: "still not" } });
    expect(onChange).toHaveBeenCalledWith("still not");
  });
  it("explains a bad YouTube link in plain words and accepts a good one", () => {
    const { rerender } = render(<FieldInput field={yt} value="https://example.com/x" onChange={() => {}} />);
    expect(screen.getByText(/doesn't look like a youtube link/i)).toBeTruthy();
    rerender(<FieldInput field={yt} value="https://youtu.be/dQw4w9WgXcQ" onChange={() => {}} />);
    expect(screen.queryByText(/doesn't look like a youtube link/i)).toBeNull();
  });
});

describe("compressImage", () => {
  const realCreate = document.createElement.bind(document);
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("falls back to the original file when the image cannot be decoded (no canvas support)", async () => {
    const file = new File(["abc"], "pic.png", { type: "image/png" });
    expect(await compressImage(file, { timeoutMs: 50 })).toBe(file);
  });
  it("never produces a 0-pixel canvas side for an extreme aspect ratio", async () => {
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: () => {} }), toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(["x"], { type: "image/webp" })) };
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => (tag === "canvas" ? canvas : realCreate(tag))) as never);
    class FakeImage {
      naturalWidth = 10000; naturalHeight = 1; onload: (() => void) | null = null; onerror: (() => void) | null = null;
      set src(_v: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("Image", FakeImage);
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const file = new File(["a".repeat(5000)], "wide.png", { type: "image/png" });
    const out = await compressImage(file);
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBeGreaterThanOrEqual(1);
    expect(out.type).toBe("image/webp");
  });
  it("falls back to the original when toBlob returns nothing or throws", async () => {
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: () => {} }), toBlob: () => { throw new Error("no"); } };
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => (tag === "canvas" ? canvas : realCreate(tag))) as never);
    class FakeImage { naturalWidth = 100; naturalHeight = 100; onload: (() => void) | null = null; onerror: (() => void) | null = null; set src(_v: string) { queueMicrotask(() => this.onload?.()); } }
    vi.stubGlobal("Image", FakeImage);
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const file = new File(["abc"], "pic.png", { type: "image/png" });
    expect(await compressImage(file)).toBe(file);
  });
});

// ---------------------------------------------------------------------------
// Task 10 stage 2: SectionList + AddSectionMenu
// ---------------------------------------------------------------------------
import { SectionList } from "@/components/admin/landing/SectionList";

describe("SectionList", () => {
  const c = emptyContent("webinar");
  const handlers = () => ({ onSelect: vi.fn(), onToggle: vi.fn(), onMove: vi.fn(), onRemove: vi.fn(), onAdd: vi.fn() });

  it("renders one row per section with a labelled switch, and disables Move up on the first and Move down on the last", () => {
    render(<SectionList sections={c.sections} selectedId={c.sections[0].id} {...handlers()} />);
    expect(screen.getAllByRole("switch")).toHaveLength(c.sections.length);
    expect(screen.getByRole("switch", { name: "Show Hero (top of page)" })).toBeTruthy();
    expect((screen.getAllByRole("button", { name: /move .* up/i })[0] as HTMLButtonElement).disabled).toBe(true);
    const downs = screen.getAllByRole("button", { name: /move .* down/i });
    expect((downs[downs.length - 1] as HTMLButtonElement).disabled).toBe(true);
  });
  it("calls onMove with the section id and direction, and onToggle with the id", () => {
    const h = handlers();
    render(<SectionList sections={c.sections} selectedId={null} {...h} />);
    fireEvent.click(screen.getAllByRole("button", { name: /move .* down/i })[0]);
    expect(h.onMove).toHaveBeenCalledWith(c.sections[0].id, 1);
    fireEvent.click(screen.getAllByRole("switch")[1]);
    expect(h.onToggle).toHaveBeenCalledWith(c.sections[1].id);
  });
  it("selects a section by its name and reflects hidden state in the switch", () => {
    const h = handlers();
    const hidden = { ...c, sections: c.sections.map((s, i) => (i === 1 ? { ...s, enabled: false } : s)) };
    render(<SectionList sections={hidden.sections} selectedId={null} {...h} />);
    expect(screen.getAllByRole("switch")[1].getAttribute("aria-checked")).toBe("false");
    expect(screen.getAllByRole("switch")[0].getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getAllByRole("button", { name: /^edit /i })[0]);
    expect(h.onSelect).toHaveBeenCalledWith(c.sections[0].id);
  });
  it("only removes a section after the admin confirms", async () => {
    const h = handlers();
    render(<SectionList sections={c.sections} selectedId={null} {...h} />);
    confirmFn.mockResolvedValueOnce(false);
    fireEvent.click(screen.getAllByRole("button", { name: /^remove /i })[0]);
    await waitFor(() => expect(confirmFn).toHaveBeenCalled());
    expect(h.onRemove).not.toHaveBeenCalled();
    confirmFn.mockResolvedValueOnce(true);
    fireEvent.click(screen.getAllByRole("button", { name: /^remove /i })[0]);
    await waitFor(() => expect(h.onRemove).toHaveBeenCalledWith(c.sections[0].id));
  });
  it("lists every section type with its description in the add menu and reports the pick", () => {
    const h = handlers();
    render(<SectionList sections={c.sections} selectedId={null} {...h} />);
    fireEvent.click(screen.getByRole("button", { name: /add section/i }));
    const menu = screen.getByText(/choose section type/i).parentElement as HTMLElement;
    for (const def of Object.values(SECTION_DEFS)) {
      expect(within(menu).getByRole("button", { name: new RegExp(def.label.replace(/[()/]/g, "\\$&")) })).toBeTruthy();
      expect(screen.getByText(def.description)).toBeTruthy();
    }
    fireEvent.click(within(menu).getByRole("button", { name: /questions and answers/i }));
    expect(h.onAdd).toHaveBeenCalledWith("faq");
  });
});

// ---------------------------------------------------------------------------
// Task 10 stage 3: PageSettingsPanel
// ---------------------------------------------------------------------------
import { PageSettingsPanel } from "@/components/admin/landing/PageSettingsPanel";

describe("PageSettingsPanel", () => {
  const base = emptyContent("course");
  const setup = (over: Partial<typeof base.settings> = {}) => {
    const onSettings = vi.fn();
    const onSeo = vi.fn();
    render(<PageSettingsPanel settings={{ ...base.settings, ...over }} seo={base.seo} slug="ppc-b3" onSettings={onSettings} onSeo={onSeo} />);
    return { onSettings, onSeo };
  };

  it("reports each settings edit as a patch", () => {
    const { onSettings, onSeo } = setup();
    fireEvent.change(screen.getByLabelText("Register button link"), { target: { value: "https://forms.example.com/x" } });
    expect(onSettings).toHaveBeenLastCalledWith({ registerUrl: "https://forms.example.com/x" });
    fireEvent.change(screen.getByLabelText("Register button text"), { target: { value: "Join now" } });
    expect(onSettings).toHaveBeenLastCalledWith({ registerLabel: "Join now" });
    fireEvent.change(screen.getByLabelText("WhatsApp number"), { target: { value: "923001234567" } });
    expect(onSettings).toHaveBeenLastCalledWith({ whatsappNumber: "923001234567" });
    fireEvent.change(screen.getByLabelText("Countdown label"), { target: { value: "Early Bird ends in" } });
    expect(onSettings).toHaveBeenLastCalledWith({ countdownLabel: "Early Bird ends in" });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "My title" } });
    expect(onSeo).toHaveBeenLastCalledWith({ title: "My title" });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Short text" } });
    expect(onSeo).toHaveBeenLastCalledWith({ description: "Short text" });
  });
  it("converts the countdown date (entered in Pakistan time) to an ISO instant, and back", () => {
    const { onSettings } = setup();
    fireEvent.change(screen.getByLabelText("Countdown ends (Pakistan time)"), { target: { value: "2026-10-15T19:30" } });
    expect(onSettings).toHaveBeenLastCalledWith({ countdownTo: "2026-10-15T14:30:00.000Z" });
  });
  it("clears the countdown when the date is emptied", () => {
    const { onSettings } = setup({ countdownTo: "2026-10-15T14:30:00.000Z" });
    fireEvent.change(screen.getByLabelText("Countdown ends (Pakistan time)"), { target: { value: "" } });
    expect(onSettings).toHaveBeenLastCalledWith({ countdownTo: "" });
  });
  it("shows the stored countdown in Pakistan time", () => {
    setup({ countdownTo: "2026-10-15T14:30:00.000Z" });
    expect((screen.getByLabelText("Countdown ends (Pakistan time)") as HTMLInputElement).value).toBe("2026-10-15T19:30");
  });
  it("flags a bad register link inline without blocking, and previews the share card", () => {
    setup({ registerUrl: "javascript:alert(1)" });
    expect(screen.getByText(/starting with https/i)).toBeTruthy();
    expect(screen.getByText("/e/ppc-b3")).toBeTruthy();
  });
});
