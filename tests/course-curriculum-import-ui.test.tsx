import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

import { ImportCurriculumDialog } from "@/components/admin/program/ImportCurriculumDialog";

const CHANGES = [
  { id: "new-module:1", label: "New module: Fake Module (2 sessions)", defaultOn: true, kind: "new-module", moduleIndex: 1, sessionCount: 2, fingerprint: "fp-new" },
  {
    id: "update-session:l1", label: "Update session: Fake Session", defaultOn: true, kind: "update-session",
    lessonId: "l1", moduleIndex: 0, sessionIndex: 0, rows: [{ part: "video", from: "", to: "https://example.test/v" }], fingerprint: "fp-upd",
  },
  { id: "remove-session:l2", label: "Not in the file: Old Session. Will stay unless removed.", defaultOn: false, kind: "remove-session", lessonId: "l2", title: "Old Session", fingerprint: "fp-rm" },
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
    expect(JSON.parse(init.body)).toEqual({
      text: "FILE TEXT",
      ids: ["new-module:1", "update-session:l1"],
      fingerprints: { "new-module:1": "fp-new", "update-session:l1": "fp-upd" },
    });
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
    const sent = JSON.parse(init.body);
    expect(sent.ids).toContain("remove-session:l2");
    expect(sent.confirmRemove).toBe(true);
    expect(sent.fingerprints["remove-session:l2"]).toBe("fp-rm");
  });

  it("keeps the dialog open to show removals that were kept, and still refreshes", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/check")
        ? respond(200, { type: "course", warnings: [], changes: CHANGES })
        : respond(200, { applied: 1, notes: ["Old Session was kept. It has student progress on a live program. Remove it in the builder if you are sure."] }),
    );
    const dialog = await openChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply the ticked changes" }));
    await within(dialog).findByText(/Old Session was kept/);
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(within(dialog).getByText("Done. 1 change saved.")).toBeTruthy();
    const close = within(dialog).getAllByRole("button", { name: "Close" }).find((b) => b.textContent === "Close")!;
    fireEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("refreshes the builder after a partial failure and keeps the dialog open", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/check")
        ? respond(200, { type: "course", warnings: [], changes: CHANGES })
        : respond(500, { errors: ["Some changes could not be saved. The ones before it were applied."], applied: 1, notes: [] }),
    );
    const dialog = await openChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply the ticked changes" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toMatch(/could not be saved/);
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("does not refresh when a failure saved nothing", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/check")
        ? respond(200, { type: "course", warnings: [], changes: CHANGES })
        : respond(500, { errors: ["Something went wrong. Please try again."], applied: 0 }),
    );
    const dialog = await openChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply the ticked changes" }));
    await within(dialog).findByRole("alert");
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("cannot be closed while Apply is saving", async () => {
    let finish: (r: Response) => void = () => {};
    fetchMock.mockImplementation((url: string) =>
      url.endsWith("/check")
        ? Promise.resolve(respond(200, { type: "course", warnings: [], changes: CHANGES }))
        : new Promise<Response>((r) => { finish = r; }),
    );
    const dialog = await openChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply the ticked changes" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    finish(respond(200, { applied: 2 }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("drops a file read that finishes after the dialog was closed", async () => {
    let finishRead: (v: string) => void = () => {};
    render(<ImportCurriculumDialog open onOpenChange={onOpenChange} courseId="c1" onApplied={onApplied} />);
    const dialog = screen.getByRole("dialog");
    const file = { text: () => new Promise<string>((r) => { finishRead = r; }) } as unknown as File;
    fireEvent.change(within(dialog).getByLabelText("Choose a file"), { target: { files: [file] } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    finishRead("LATE TEXT");
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks for the remove confirm again after the remove row is unticked and re-ticked", async () => {
    const dialog = await openChecked();
    const row = within(dialog).getByRole("checkbox", { name: /Old Session/ });
    fireEvent.click(row);
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Yes, remove the ticked items" }));
    const apply = within(dialog).getByRole("button", { name: "Apply the ticked changes" }) as HTMLButtonElement;
    expect(apply.disabled).toBe(false);
    fireEvent.click(row);
    fireEvent.click(row);
    expect((within(dialog).getByRole("checkbox", { name: "Yes, remove the ticked items" }) as HTMLInputElement).checked).toBe(false);
    expect(apply.disabled).toBe(true);
  });

  it("sends Apply only once on a fast double click", async () => {
    const dialog = await openChecked();
    const apply = within(dialog).getByRole("button", { name: "Apply the ticked changes" });
    fireEvent.click(apply);
    fireEvent.click(apply);
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).endsWith("/apply"))).toHaveLength(1);
  });

  it("long links can wrap: the list and dialog allow shrinking", async () => {
    const dialog = await openChecked();
    expect(dialog.className).toContain("grid-cols-[minmax(0,1fr)]");
    const list = within(dialog).getAllByRole("list", { name: "Changes" })[1];
    expect(list.className).toContain("min-w-0");
    expect(list.querySelector("li")?.className).toContain("min-w-0");
    const detail = Array.from(list.querySelectorAll("span")).find((el) => el.className.includes("break-words"));
    expect(detail?.className).toContain("[overflow-wrap:anywhere]");
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
