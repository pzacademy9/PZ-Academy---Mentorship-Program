import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/components/admin/landing/LibraryImageField", () => ({
  LibraryImageField: ({ value, onChange, labelledBy }: { value: string; onChange: (v: string) => void; labelledBy?: string }) => (
    <input aria-labelledby={labelledBy} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import { ProgramConfigForm } from "@/components/admin/program/ProgramConfigForm";
import { CourseAiPrompts } from "@/components/admin/program/CourseAiPrompts";
import { normalizeSections } from "@/lib/marketing/course-sections";
import type { CourseConfigDetail } from "@/lib/data/admin-lms";

const course: CourseConfigDetail = {
  id: "c1", slug: "fake-course", title: "Fake Course", type: "course", status: "open", isPublished: false,
  tagline: "Old fake line", description: "", pricePkr: 9000, level: "", durationText: "", timings: "",
  features: [], outcomes: ["Old skill"], faqs: [], publicVideoUrl: "", certificateImageUrl: "",
  pageSections: normalizeSections(null), topic: "", startsAt: "", topicOptions: [],
  registerUrl: "", gasWebappUrl: "", thumbnailUrl: "", bannerUrl: "", mentorName: "", mentorTitle: "", mentorBio: "", mentorAvatarUrl: "",
  moduleCount: 0, sessionCount: 0, enrollmentCounts: { total: 0, active: 0, pending: 0, rejected: 0, expired: 0 },
};

const FILE = `format: pz-course/1
tagline: New fake line
price: 7500
topic: Fake Topic

## What you'll learn
- New skill one
- New skill two
`;

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Import page from a file", () => {
  it("shows what will change, fills the boxes, and saves only on Save", async () => {
    render(<ProgramConfigForm course={course} />);
    fireEvent.click(screen.getByRole("button", { name: /Import page from a file/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/paste the file/i), { target: { value: FILE } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Check the file" }));

    const changes = within(dialog).getByRole("list", { name: "What will change" });
    const labels = within(changes).getAllByRole("listitem").map((li) => li.querySelector("p")?.textContent);
    expect(labels).toEqual(["Tagline", "Price", "Topic", "What you'll learn"]);
    expect(within(changes).getByText("PKR 9,000")).toBeTruthy();
    expect(within(changes).getByText("PKR 7,500")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Fill in the boxes" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((screen.getByLabelText("Topic") as HTMLInputElement).value).toBe("Fake Topic");
    expect((screen.getByLabelText("What you'll learn, line 2") as HTMLInputElement).value).toBe("New skill two");
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: /Save Changes/ })[0]);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body).toMatchObject({ tagline: "New fake line", pricePkr: 7500, topic: "Fake Topic", outcomes: ["New skill one", "New skill two"] });
  });

  it("shows the reason when the file is not in the right layout", () => {
    render(<ProgramConfigForm course={course} />);
    fireEvent.click(screen.getByRole("button", { name: /Import page from a file/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/paste the file/i), { target: { value: "hello" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Check the file" }));
    expect(within(dialog).getByRole("alert").textContent).toMatch(/not in the right layout/);
  });

  it("downloads the current page (unsaved changes included) as a file", async () => {
    let blob: Blob | null = null;
    vi.stubGlobal("URL", Object.assign(Object.create(URL), { createObjectURL: (b: Blob) => { blob = b; return "blob:x"; }, revokeObjectURL: () => {} }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<ProgramConfigForm course={course} />);
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "Unsaved Topic" } });
    fireEvent.click(screen.getByRole("button", { name: /Download my page as a file/ }));
    expect(click).toHaveBeenCalled();
    const text = await (blob as unknown as Blob).text();
    expect(text).toMatch(/^format: pz-course\/1\ntitle: Fake Course\ntype: course\ntagline: Old fake line\nprice: 9000\ntopic: Unsaved Topic\n/);
    expect(text).toContain("- Old skill");
    click.mockRestore();
  });
});

describe("AI help page", () => {
  it("switches between the three instructions and copies the chosen one", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<CourseAiPrompts prompts={{ whole: "WHOLE", page: "PAGE", improve: "IMPROVE" }} example="EXAMPLE" />);
    const group = screen.getByRole("group", { name: /What do you want to make/ });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(["Whole course", "Page only", "Improve my page"]);
    fireEvent.click(within(group).getByRole("button", { name: "Improve my page" }));
    expect((screen.getByLabelText("Instructions preview") as HTMLTextAreaElement).value).toBe("IMPROVE");
    expect(screen.getByText(/Download my page as a file\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy instructions" }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("IMPROVE"));
    expect(screen.getByRole("button", { name: /Download example file/ })).toBeTruthy();
  });
  it("the page is admin only", () => {
    const src = readFileSync("src/app/dashboard/admin/courses/ai/page.tsx", "utf8");
    expect(src).toMatch(/await requireAdminPage\("courses"\)/);
  });
});
