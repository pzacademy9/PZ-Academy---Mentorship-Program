import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { CourseBuilder } from "@/components/admin/program/CourseBuilder";
import { ModuleNotesPanel } from "@/components/admin/program/ModuleNotesPanel";
import type { BuilderState } from "@/lib/data/admin-lms";
import type { CourseType } from "@/lib/validations/admin-lms";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/components/admin/program/LessonEditorPanel", () => ({
  LessonEditorPanel: () => <div data-testid="lesson-editor" />,
}));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  router.refresh.mockClear();
  router.push.mockClear();
  Object.values(toastMock).forEach((m) => m.mockClear());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function json(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function state(
  type: CourseType,
  opts: { isPublished?: boolean; lessons?: { title: string; hasVideo: boolean; quizCount: number }[] } = {},
): BuilderState {
  const lessons = opts.lessons ?? [
    { title: "Day 1", hasVideo: true, quizCount: 1 },
    { title: "Day 6", hasVideo: false, quizCount: 1 },
  ];
  const flat = type !== "course";
  return {
    course: { id: "c1", slug: "c-one", title: "Course One", type, isPublished: opts.isPublished ?? false },
    flat,
    modules: [
      {
        id: "m1",
        title: "Module A",
        orderIndex: 0,
        notesCount: 3,
        lessons: lessons.map((l, i) => ({
          id: `l${i}`,
          title: l.title,
          contentType: "text" as const,
          orderIndex: i,
          hasVideo: l.hasVideo,
          quizCount: l.quizCount,
        })),
      },
    ],
  };
}

describe("outline readiness dots", () => {
  it("shows 'no quiz' on a course row without a quiz", () => {
    render(<CourseBuilder initialState={state("course", { lessons: [{ title: "Day 1", hasVideo: true, quizCount: 0 }] })} />);
    expect(screen.getByText("no quiz")).toBeTruthy();
    expect(screen.getByLabelText("Missing: no quiz")).toBeTruthy();
  });

  it("does not show 'no quiz' on a webinar row without a quiz", () => {
    render(<CourseBuilder initialState={state("webinar", { lessons: [{ title: "Day 1", hasVideo: true, quizCount: 0 }] })} />);
    expect(screen.queryByText("no quiz")).toBeNull();
    expect(screen.getByLabelText("Ready")).toBeTruthy();
  });

  it("shows no reason for mentorship rows", () => {
    render(<CourseBuilder initialState={state("mentorship", { lessons: [{ title: "Day 1", hasVideo: false, quizCount: 0 }] })} />);
    expect(screen.queryByText(/^no /)).toBeNull();
  });
});

describe("header readiness label", () => {
  it("reads 'Ready: 1 of 2 sessions'", () => {
    render(<CourseBuilder initialState={state("course")} />);
    expect(screen.getByText("Ready: 1 of 2 sessions")).toBeTruthy();
  });

  it("is hidden for mentorship", () => {
    render(<CourseBuilder initialState={state("mentorship")} />);
    expect(screen.queryByText(/Ready:/)).toBeNull();
    expect(screen.queryByText("No sessions yet")).toBeNull();
  });
});

describe("publish confirm", () => {
  it("opens the confirm with the gap listed and publishes on 'Publish anyway'", async () => {
    fetchMock.mockResolvedValue(json({ isPublished: true }));
    render(<CourseBuilder initialState={state("course")} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(screen.getByText("1 session is not ready")).toBeTruthy();
    expect(screen.getByText("Day 6: no video")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Publish anyway" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/courses/c1/publish");
    expect(JSON.parse(init.body)).toEqual({ publish: true });
  });

  it("'Go back and fix' closes without publishing", async () => {
    render(<CourseBuilder initialState={state("course")} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(screen.getByRole("button", { name: "Go back and fix" }));
    await waitFor(() => expect(screen.queryByText("Day 6: no video")).toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("publishes directly when everything is ready", async () => {
    fetchMock.mockResolvedValue(json({ isPublished: true }));
    render(
      <CourseBuilder
        initialState={state("course", { lessons: [{ title: "Day 1", hasVideo: true, quizCount: 1 }] })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(screen.queryByText(/not ready/)).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("never opens the dialog when unpublishing", async () => {
    fetchMock.mockResolvedValue(json({ isPublished: false }));
    render(<CourseBuilder initialState={state("course", { isPublished: true })} />);
    fireEvent.click(screen.getByRole("button", { name: "Unpublish" }));
    expect(screen.queryByText(/not ready/)).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ publish: false });
  });

  it("keeps showing the route's error toast", async () => {
    fetchMock.mockResolvedValue(json({ error: "Add at least one session" }, 422));
    render(<CourseBuilder initialState={state("course", { lessons: [] })} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Add at least one session"));
  });
});

describe("module header actions", () => {
  it("flat course has no Copy module and no Notes chip", () => {
    render(<CourseBuilder initialState={state("webinar")} />);
    expect(screen.queryByRole("button", { name: /Copy module/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Notes/ })).toBeNull();
  });

  it("Copy module calls the route, toasts and refreshes", async () => {
    fetchMock.mockResolvedValue(json({ id: "m2", filesToReupload: 2 }, 201));
    render(<CourseBuilder initialState={state("course")} />);
    fireEvent.click(screen.getByRole("button", { name: /Copy module/ }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/modules/m1/copy");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(toastMock.success).toHaveBeenCalledWith("Module copied");
    expect(toastMock.info).toHaveBeenCalledWith("2 uploaded files were not copied; upload them again");
  });

  it("Notes chip shows the count and opens the module notes panel", async () => {
    fetchMock.mockResolvedValue(json({ resources: [], documents: [] }));
    render(<CourseBuilder initialState={state("course")} />);
    const chip = screen.getByRole("button", { name: /Notes/ });
    expect(chip.textContent).toContain("3");
    fireEvent.click(chip);
    expect(await screen.findByText("Notes here are shown to students on every session in this module.")).toBeTruthy();
    expect(screen.queryByTestId("lesson-editor")).toBeNull();
  });
});

describe("Copy course", () => {
  it("copies then navigates to the new builder", async () => {
    fetchMock.mockResolvedValue(json({ id: "c2", slug: "c-two", filesToReupload: 0 }, 201));
    render(<CourseBuilder initialState={state("course")} />);
    fireEvent.click(screen.getByRole("button", { name: /Copy course/ }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/admin/courses/c2/builder"));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/courses/c1/copy");
    expect(toastMock.success).toHaveBeenCalledWith("Course copied as a draft");
  });
});

describe("CourseBuilder re-sync after refresh", () => {
  it("shows a new module from a fresh server payload and keeps the selection", () => {
    const first = state("course");
    const { rerender } = render(<CourseBuilder initialState={first} />);
    expect(screen.queryByText("Module B")).toBeNull();
    const next: BuilderState = {
      ...first,
      modules: [
        ...first.modules,
        { id: "m2", title: "Module B", orderIndex: 1, notesCount: 0, lessons: [] },
      ],
    };
    rerender(<CourseBuilder initialState={next} />);
    expect(screen.getByText("Module B")).toBeTruthy();
    expect(screen.getByText("Module A")).toBeTruthy();
  });

  it("keeps the module notes view only while the module still exists", async () => {
    fetchMock.mockResolvedValue(json({ resources: [], documents: [] }));
    const first = state("course");
    const { rerender } = render(<CourseBuilder initialState={first} />);
    fireEvent.click(screen.getByRole("button", { name: /Notes/ }));
    expect(await screen.findByText(/shown to students on every session/)).toBeTruthy();
    rerender(<CourseBuilder initialState={{ ...first, modules: [{ ...first.modules[0], title: "Module A2" }] }} />);
    expect(screen.getByText(/shown to students on every session/)).toBeTruthy();
    rerender(<CourseBuilder initialState={{ ...first, modules: [{ ...first.modules[0], id: "m9" }] }} />);
    expect(screen.queryByText(/shown to students on every session/)).toBeNull();
  });
});

describe("ModuleNotesPanel", () => {
  it("toasts when the notes cannot be loaded", async () => {
    fetchMock.mockResolvedValue(json({ error: "x" }, 500));
    render(<ModuleNotesPanel moduleId="m1" moduleTitle="A" courseSlug="c" onNotesCountChange={vi.fn()} />);
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("Could not load the notes for this module."),
    );
  });

  it("loads notes by module id and PATCHes on change", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === "PATCH"
        ? json({ ok: true })
        : json({ resources: [{ label: "Slides", url: "https://x.test" }], documents: [] }),
    );
    const onNotesCountChange = vi.fn();
    render(
      <ModuleNotesPanel
        moduleId="m1"
        moduleTitle="Module A"
        courseSlug="c-one"
        onNotesCountChange={onNotesCountChange}
      />,
    );
    expect(await screen.findByDisplayValue("Slides")).toBeTruthy();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/modules/m1/notes");
    fireEvent.click(screen.getByRole("button", { name: "Remove link" }));
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find((c) => c[1]?.method === "PATCH");
      expect(patch).toBeTruthy();
      expect(patch![0]).toBe("/api/admin/modules/m1/notes");
      expect(JSON.parse(patch![1].body)).toEqual({ resources: [] });
    });
    expect(onNotesCountChange).toHaveBeenCalledWith("m1", 0);
  });

  it("ignores a late response after switching to another module", async () => {
    let resolveA: (v: unknown) => void = () => {};
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/m1/")) return new Promise((r) => (resolveA = r));
      return Promise.resolve(json({ resources: [{ label: "B link", url: "https://b.test" }], documents: [] }));
    });
    const props = { courseSlug: "c-one", onNotesCountChange: vi.fn() };
    const { rerender } = render(<ModuleNotesPanel moduleId="m1" moduleTitle="A" {...props} />);
    rerender(<ModuleNotesPanel moduleId="m2" moduleTitle="B" {...props} />);
    expect(await screen.findByDisplayValue("B link")).toBeTruthy();
    resolveA(json({ resources: [{ label: "A link", url: "https://a.test" }], documents: [] }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByDisplayValue("A link")).toBeNull();
    expect(screen.getByDisplayValue("B link")).toBeTruthy();
  });
});
