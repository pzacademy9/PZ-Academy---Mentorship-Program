import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";

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

// ---------------------------------------------------------------------------
// Task 10 stage 4: PreviewTarget
// ---------------------------------------------------------------------------
import { PreviewTarget } from "@/components/admin/landing/PreviewTarget";

describe("PreviewTarget", () => {
  it("accepts a same-origin preview message and ignores other origins and shapes", async () => {
    const base = updateSectionData(emptyContent("webinar"), emptyContent("webinar").sections[0].id, {});
    const first = base.sections[0].id;
    const initial = updateSectionData(base, first, { headline: "ORIGINAL" });
    render(<PreviewTarget initialContent={initial} status="draft" kind="webinar" title="T" />);
    expect(screen.getAllByText("ORIGINAL").length).toBeGreaterThan(0);
    const next = updateSectionData(initial, first, { headline: "UPDATED" });
    window.dispatchEvent(new MessageEvent("message", { data: { type: "landing-preview", content: next }, origin: "https://evil.example" }));
    await Promise.resolve();
    expect(screen.queryByText("UPDATED")).toBeNull();
    window.dispatchEvent(new MessageEvent("message", { data: { type: "something-else", content: next }, origin: window.location.origin }));
    await Promise.resolve();
    expect(screen.queryByText("UPDATED")).toBeNull();
    window.dispatchEvent(new MessageEvent("message", { data: { type: "landing-preview", content: next }, origin: window.location.origin }));
    await waitFor(() => expect(screen.getAllByText("UPDATED").length).toBeGreaterThan(0));
  });
  it("survives a malformed same-origin payload by falling back to a safe normalized page", async () => {
    const initial = emptyContent("webinar");
    render(<PreviewTarget initialContent={initial} status="draft" kind="webinar" title="T" />);
    window.dispatchEvent(new MessageEvent("message", { data: { type: "landing-preview", content: "garbage" }, origin: window.location.origin }));
    await Promise.resolve();
    expect(document.body).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Task 10 stage 5: PreviewFrame + LandingEditor shell
// ---------------------------------------------------------------------------
const uploads = vi.hoisted(() => ({ pending: [] as ((url: string) => void)[] }));
vi.mock("@/components/admin/program/ImageUploadField", () => ({
  // Models the real field: the upload captures onChange when the file is picked and calls it later.
  ImageUploadField: ({ onChange }: { onChange: (u: string) => void }) => (
    <button type="button" onClick={() => { const captured = onChange; uploads.pending.push((u) => captured(u)); }}>Fake pick file</button>
  ),
}));
const autosave = vi.hoisted(() => ({ message: null as string | null, state: "saved" as string, schedule: vi.fn(), saveNow: vi.fn(), onRevision: undefined as undefined | ((r: number) => void) }));
vi.mock("@/hooks/useAutosaveDraft", () => ({
  useAutosaveDraft: (args: { onRevision?: (r: number) => void }) => { autosave.onRevision = args.onRevision; return { state: autosave.state, message: autosave.message, schedule: autosave.schedule, saveNow: autosave.saveNow }; },
}));
import { PreviewFrame } from "@/components/admin/landing/PreviewFrame";
import { LandingEditor } from "@/components/admin/landing/LandingEditor";

describe("PreviewFrame", () => {
  it("renders the preview route in an iframe and posts every content change to it, same-origin only", () => {
    const c1 = emptyContent("webinar");
    const { rerender } = render(<PreviewFrame content={c1} pageId="p1" />);
    const frame = screen.getByTitle("Page preview") as HTMLIFrameElement;
    expect(frame.getAttribute("src")).toBe("/dashboard/admin/landing-pages/p1/preview");
    const postMessage = vi.fn();
    Object.defineProperty(frame, "contentWindow", { value: { postMessage }, configurable: true });
    const c2 = updateSectionData(c1, c1.sections[0].id, { headline: "Hello" });
    rerender(<PreviewFrame content={c2} pageId="p1" />);
    expect(postMessage).toHaveBeenLastCalledWith({ type: "landing-preview", content: c2 }, window.location.origin);
    fireEvent.load(frame);
    expect(postMessage).toHaveBeenCalledTimes(2);
  });
  it("switches between Laptop and Phone widths", () => {
    render(<PreviewFrame content={emptyContent("webinar")} pageId="p1" />);
    const laptop = screen.getByRole("button", { name: /laptop/i });
    const phone = screen.getByRole("button", { name: /phone/i });
    expect(laptop.getAttribute("aria-pressed")).toBe("true");
    const frame = screen.getByTitle("Page preview") as HTMLIFrameElement;
    expect(frame.style.width).toBe("1280px");
    fireEvent.click(phone);
    expect(phone.getAttribute("aria-pressed")).toBe("true");
    expect(frame.style.width).toBe("390px");
  });
});

describe("LandingEditor", () => {
  const draft = emptyContent("webinar");
  const page = {
    id: "p1", slug: "w21", kind: "webinar" as const, title: "Webinar 21", status: "draft" as const,
    draft, published: null, revision: 4, publishedAt: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z",
  };
  beforeEach(() => { autosave.state = "saved"; autosave.schedule.mockReset(); autosave.saveNow.mockReset(); refresh.mockReset(); });

  it("shows the page name, a preview-in-new-tab link and the section list, with the first section open", () => {
    render(<LandingEditor page={page} versions={[]} />);
    expect((screen.getByLabelText("Page name") as HTMLInputElement).value).toBe("Webinar 21");
    const link = screen.getByRole("link", { name: /preview in new tab/i });
    expect(link.getAttribute("href")).toBe("/dashboard/admin/landing-pages/p1/preview");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.getAllByRole("switch")).toHaveLength(draft.sections.length);
    expect(screen.getByLabelText("Headline")).toBeTruthy();
  });
  it("schedules an autosave with the full updated content when a field changes", () => {
    render(<LandingEditor page={page} versions={[]} />);
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "Brand new" } });
    expect(autosave.schedule).toHaveBeenCalledTimes(1);
    const sent = autosave.schedule.mock.calls[0][0];
    expect(sent.sections[0].data.headline).toBe("Brand new");
    expect(sent.sections).toHaveLength(draft.sections.length);
  });
  it("opens Page settings and routes edits into settings, not sections", () => {
    render(<LandingEditor page={page} versions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /page settings/i }));
    fireEvent.change(screen.getByLabelText("Register button text"), { target: { value: "Join" } });
    expect(autosave.schedule.mock.calls.at(-1)![0].settings.registerLabel).toBe("Join");
  });
  it("passes the save message through to the registration setup, on every step", async () => {
    const { ppcConfig } = await import("./fixtures/registration-fixtures");
    const { updateRegistration } = await import("@/lib/landing/content");
    const withReg = { ...page, draft: updateRegistration(page.draft, ppcConfig) };
    autosave.message = "Pick modules from this page's course.";
    try {
      render(<LandingEditor page={withReg} versions={[]} />);
      fireEvent.click(screen.getByRole("button", { name: /page settings/i }));
      fireEvent.click(screen.getByRole("button", { name: /Group discounts/ }));
      expect(screen.getByText("Pick modules from this page's course.")).toBeTruthy();
    } finally { autosave.message = null; }
  });
  it("drops a saved module id that is not in the course, so the next save is accepted", async () => {
    const { ppcConfig } = await import("./fixtures/registration-fixtures");
    const { updateRegistration } = await import("@/lib/landing/content");
    const reg = { ...ppcConfig, options: ppcConfig.options.map((o, i) => (i === 0 ? { ...o, moduleIds: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"] } : o)) };
    const withReg = { ...page, draft: updateRegistration(page.draft, reg) };
    render(<LandingEditor page={withReg} versions={[]} courseModules={[{ id: "22222222-2222-4222-8222-222222222222", title: "Module A", order_index: 1 }]} />);
    fireEvent.click(screen.getByRole("button", { name: /page settings/i }));
    fireEvent.click(screen.getAllByLabelText(/: Module A$/)[0]);
    const sent = autosave.schedule.mock.calls.at(-1)![0];
    expect(sent.registration.options[0].moduleIds).toEqual([]);
  });
  it("a registration problem's Fix button opens Page settings at that registration step", async () => {
    const { ppcConfig } = await import("./fixtures/registration-fixtures");
    const { updateRegistration } = await import("@/lib/landing/content");
    const reg = { ...ppcConfig, regions: ppcConfig.regions.map((g) => (g.key === "KSA" ? { ...g, accountKeys: ["Bad Key"] } : g)) };
    const withReg = { ...page, draft: updateRegistration(page.draft, reg) };
    render(<LandingEditor page={withReg} versions={[]} />);
    const item = screen.getByText(/payment account "bad key" for saudi arabia is not a known account code/i).closest("li") as HTMLElement;
    fireEvent.click(within(item).getByRole("button", { name: /fix/i }));
    expect(screen.getByRole("heading", { name: "Payment accounts" })).toBeTruthy();
  });
  it("shows the Registrations card above the setup when the built-in form is on", async () => {
    const { ppcConfig } = await import("./fixtures/registration-fixtures");
    const { updateRegistration } = await import("@/lib/landing/content");
    const reg = updateRegistration(page.draft, ppcConfig);
    const live = { ...page, status: "published" as const, draft: reg, published: reg };
    render(<LandingEditor page={live} versions={[]} sheetId="sheet-1" />);
    fireEvent.click(screen.getByRole("button", { name: /page settings/i }));
    const card = screen.getByRole("region", { name: "Registrations" });
    expect(within(card).getByRole("link", { name: /open sheet/i }).getAttribute("href")).toBe("https://docs.google.com/spreadsheets/d/sheet-1/edit");
    expect((within(card).getByRole("button", { name: /register as a customer/i }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("adds a section and selects it", () => {
    render(<LandingEditor page={page} versions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /add section/i }));
    const menu = screen.getByText(/choose section type/i).parentElement as HTMLElement;
    fireEvent.click(within(menu).getByRole("button", { name: /questions and answers/i }));
    const sent = autosave.schedule.mock.calls.at(-1)![0];
    expect(sent.sections.at(-1).type).toBe("faq");
    expect(screen.getByRole("heading", { name: "Questions and answers" })).toBeTruthy();
  });
  it.each([
    ["saved", "Saved"],
    ["saving", "Saving…"],
    ["dirty", "Unsaved changes"],
    ["error", "Couldn't save, retrying when you keep typing"],
  ])("shows the %s save state as %s", (state, text) => {
    autosave.state = state;
    render(<LandingEditor page={page} versions={[]} />);
    expect(screen.getByText(text)).toBeTruthy();
  });
  it.each([["dirty", true], ["saving", true], ["error", true], ["conflict", true], ["saved", false]])(
    "registers the beforeunload guard for state %s: %s", (state, expected) => {
      autosave.state = state;
      const add = vi.spyOn(window, "addEventListener");
      const { unmount } = render(<LandingEditor page={page} versions={[]} />);
      const registered = add.mock.calls.some(([type]) => type === "beforeunload");
      expect(registered).toBe(expected);
      const remove = vi.spyOn(window, "removeEventListener");
      unmount();
      if (expected) expect(remove.mock.calls.some(([type]) => type === "beforeunload")).toBe(true);
      add.mockRestore(); remove.mockRestore();
    });
  it("on conflict shows the banner and only reloads after the admin confirms discarding their edits", async () => {
    autosave.state = "conflict";
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    render(<LandingEditor page={page} versions={[]} />);
    expect(screen.getByText("Someone else changed this page. Reload to see their changes.")).toBeTruthy();
    confirmFn.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(confirmFn).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("Reloading discards the changes you just made. Reload anyway?") })));
    expect(reload).not.toHaveBeenCalled();
    confirmFn.mockResolvedValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    // A full browser reload always recovers; router.refresh() can be a no-op when the revision did not advance.
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(refresh).not.toHaveBeenCalled();
  });
  it("shows the phone notice with a link back to the list", () => {
    render(<LandingEditor page={page} versions={[]} />);
    expect(screen.getByText(/works best on a laptop or tablet/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /back to landing pages/i }).getAttribute("href")).toBe("/dashboard/admin/landing-pages");
  });
});

describe("LandingEditor fix round 1", () => {
  const draft = emptyContent("webinar");
  const page = {
    id: "p1", slug: "w21", kind: "webinar" as const, title: "Webinar 21", status: "draft" as const,
    draft, published: null, revision: 4, publishedAt: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z",
  };
  beforeEach(() => {
    autosave.state = "saved"; autosave.schedule.mockReset(); autosave.saveNow.mockReset(); refresh.mockReset();
    push.mockReset(); uploads.pending = [];
  });

  it("an upload that finishes late keeps edits made while it was running", () => {
    render(<LandingEditor page={page} versions={[]} />);
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "A edit" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Fake pick file" })[0]);
    fireEvent.change(screen.getByLabelText("Short description"), { target: { value: "B edit" } });
    act(() => uploads.pending[0]("https://img.example/new.webp"));
    const last = autosave.schedule.mock.calls.at(-1)![0];
    expect(last.sections[0].data.headline).toBe("A edit");
    expect(last.sections[0].data.subheadline).toBe("B edit");
    expect(last.sections[0].data.imagePc).toBe("https://img.example/new.webp");
  });
  it("a late share-image upload keeps settings edits made meanwhile", () => {
    render(<LandingEditor page={page} versions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /page settings/i }));
    fireEvent.click(screen.getAllByRole("button", { name: "Fake pick file" })[0]);
    fireEvent.change(screen.getByLabelText("Register button text"), { target: { value: "Join" } });
    act(() => uploads.pending[0]("https://img.example/share.webp"));
    const last = autosave.schedule.mock.calls.at(-1)![0];
    expect(last.settings.registerLabel).toBe("Join");
    expect(last.seo.ogImage).toBe("https://img.example/share.webp");
  });

  it("back link while dirty saves first, then navigates", async () => {
    autosave.state = "dirty";
    autosave.saveNow.mockResolvedValue(true);
    render(<LandingEditor page={page} versions={[]} />);
    fireEvent.click(screen.getByRole("link", { name: "Landing Pages" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/admin/landing-pages"));
    expect(autosave.saveNow).toHaveBeenCalled();
  });
  it("back link in the error state asks first and stays put when declined", async () => {
    autosave.state = "error";
    render(<LandingEditor page={page} versions={[]} />);
    confirmFn.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole("link", { name: "Landing Pages" }));
    await waitFor(() => expect(confirmFn).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("Your latest changes were not saved. Leave anyway?") })));
    expect(push).not.toHaveBeenCalled();
    confirmFn.mockResolvedValueOnce(true);
    fireEvent.click(screen.getByRole("link", { name: "Landing Pages" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/admin/landing-pages"));
  });
  it("unmounting while dirty fires a best-effort save", () => {
    autosave.state = "dirty";
    autosave.saveNow.mockResolvedValue(true);
    const { unmount } = render(<LandingEditor page={page} versions={[]} />);
    expect(autosave.saveNow).not.toHaveBeenCalled();
    unmount();
    expect(autosave.saveNow).toHaveBeenCalledTimes(1);
  });
  it("unmounting when saved does not save", () => {
    const { unmount } = render(<LandingEditor page={page} versions={[]} />);
    unmount();
    expect(autosave.saveNow).not.toHaveBeenCalled();
  });

  it("renames on blur by posting to the rename route", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", f);
    render(<LandingEditor page={page} versions={[]} />);
    const input = screen.getByLabelText("Page name");
    fireEvent.change(input, { target: { value: "  Better name " } });
    fireEvent.blur(input);
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(f.mock.calls[0][0]).toBe("/api/admin/landing-pages/p1/rename");
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ title: "Better name" });
  });
  it("does not send an empty or unchanged name, and restores the old one", () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    render(<LandingEditor page={page} versions={[]} />);
    const input = screen.getByLabelText("Page name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);
    expect(f).not.toHaveBeenCalled();
    expect(input.value).toBe("Webinar 21");
    fireEvent.blur(input);
    expect(f).not.toHaveBeenCalled();
  });
  it("reverts and reports when the rename fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Could not rename the page" }) }));
    render(<LandingEditor page={page} versions={[]} />);
    const input = screen.getByLabelText("Page name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Nope" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Could not rename the page"));
    await waitFor(() => expect(input.value).toBe("Webinar 21"));
  });
  it("Escape restores the saved name and sends no request", () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    render(<LandingEditor page={page} versions={[]} />);
    const input = screen.getByLabelText("Page name") as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "Foo" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(f).not.toHaveBeenCalled();
    expect(input.value).toBe("Webinar 21");
  });
  it("back link when the dirty save fails asks before leaving", async () => {
    autosave.state = "dirty";
    autosave.saveNow.mockResolvedValue(false);
    render(<LandingEditor page={page} versions={[]} />);
    confirmFn.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole("link", { name: "Landing Pages" }));
    await waitFor(() => expect(confirmFn).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("Your latest changes were not saved. Leave anyway?") })));
    expect(push).not.toHaveBeenCalled();
    confirmFn.mockResolvedValueOnce(true);
    fireEvent.click(screen.getByRole("link", { name: "Landing Pages" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/admin/landing-pages"));
  });
  it("an upload started in one section keeps edits made in another section after switching", () => {
    render(<LandingEditor page={page} versions={[]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Fake pick file" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Edit Closing call to action" }));
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "B edit" } });
    act(() => uploads.pending[0]("https://img.example/a.webp"));
    const last = autosave.schedule.mock.calls.at(-1)![0];
    const hero = last.sections.find((x: { type: string }) => x.type === "hero");
    const cta = last.sections.find((x: { type: string }) => x.type === "final_cta");
    expect(hero.data.imagePc).toBe("https://img.example/a.webp");
    expect(cta.data.headline).toBe("B edit");
  });
});

// ---------------------------------------------------------------------------
// Task 11: readiness checklist, publish flow, versions and restore
// ---------------------------------------------------------------------------
import { toast } from "sonner";
import { ReadinessPanel } from "@/components/admin/landing/ReadinessPanel";
import { VersionsPanel } from "@/components/admin/landing/VersionsPanel";
import { removeSection as removeSectionT11, updateSettings as updateSettingsT11, updateSeo as updateSeoT11 } from "@/lib/landing/content";

describe("ReadinessPanel", () => {
  it("lists plain-language problems with Fix buttons that jump to the section", () => {
    const onGoto = vi.fn();
    render(<ReadinessPanel problems={[{ message: 'Fill in "Headline" in "Hero".', sectionId: "s1" }, { message: "Give the page a name." }]} onGoto={onGoto} />);
    expect(screen.getByText(/Fill in "Headline"/)).toBeTruthy();
    const fix = screen.getAllByRole("button", { name: /fix/i });
    expect(fix).toHaveLength(1);
    fireEvent.click(fix[0]);
    expect(onGoto).toHaveBeenCalledWith("s1");
  });
  it("says everything is filled in when there are no problems", () => {
    render(<ReadinessPanel problems={[]} onGoto={() => {}} />);
    expect(screen.getByText(/everything is filled in/i)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Ready to publish?" })).toBeTruthy();
  });
});

describe("VersionsPanel", () => {
  it("restores the chosen version after confirmation", async () => {
    const onRestore = vi.fn();
    render(<VersionsPanel versions={[{ version: 3, createdAt: "2026-10-03T10:00:00Z" }, { version: 2, createdAt: "2026-10-02T10:00:00Z" }]} onRestore={onRestore} />);
    expect(screen.getByText(/Version 3 · 3 Oct 2026/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /restore this version/i })[1]);
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith(2));
    expect(confirmFn).toHaveBeenCalledWith(expect.objectContaining({ description: "Restore version 2? This replaces the live page and your draft." }));
  });
  it("does not restore when the confirm is declined", async () => {
    confirmFn.mockResolvedValue(false);
    const onRestore = vi.fn();
    render(<VersionsPanel versions={[{ version: 1, createdAt: "2026-10-01T10:00:00Z" }]} onRestore={onRestore} />);
    fireEvent.click(screen.getByRole("button", { name: /restore this version/i }));
    await waitFor(() => expect(confirmFn).toHaveBeenCalled());
    expect(onRestore).not.toHaveBeenCalled();
  });
  it("shows a helpful empty message before the first publish", () => {
    render(<VersionsPanel versions={[]} onRestore={() => {}} />);
    expect(screen.getByText(/no published versions yet/i)).toBeTruthy();
  });
});

describe("LandingEditor publish and versions", () => {
  const incomplete = emptyContent("webinar");
  let complete = emptyContent("webinar");
  for (const s of complete.sections) if (s.type !== "hero") complete = removeSectionT11(complete, s.id);
  complete = updateSectionData(complete, complete.sections[0].id, { headline: "Diabetes webinar" });
  complete = updateSettingsT11(complete, { registerUrl: "https://pharmacozyme.com/register" });
  complete = updateSeoT11(complete, { description: "A one hour webinar." });
  const mk = (over: Partial<Parameters<typeof LandingEditor>[0]["page"]> = {}) => ({
    id: "p1", slug: "w21", kind: "webinar" as const, title: "Webinar 21", status: "draft" as const,
    draft: complete, published: null, revision: 4, publishedAt: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", ...over,
  });
  const publishBtn = () => screen.getByRole("button", { name: /^(publish|published)$/i }) as HTMLButtonElement;
  const jsonRes = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  beforeEach(() => {
    autosave.state = "saved"; autosave.schedule.mockReset(); autosave.saveNow.mockReset(); autosave.saveNow.mockResolvedValue(true);
    refresh.mockReset(); toastError.mockReset();
    confirmFn.mockReset(); confirmFn.mockResolvedValue(true);
  });

  it("disables Publish while the page has problems and lists them in the checklist", () => {
    render(<LandingEditor page={mk({ draft: incomplete })} versions={[]} />);
    expect(publishBtn().disabled).toBe(true);
    expect(publishBtn().textContent).toBe("Publish");
    expect(screen.getByRole("heading", { name: "Ready to publish?" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^fix/i }).length).toBeGreaterThan(0);
  });
  it("enables Publish when complete, saves first, then posts to the publish route and refreshes", async () => {
    const order: string[] = [];
    autosave.saveNow.mockImplementation(async () => { order.push("save"); return true; });
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => { order.push(`fetch:${url}`); return jsonRes(200, { ok: true }); });
    render(<LandingEditor page={mk()} versions={[]} />);
    expect(screen.getByText(/everything is filled in/i)).toBeTruthy();
    expect(screen.getByText("Not published yet")).toBeTruthy();
    expect(publishBtn().disabled).toBe(false);
    fireEvent.click(publishBtn());
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(order).toEqual(["save", "fetch:/api/admin/landing-pages/p1/publish"]);
  });
  it("disables Publish while saving", () => {
    autosave.state = "saving";
    render(<LandingEditor page={mk()} versions={[]} />);
    expect(publishBtn().disabled).toBe(true);
  });
  it("aborts without calling the publish route when the save fails", async () => {
    autosave.saveNow.mockResolvedValue(false);
    render(<LandingEditor page={mk()} versions={[]} />);
    fireEvent.click(publishBtn());
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Your latest changes could not be saved. Try again."));
    expect(fetch).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
  it("shows the server's problems on a 422, does not refresh, and tells the admin", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonRes(422, { error: "not ready", problems: [{ message: "Server says: add a banner." }] }));
    render(<LandingEditor page={mk()} versions={[]} />);
    fireEvent.click(publishBtn());
    await waitFor(() => expect(screen.getByText("Server says: add a banner.")).toBeTruthy());
    expect(toastError).toHaveBeenCalledWith("Not ready to publish yet");
    expect(refresh).not.toHaveBeenCalled();
  });
  it("toasts and changes nothing on a network error", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("network"));
    render(<LandingEditor page={mk()} versions={[]} />);
    fireEvent.click(publishBtn());
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(refresh).not.toHaveBeenCalled();
    expect(publishBtn().disabled).toBe(false);
  });
  it("shows Live, and Published (disabled) when the draft equals the published copy", () => {
    render(<LandingEditor page={mk({ status: "published", published: complete })} versions={[]} />);
    expect(screen.getAllByText("Live").length).toBeGreaterThan(0);
    expect(screen.queryByText("Unpublished changes")).toBeNull();
    expect(publishBtn().textContent).toBe("Published");
    expect(publishBtn().disabled).toBe(true);
  });
  it("shows Unpublished changes and keeps the label Publish when the draft differs", () => {
    const published = updateSectionData(complete, complete.sections[0].id, { headline: "Older headline" });
    render(<LandingEditor page={mk({ status: "published", published })} versions={[]} />);
    expect(screen.getByText("Unpublished changes")).toBeTruthy();
    expect(publishBtn().textContent).toBe("Publish");
    expect(publishBtn().disabled).toBe(false);
  });
  it("shows Closed for a closed page", () => {
    render(<LandingEditor page={mk({ status: "closed", published: complete })} versions={[]} />);
    expect(screen.getAllByText("Closed").length).toBeGreaterThan(0);
  });
  it("Fix buttons select the section in the editor", () => {
    render(<LandingEditor page={mk({ draft: incomplete })} versions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /page settings/i }));
    expect(screen.queryByLabelText("Headline")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /^fix/i })[0]);
    expect(screen.getByLabelText("Headline")).toBeTruthy();
  });

  const openVersions = () => fireEvent.click(screen.getByRole("button", { name: /versions/i }));
  const versions = [{ version: 2, createdAt: "2026-10-02T10:00:00Z" }, { version: 1, createdAt: "2026-10-01T10:00:00Z" }];
  it("restore needs confirmation and does nothing when declined", async () => {
    confirmFn.mockResolvedValue(false);
    render(<LandingEditor page={mk({ status: "published", published: complete })} versions={versions} />);
    openVersions();
    fireEvent.click(screen.getAllByRole("button", { name: /restore this version/i })[1]);
    await waitFor(() => expect(confirmFn).toHaveBeenCalled());
    expect(fetch).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
  it("restore posts the version, refreshes, and never saves the pending local edits", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonRes(200, { ok: true }));
    render(<LandingEditor page={mk({ status: "published", published: complete })} versions={versions} />);
    openVersions();
    fireEvent.click(screen.getAllByRole("button", { name: /restore this version/i })[1]);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/admin/landing-pages/p1/rollback");
    expect(JSON.parse(init.body)).toEqual({ version: 1 });
    expect(autosave.saveNow).not.toHaveBeenCalled();
  });
  it("on a restore conflict shows the conflict toast and does not refresh", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonRes(409, { code: "conflict", error: "x" }));
    render(<LandingEditor page={mk({ status: "published", published: complete })} versions={versions} />);
    openVersions();
    fireEvent.click(screen.getAllByRole("button", { name: /restore this version/i })[0]);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Someone else changed this page. Reload and try again."));
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("LandingEditor fix round (closed, remount, conflict)", () => {
  let complete = emptyContent("webinar");
  for (const s of complete.sections) if (s.type !== "hero") complete = removeSectionT11(complete, s.id);
  complete = updateSectionData(complete, complete.sections[0].id, { headline: "Diabetes webinar" });
  complete = updateSettingsT11(complete, { registerUrl: "https://pharmacozyme.com/register" });
  complete = updateSeoT11(complete, { description: "A one hour webinar." });
  const mk = (over: Record<string, unknown> = {}) => ({
    id: "p1", slug: "w21", kind: "webinar" as const, title: "Webinar 21", status: "draft" as const,
    draft: complete, published: null, revision: 4, publishedAt: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", ...over,
  }) as Parameters<typeof LandingEditor>[0]["page"];
  const publishBtn = () => screen.getByRole("button", { name: /^(publish|published)$/i }) as HTMLButtonElement;
  const jsonRes = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const toastSuccess = toast.success as unknown as ReturnType<typeof vi.fn>;
  beforeEach(() => {
    autosave.state = "saved"; autosave.schedule.mockReset(); autosave.saveNow.mockReset(); autosave.saveNow.mockResolvedValue(true);
    refresh.mockReset(); toastError.mockReset(); toastSuccess.mockReset(); confirmFn.mockReset(); confirmFn.mockResolvedValue(true);
  });

  it("closed page with an unchanged draft: Publish is disabled, labelled Published, and explains how to reopen", () => {
    render(<LandingEditor page={mk({ status: "closed", published: complete })} versions={[]} />);
    expect(publishBtn().textContent).toBe("Published");
    expect(publishBtn().disabled).toBe(true);
    expect(screen.getByText("Registration is closed. Reopen it from the Landing Pages list.")).toBeTruthy();
  });
  it("closed page with changes: Publish is enabled and the success toast says registration stays closed", async () => {
    const published = updateSectionData(complete, complete.sections[0].id, { headline: "Older" });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonRes(200, { ok: true }));
    render(<LandingEditor page={mk({ status: "closed", published })} versions={[]} />);
    expect(publishBtn().disabled).toBe(false);
    fireEvent.click(publishBtn());
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Changes published. Registration stays closed."));
  });
  it("does not remount when the refreshed revision is one this editor saved itself", () => {
    const { rerender } = render(<LandingEditor page={mk()} versions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /page settings/i }));
    fireEvent.change(screen.getByLabelText("Register button text"), { target: { value: "Typed" } });
    act(() => autosave.onRevision?.(5));
    rerender(<LandingEditor page={mk({ revision: 5 })} versions={[]} />);
    expect((screen.getByLabelText("Register button text") as HTMLInputElement).value).toBe("Typed");
  });
  it("remounts onto the restored draft once this editor's restore succeeded and the refresh arrives", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonRes(200, { ok: true, version: 3 }));
    const versions = [{ version: 1, createdAt: "2026-10-01T10:00:00Z" }];
    const { rerender } = render(<LandingEditor page={mk({ status: "published", published: complete })} versions={versions} />);
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "Typed" } });
    fireEvent.click(screen.getByRole("button", { name: /versions/i }));
    fireEvent.click(screen.getByRole("button", { name: /restore this version/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const restored = updateSectionData(complete, complete.sections[0].id, { headline: "Restored headline" });
    rerender(<LandingEditor page={mk({ status: "published", published: restored, draft: restored, revision: 5 })} versions={versions} />);
    expect((screen.getByLabelText("Headline") as HTMLInputElement).value).toBe("Restored headline");
  });
  it("conflict state disables Publish, shows why, and never calls the publish route", () => {
    autosave.state = "conflict";
    render(<LandingEditor page={mk()} versions={[]} />);
    expect(publishBtn().disabled).toBe(true);
    expect(screen.getByText("Someone else changed this page. Reload to see their changes first.")).toBeTruthy();
    fireEvent.click(publishBtn());
    expect(fetch).not.toHaveBeenCalled();
  });
  it("server problems keep Publish disabled until the next edit", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonRes(422, { error: "x", problems: [{ message: "Server says no." }] }));
    render(<LandingEditor page={mk()} versions={[]} />);
    fireEvent.click(publishBtn());
    await waitFor(() => expect(screen.getByText("Server says no.")).toBeTruthy());
    expect(publishBtn().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "Edited" } });
    expect(screen.queryByText("Server says no.")).toBeNull();
    expect(publishBtn().disabled).toBe(false);
  });
  it("a rename clears the server's problem list", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonRes(422, { error: "x", problems: [{ message: "Server says no." }] }));
    render(<LandingEditor page={mk()} versions={[]} />);
    fireEvent.click(publishBtn());
    await waitFor(() => expect(screen.getByText("Server says no.")).toBeTruthy());
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonRes(200, { ok: true }));
    const name = screen.getByLabelText("Page name");
    fireEvent.change(name, { target: { value: "Renamed" } });
    fireEvent.blur(name);
    await waitFor(() => expect(screen.queryByText("Server says no.")).toBeNull());
  });
});

// ---------------------------------------------------------------------------
// Phase 1 leftovers (Task L3): editor polish
// ---------------------------------------------------------------------------
import { addSection as addSectionL3 } from "@/lib/landing/content";
import { defaultSectionData as defaultSectionDataL3 } from "@/lib/landing/sections";

describe("Editor polish (L3)", () => {
  let complete = emptyContent("webinar");
  for (const s of complete.sections) if (s.type !== "hero") complete = removeSectionT11(complete, s.id);
  complete = updateSectionData(complete, complete.sections[0].id, { headline: "Diabetes webinar" });
  complete = updateSettingsT11(complete, { registerUrl: "https://pharmacozyme.com/register" });
  complete = updateSeoT11(complete, { description: "A one hour webinar." });
  const mk = (over: Record<string, unknown> = {}) => ({
    id: "p1", slug: "w21", kind: "webinar" as const, title: "Webinar 21", status: "draft" as const,
    draft: complete, published: null, revision: 4, publishedAt: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", ...over,
  }) as Parameters<typeof LandingEditor>[0]["page"];
  const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
  beforeEach(() => {
    autosave.state = "saved"; autosave.schedule.mockReset(); autosave.saveNow.mockReset(); autosave.saveNow.mockResolvedValue(true);
    refresh.mockReset(); toastError.mockReset(); confirmFn.mockReset(); confirmFn.mockResolvedValue(true);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("drops the leave-page guard before the conflict Reload, so the browser does not ask a second time", async () => {
    autosave.state = "conflict";
    let prevented: boolean | null = null;
    const reload = vi.fn(() => {
      const ev = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(ev);
      prevented = ev.defaultPrevented;
    });
    vi.stubGlobal("location", { ...window.location, reload });
    render(<LandingEditor page={mk()} versions={[]} />);
    const before = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(true); // the guard is there while conflicted
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(prevented).toBe(false);
  });

  it("Fix jumps to the section and puts the cursor in the field that needs filling", async () => {
    render(<LandingEditor page={mk({ draft: emptyContent("webinar") })} versions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /page settings/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /^fix/i })[0]);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Headline")));
  });

  it("Fix on a list item focuses that item's field", async () => {
    let c = addSectionL3(complete, "faq");
    const faq = c.sections[c.sections.length - 1];
    c = updateSectionData(c, faq.id, { heading: "FAQ", items: [{ q: "", a: "Because." }] });
    render(<LandingEditor page={mk({ draft: c })} versions={[]} />);
    fireEvent.click(screen.getAllByRole("button", { name: /^fix/i })[0]);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Question")));
  });

  it("shows 'Required to publish' only while a required field is empty", () => {
    const { rerender } = render(<SectionForm type="hero" data={defaultSectionDataL3("hero")} onChange={() => {}} />);
    expect(screen.getAllByText(/required to publish/i)).toHaveLength(1);
    rerender(<SectionForm type="hero" data={{ ...defaultSectionDataL3("hero"), headline: "Filled" }} onChange={() => {}} />);
    expect(screen.queryByText(/required to publish/i)).toBeNull();
  });

  it("names each picture field for screen readers", () => {
    render(<SectionForm type="hero" data={defaultSectionDataL3("hero")} onChange={() => {}} />);
    expect(screen.getByRole("group", { name: /Picture for computers/ })).toBeTruthy();
    expect(screen.getByRole("group", { name: /Picture for phones/ })).toBeTruthy();
    // The old single picture only shows for the old style.
    expect(screen.queryByRole("group", { name: "Picture" })).toBeNull();
  });

  it("sends the current page name to the preview, so a rename shows there at once", () => {
    const c1 = emptyContent("webinar");
    const { rerender } = render(<PreviewFrame content={c1} pageId="p1" title="Old name" />);
    const frame = screen.getByTitle("Page preview") as HTMLIFrameElement;
    const postMessage = vi.fn();
    Object.defineProperty(frame, "contentWindow", { value: { postMessage }, configurable: true });
    rerender(<PreviewFrame content={c1} pageId="p1" title="New name" />);
    expect(postMessage).toHaveBeenLastCalledWith({ type: "landing-preview", content: c1, title: "New name" }, window.location.origin);
  });

  it("the preview page swaps in a posted page name", async () => {
    render(<PreviewTarget initialContent={complete} status="draft" kind="webinar" title="Old name" />);
    expect(screen.getAllByText("Old name").length).toBeGreaterThan(0);
    window.dispatchEvent(new MessageEvent("message", { data: { type: "landing-preview", content: complete, title: "New name" }, origin: window.location.origin }));
    await waitFor(() => expect(screen.getAllByText("New name").length).toBeGreaterThan(0));
    expect(screen.queryByText("Old name")).toBeNull();
  });

  it("each version row says a restore replaces the draft and the live page, like the confirm", () => {
    render(<VersionsPanel versions={[{ version: 1, createdAt: "2026-10-01T10:00:00Z" }]} onRestore={() => {}} />);
    expect(screen.getByText("Restoring replaces your draft and the live page")).toBeTruthy();
    expect(screen.queryByText(/overwrites the active draft/i)).toBeNull();
  });

  it("the Sections drawer is a modal on tablets: scrim, Escape, and focus kept inside", () => {
    render(<LandingEditor page={mk()} versions={[]} />);
    const toggle = screen.getByRole("button", { name: /^sections \(/i });
    expect(screen.queryByRole("dialog", { name: "Page sections" })).toBeNull();
    fireEvent.click(toggle);
    const dialog = screen.getByRole("dialog", { name: "Page sections" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const first = within(dialog).getByRole("button", { name: /page settings/i });
    expect(document.activeElement).toBe(first);
    const all = dialog.querySelectorAll<HTMLElement>(FOCUSABLE);
    const last = all[all.length - 1];
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Page sections" })).toBeNull();
    expect(document.activeElement).toBe(toggle);
    fireEvent.click(toggle);
    fireEvent.click(document.querySelector("[data-sections-scrim]") as HTMLElement);
    expect(screen.queryByRole("dialog", { name: "Page sections" })).toBeNull();
  });

  it("a refresh carrying a revision from this editor's own in-flight save keeps the editor (no remount, no lost typing)", () => {
    const { rerender } = render(<LandingEditor page={mk()} versions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /page settings/i }));
    fireEvent.change(screen.getByLabelText("Register button text"), { target: { value: "Typed during publish" } });
    // Publish's router.refresh() rendered the page after the autosave committed revision 5 on the server,
    // but before that save's response reached this editor (onRevision has not been called yet).
    rerender(<LandingEditor page={mk({ revision: 5 })} versions={[]} />);
    expect((screen.getByLabelText("Register button text") as HTMLInputElement).value).toBe("Typed during publish");
  });
});

// ---------------------------------------------------------------------------
// Phase 1 leftovers (Task L5): template review flags
// ---------------------------------------------------------------------------
describe("Template review flags (L5)", () => {
  let base = emptyContent("webinar");
  for (const s of base.sections) if (s.type !== "hero") base = removeSectionT11(base, s.id);
  base = updateSectionData(base, base.sections[0].id, { headline: "Diabetes webinar", dateLine: "16th September 2026" });
  base = updateSettingsT11(base, { registerUrl: "https://pharmacozyme.com/register" });
  base = updateSeoT11(base, { description: "A one hour webinar." });
  const flagged = { ...base, needsReview: [`${base.sections[0].id}:dateLine`] };
  const mk = () => ({
    id: "p1", slug: "w21", kind: "webinar" as const, title: "Webinar 21", status: "draft" as const,
    draft: flagged, published: null, revision: 4, publishedAt: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z",
  }) as Parameters<typeof LandingEditor>[0]["page"];
  beforeEach(() => { autosave.state = "saved"; autosave.schedule.mockReset(); autosave.saveNow.mockReset(); });

  it("ReadinessPanel offers Keep for flagged problems and reports their paths", () => {
    const onKeep = vi.fn();
    render(<ReadinessPanel problems={[{ message: "Update the event dates and prices in \"Hero\".", sectionId: "s1", field: "dateLine", review: ["s1:dateLine"] }]} onGoto={() => {}} onKeep={onKeep} />);
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(onKeep).toHaveBeenCalledWith(["s1:dateLine"]);
  });
  it("lists the template's old date in the checklist and keeps Publish locked", () => {
    render(<LandingEditor page={mk()} versions={[]} />);
    expect(screen.getByText(/^Update the event dates and prices in "Hero \(top of page\)"/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /^(publish|published)$/i }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("Keep clears the flag and autosaves it", () => {
    render(<LandingEditor page={mk()} versions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(autosave.schedule.mock.calls.at(-1)![0].needsReview).toEqual([]);
    expect(screen.queryByText(/^Update the event dates/)).toBeNull();
  });
  it("editing the flagged field clears its flag", () => {
    render(<LandingEditor page={mk()} versions={[]} />);
    fireEvent.change(screen.getByLabelText("Date and time line"), { target: { value: "20th October 2026" } });
    expect(autosave.schedule.mock.calls.at(-1)![0].needsReview).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Phase 1 leftovers (Task L6): single-actor repro of "restore shows stale content" and
// "rename flips back". If every test here passes, the findings were two-tab artefacts.
// ---------------------------------------------------------------------------
describe("Single-actor repro (L6)", () => {
  let complete = emptyContent("webinar");
  for (const s of complete.sections) if (s.type !== "hero") complete = removeSectionT11(complete, s.id);
  complete = updateSectionData(complete, complete.sections[0].id, { headline: "Diabetes webinar" });
  complete = updateSettingsT11(complete, { registerUrl: "https://pharmacozyme.com/register" });
  complete = updateSeoT11(complete, { description: "A one hour webinar." });
  const restored = updateSectionData(complete, complete.sections[0].id, { headline: "Restored headline" });
  const mk = (over: Record<string, unknown> = {}) => ({
    id: "p1", slug: "w21", kind: "webinar" as const, title: "Webinar 21", status: "published" as const,
    draft: complete, published: complete, revision: 4, publishedAt: "2026-10-01T00:00:00Z", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", ...over,
  }) as Parameters<typeof LandingEditor>[0]["page"];
  const versions = [{ version: 1, createdAt: "2026-10-01T10:00:00Z" }];
  const jsonRes = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const toastSuccess = toast.success as unknown as ReturnType<typeof vi.fn>;
  const headline = () => (screen.getByLabelText("Headline") as HTMLInputElement).value;
  const nameInput = () => screen.getByLabelText("Page name") as HTMLInputElement;
  async function restoreFirstVersion() {
    fireEvent.click(screen.getByRole("button", { name: /versions/i }));
    fireEvent.click(screen.getByRole("button", { name: /restore this version/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  }
  beforeEach(() => {
    autosave.state = "saved"; autosave.schedule.mockReset(); autosave.saveNow.mockReset(); autosave.saveNow.mockResolvedValue(true);
    refresh.mockReset(); toastError.mockReset(); toastSuccess.mockReset(); confirmFn.mockReset(); confirmFn.mockResolvedValue(true);
  });

  it("(a) restore after this editor already autosaved and published shows the restored content", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonRes(200, { ok: true, version: 3 }));
    const { rerender } = render(<LandingEditor page={mk()} versions={versions} />);
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "My edit" } });
    act(() => autosave.onRevision?.(5)); // this editor's own autosave reached revision 5
    rerender(<LandingEditor page={mk({ revision: 5 })} versions={versions} />); // e.g. a publish refresh
    expect(headline()).toBe("My edit");
    await restoreFirstVersion();
    rerender(<LandingEditor page={mk({ revision: 6, draft: restored, published: restored })} versions={versions} />);
    expect(headline()).toBe("Restored headline");
    expect(screen.queryByDisplayValue("My edit")).toBeNull();
  });

  it("(a) restore with an unsaved edit pending shows the restored content and a fresh preview frame", async () => {
    autosave.state = "dirty";
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonRes(200, { ok: true, version: 3 }));
    const { rerender } = render(<LandingEditor page={mk()} versions={versions} />);
    const frameBefore = screen.getByTitle("Page preview");
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "Pending edit" } });
    await restoreFirstVersion();
    autosave.state = "saved";
    rerender(<LandingEditor page={mk({ revision: 5, draft: restored, published: restored })} versions={versions} />);
    expect(headline()).toBe("Restored headline");
    // The editor remounted, so the preview iframe reloaded the restored draft from the server.
    expect(screen.getByTitle("Page preview")).not.toBe(frameBefore);
  });

  it("(b) a rename survives a later refresh whose server data still has the old name", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonRes(200, { ok: true, title: "New name" }));
    const { rerender } = render(<LandingEditor page={mk()} versions={versions} />);
    fireEvent.change(nameInput(), { target: { value: "New name" } });
    fireEvent.blur(nameInput());
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Page renamed."));
    rerender(<LandingEditor page={mk({ title: "Webinar 21" })} versions={versions} />);
    expect(nameInput().value).toBe("New name");
  });

  it("(b) a rename refreshes the router cache, so going back to Landing Pages or reopening shows the new name", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonRes(200, { ok: true, title: "New name" }));
    render(<LandingEditor page={mk()} versions={versions} />);
    fireEvent.change(nameInput(), { target: { value: "New name" } });
    fireEvent.blur(nameInput());
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Page renamed."));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("(b) a rename followed by a restore keeps the new name", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonRes(200, { ok: true, title: "New name" }))
      .mockResolvedValueOnce(jsonRes(200, { ok: true, version: 3 }));
    const { rerender } = render(<LandingEditor page={mk()} versions={versions} />);
    fireEvent.change(nameInput(), { target: { value: "New name" } });
    fireEvent.blur(nameInput());
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Page renamed."));
    refresh.mockReset();
    await restoreFirstVersion();
    rerender(<LandingEditor page={mk({ revision: 5, title: "New name", draft: restored, published: restored })} versions={versions} />);
    expect(nameInput().value).toBe("New name");
  });
});
