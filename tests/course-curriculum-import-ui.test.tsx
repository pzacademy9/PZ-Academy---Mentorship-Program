import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

import { ImportCurriculumDialog } from "@/components/admin/program/ImportCurriculumDialog";

const CHANGES = [
  { id: "new-module:1", label: "New module: Fake Module (2 sessions)", defaultOn: true, kind: "new-module", moduleIndex: 1, sessionCount: 2 },
  {
    id: "update-session:l1", label: "Update session: Fake Session", defaultOn: true, kind: "update-session",
    lessonId: "l1", moduleIndex: 0, sessionIndex: 0, rows: [{ part: "video", from: "", to: "https://example.test/v" }],
  },
  { id: "remove-session:l2", label: "Not in the file: Old Session. Will stay unless removed.", defaultOn: false, kind: "remove-session", lessonId: "l2" },
];

let fetchMock: ReturnType<typeof vi.fn>;
let onApplied: ReturnType<typeof vi.fn<() => void>>;
let onOpenChange: ReturnType<typeof vi.fn<(o: boolean) => void>>;

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  onApplied = vi.fn<() => void>();
  onOpenChange = vi.fn<(o: boolean) => void>();
  fetchMock = vi.fn(async (url: string) =>
    url.endsWith("/check") ? respond(200, { type: "course", warnings: ["Fake warning"], changes: CHANGES }) : respond(200, { applied: 2 }),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openChecked() {
  render(<ImportCurriculumDialog open onOpenChange={onOpenChange} courseId="c1" onApplied={onApplied} />);
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText(/paste the file/i), { target: { value: "FILE TEXT" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Check the file" }));
  await within(dialog).findByText("New");
  return dialog;
}

describe("Import curriculum dialog", () => {
  it("posts the text to the check route and groups the rows", async () => {
    const dialog = await openChecked();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe("/api/admin/courses/c1/import-curriculum/check");
    expect(JSON.parse(init.body)).toEqual({ text: "FILE TEXT" });
    expect(within(dialog).getByText("New")).toBeTruthy();
    expect(within(dialog).getByText("Different")).toBeTruthy();
    expect(within(dialog).getByText("Not in the file")).toBeTruthy();
    expect(within(dialog).getByText("Fake warning")).toBeTruthy();
    expect(within(dialog).getByText(/none/)).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: /Make a course file with AI/ }).getAttribute("href")).toBe("/dashboard/admin/courses/ai");
  });

  it("starts remove rows unticked and applies only ticked ids", async () => {
    const dialog = await openChecked();
    const box = within(dialog).getByRole("checkbox", { name: /Old Session/ }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply the ticked changes" }));
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, { body: string }];
    expect(url).toBe("/api/admin/courses/c1/import-curriculum/apply");
    expect(JSON.parse(init.body)).toEqual({ text: "FILE TEXT", ids: ["new-module:1", "update-session:l1"] });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("needs a second confirm before a ticked remove row can be applied", async () => {
    const dialog = await openChecked();
    expect(within(dialog).queryByText(/This deletes it for good/)).toBeNull();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Old Session/ }));
    expect(within(dialog).getByText("This deletes it for good. Students' saved progress on it is lost.")).toBeTruthy();
    const apply = within(dialog).getByRole("button", { name: "Apply the ticked changes" }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Yes, remove the ticked items" }));
    expect(apply.disabled).toBe(false);
    fireEvent.click(apply);
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    const init = fetchMock.mock.calls[1][1] as { body: string };
    expect(JSON.parse(init.body).ids).toContain("remove-session:l2");
  });

  it("turns Apply off when nothing is ticked", async () => {
    const dialog = await openChecked();
    for (const b of within(dialog).getAllByRole("button", { name: "Untick all" })) fireEvent.click(b);
    expect((within(dialog).getByRole("button", { name: "Apply the ticked changes" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a 409 message and returns to the start", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/check")
        ? respond(200, { type: "course", warnings: [], changes: CHANGES })
        : respond(409, { errors: ["The program changed. Check the file again."] }),
    );
    const dialog = await openChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply the ticked changes" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toMatch(/The program changed/);
    expect(within(dialog).getByRole("button", { name: "Check the file" })).toBeTruthy();
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("shows check errors", async () => {
    fetchMock.mockImplementation(async () => respond(400, { errors: ["This file is for a different kind of program."] }));
    render(<ImportCurriculumDialog open onOpenChange={onOpenChange} courseId="c1" onApplied={onApplied} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/paste the file/i), { target: { value: "X" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Check the file" }));
    expect((await within(dialog).findByRole("alert")).textContent).toMatch(/different kind/);
  });
});
