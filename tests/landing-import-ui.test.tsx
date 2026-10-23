import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));

import { LandingPagesList } from "@/components/admin/landing/LandingPagesList";
import { ImportPageDialog } from "@/components/admin/landing/ImportPageDialog";

const pages = [
  { id: "a", slug: "ppc-b3", kind: "course" as const, title: "PPC Batch 3", status: "draft" as const, revision: 1, publishedAt: null, updatedAt: "2026-10-02T00:00:00Z", hasUnpublishedChanges: true, courseId: null, isMainPage: false },
];

function reply(status: number, body: unknown) {
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: status < 300, status, json: async () => body });
}
function setText(value: string) {
  fireEvent.change(screen.getByLabelText(/page text/i), { target: { value } });
}

beforeEach(() => {
  push.mockReset(); refresh.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

describe("list entry points", () => {
  it("opens the import dialog from the Import .md button and links to the AI screen", () => {
    render(<LandingPagesList pages={pages} />);
    const ai = screen.getByRole("link", { name: /make a page with ai/i });
    expect(ai.getAttribute("href")).toBe("/dashboard/admin/landing-pages/ai");
    fireEvent.click(screen.getByRole("button", { name: /import \.md/i }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("ImportPageDialog", () => {
  it("has a labelled dialog, a .md/.txt file chooser, and a disabled Import button while empty", () => {
    render(<ImportPageDialog onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: /import a page/i })).toBeTruthy();
    const file = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(file.getAttribute("accept")).toBe(".md,.txt");
    expect((screen.getByRole("button", { name: "Import page" }) as HTMLButtonElement).disabled).toBe(true);
    setText("hello");
    expect((screen.getByRole("button", { name: "Import page" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("reads a chosen file into the text box", async () => {
    render(<ImportPageDialog onClose={vi.fn()} />);
    const file = document.querySelector('input[type="file"]') as HTMLInputElement;
    const f = new File(["# From file"], "page.md", { type: "text/markdown" });
    Object.defineProperty(f, "text", { value: async () => "# From file" });
    fireEvent.change(file, { target: { files: [f] } });
    await waitFor(() => expect((screen.getByLabelText(/page text/i) as HTMLTextAreaElement).value).toBe("# From file"));
  });

  it("sends { markdown } and shows errors as a list on 400, keeping the text and not navigating", async () => {
    reply(400, { errors: ["Title is missing", "Price is not a number"] });
    render(<ImportPageDialog onClose={vi.fn()} />);
    setText("some text");
    fireEvent.click(screen.getByRole("button", { name: "Import page" }));
    await screen.findByText("Could not import. Fix these and try again:");
    expect(screen.getByText("Title is missing")).toBeTruthy();
    expect(screen.getByText("Price is not a number")).toBeTruthy();
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("/api/admin/landing-pages/import");
    expect(JSON.parse(call[1].body)).toEqual({ markdown: "some text" });
    expect((screen.getByLabelText(/page text/i) as HTMLTextAreaElement).value).toBe("some text");
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the result on 201 and opens the page", async () => {
    reply(201, { pageId: "p1", slug: "ppc-4-2", slugChanged: true, warnings: ["Price looked odd"], linksCreated: 1, linksFailed: ["uk"] });
    render(<ImportPageDialog onClose={vi.fn()} />);
    setText("x");
    fireEvent.click(screen.getByRole("button", { name: "Import page" }));
    await screen.findByText("Page created as a draft.");
    expect(screen.getByText(/already taken, so it was changed to ppc-4-2/)).toBeTruthy();
    expect(screen.getByText("1 link created")).toBeTruthy();
    expect(screen.getByText("Check these")).toBeTruthy();
    expect(screen.getByText("Price looked odd")).toBeTruthy();
    expect(screen.getByText(/These links could not be created: uk/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open page" }));
    expect(push).toHaveBeenCalledWith("/dashboard/admin/landing-pages/p1");
  });

  it("omits the optional notes when there is nothing to report, and pluralises links", async () => {
    reply(201, { pageId: "p1", slug: "s", slugChanged: false, warnings: [], linksCreated: 3, linksFailed: [] });
    render(<ImportPageDialog onClose={vi.fn()} />);
    setText("x");
    fireEvent.click(screen.getByRole("button", { name: "Import page" }));
    await screen.findByText("3 links created");
    expect(screen.queryByText(/already taken/)).toBeNull();
    expect(screen.queryByText("Check these")).toBeNull();
    expect(screen.queryByText(/could not be created/)).toBeNull();
  });

  it("Close after success refreshes the list and calls onClose", async () => {
    reply(201, { pageId: "p1", slug: "s", slugChanged: false, warnings: [], linksCreated: 0, linksFailed: [] });
    const onClose = vi.fn();
    render(<ImportPageDialog onClose={onClose} />);
    setText("x");
    fireEvent.click(screen.getByRole("button", { name: "Import page" }));
    await screen.findByText("Page created as a draft.");
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]); // header X and footer button share one handler
    expect(refresh).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a plain message on network failure and never raw text", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("Failed to fetch xyz"));
    render(<ImportPageDialog onClose={vi.fn()} />);
    setText("x");
    fireEvent.click(screen.getByRole("button", { name: "Import page" }));
    await screen.findByText("Could not reach the server. Please try again.");
    expect(screen.queryByText(/xyz/)).toBeNull();
  });

  it("says the import may not have finished when the answer is not JSON (timeout page)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 504, json: async () => { throw new SyntaxError("Unexpected token <"); },
    });
    render(<ImportPageDialog onClose={vi.fn()} />);
    setText("x");
    fireEvent.click(screen.getByRole("button", { name: "Import page" }));
    await screen.findByText("The import may not have finished. Check the Landing Pages list before trying again.");
    expect(screen.queryByText(/could not reach the server/i)).toBeNull();
  });

  it("sends only one request when submitted twice quickly", async () => {
    let release: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((res) => { release = res; }));
    render(<ImportPageDialog onClose={vi.fn()} />);
    setText("x");
    const form = screen.getByRole("button", { name: "Import page" }).closest("form") as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(fetch).toHaveBeenCalledTimes(1);
    release({ ok: true, status: 201, json: async () => ({ pageId: "p1", slug: "s", slugChanged: false, warnings: [], linksCreated: 0, linksFailed: [] }) });
    await screen.findByText("Page created as a draft.");
  });

  it("refuses a file over 400,000 bytes without reading it, and resets the chooser", async () => {
    render(<ImportPageDialog onClose={vi.fn()} />);
    const file = document.querySelector('input[type="file"]') as HTMLInputElement;
    const f = new File(["x"], "big.md");
    Object.defineProperty(f, "size", { value: 400_001 });
    const read = vi.fn(async () => "x");
    Object.defineProperty(f, "text", { value: read });
    fireEvent.change(file, { target: { files: [f] } });
    await screen.findByText("That file is too big to import");
    expect(read).not.toHaveBeenCalled();
    expect(file.value).toBe("");
  });

  it("blocks text over 400,000 characters before sending", () => {
    render(<ImportPageDialog onClose={vi.fn()} />);
    setText("a".repeat(400_001));
    fireEvent.click(screen.getByRole("button", { name: "Import page" }));
    expect(screen.getByText(/too long/i)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("Escape closes when idle", () => {
    const onClose = vi.fn();
    render(<ImportPageDialog onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
