import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { VideoField } from "@/components/admin/program/VideoField";
import { QuizPasteDialog } from "@/components/admin/program/QuizPasteDialog";
import { LessonEditorPanel } from "@/components/admin/program/LessonEditorPanel";
import type { BuilderLesson } from "@/lib/data/admin-lms";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const rteChange = vi.hoisted(() => ({ current: null as ((html: string) => void) | null }));
vi.mock("@/components/admin/program/RichTextEditor", () => ({
  RichTextEditor: ({ onChange }: { onChange: (html: string) => void }) => {
    rteChange.current = onChange;
    return <div data-testid="rte" />;
  },
}));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("VideoField", () => {
  it("shows the unsupported message for a Drive link", () => {
    render(<VideoField label="Video" value="https://drive.google.com/file/d/abc/view" onSave={() => {}} />);
    expect(screen.getByText(/Google Drive videos cannot be played here/)).toBeTruthy();
  });

  it("shows YouTube video found for a watch link", () => {
    render(<VideoField label="Video" value="https://www.youtube.com/watch?v=abc123" onSave={() => {}} />);
    expect(screen.getByText("YouTube video found")).toBeTruthy();
  });

  it("calls onSave with an empty string when cleared", () => {
    const onSave = vi.fn();
    render(<VideoField label="Video" value="https://youtu.be/abc" onSave={onSave} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledWith("");
  });
});

const QUESTION = (n: number) => `Question number ${n}?\nA) One\nB) Two\nAnswer: B`;

describe("QuizPasteDialog", () => {
  function setup(text?: string) {
    const onAdded = vi.fn();
    render(<QuizPasteDialog lessonId="l1" open onOpenChange={() => {}} onAdded={onAdded} />);
    const area = screen.getByRole("textbox");
    if (text !== undefined) fireEvent.change(area, { target: { value: text } });
    return { onAdded };
  }

  it("disables the add button for empty input", () => {
    setup();
    expect((screen.getByRole("button", { name: /^Add/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables the add button while an error exists and lists it", () => {
    setup(`${QUESTION(1)}\n\nBroken question\nA) One\nB) Two`);
    expect((screen.getByRole("button", { name: /^Add/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Question 2/)).toBeTruthy();
  });

  it("enables the add button for a clean paste and posts to the bulk route", async () => {
    fetchMock.mockImplementation(async () => ({ ok: true, status: 201, json: async () => ({ created: 2 }) }));
    const { onAdded } = setup(`${QUESTION(1)}\n\n${QUESTION(2)}`);
    const btn = screen.getByRole("button", { name: "Add 2 questions" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(2));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/lessons/l1/quiz-questions/bulk");
    const body = JSON.parse(init.body);
    expect(body.questions).toHaveLength(2);
    expect(body.questions[0]).toEqual({ question: "Question number 1?", options: ["One", "Two"], correctIndex: 1 });
  });

  it("sends 250 questions in two requests of 200 and 50", async () => {
    fetchMock.mockImplementation(async (_u: string, init: { body: string }) => ({
      ok: true,
      status: 201,
      json: async () => ({ created: JSON.parse(init.body).questions.length }),
    }));
    const text = Array.from({ length: 250 }, (_, i) => QUESTION(i + 1)).join("\n\n");
    const { onAdded } = setup(text);
    fireEvent.click(screen.getByRole("button", { name: "Add 250 questions" }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(250));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).questions).toHaveLength(200);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).questions).toHaveLength(50);
  });
});

const LESSON: BuilderLesson = {
  id: "l1",
  title: "Day 1",
  contentType: "video",
  hasVideo: true,
  quizCount: 0,
} as unknown as BuilderLesson;

function detail(over: Record<string, unknown> = {}) {
  return {
    id: "l1",
    title: "Day 1",
    contentType: "video",
    videoUrl: "https://youtu.be/abc",
    videoUrl2: "",
    textContent: "",
    pdfFileId: null,
    resources: [],
    documents: [],
    quizQuestions: [],
    ...over,
  };
}

function renderPanel(d: Record<string, unknown>, onLessonPatched = vi.fn()) {
  fetchMock.mockImplementation(async (url: string, init?: { method?: string }) => {
    if (init?.method === "PATCH") return { ok: true, json: async () => ({}) };
    return { ok: true, json: async () => d };
  });
  render(<LessonEditorPanel lesson={LESSON} courseSlug="c" onLessonPatched={onLessonPatched} onAdvance={() => {}} />);
  return onLessonPatched;
}

describe("LessonEditorPanel", () => {
  it("has no Text/Video/PDF toggle buttons", async () => {
    renderPanel(detail());
    await screen.findByText("Notes for this session");
    for (const name of ["Text", "Video", "PDF"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("shows Add a second video until a second video exists", async () => {
    renderPanel(detail());
    expect(await screen.findByText(/Add a second video/)).toBeTruthy();
    cleanup();
    renderPanel(detail({ videoUrl2: "https://youtu.be/two" }));
    await screen.findByText("Notes for this session");
    expect(screen.queryByText(/Add a second video/)).toBeNull();
  });

  it("reports hasVideo false after the first video is cleared", async () => {
    const onPatched = renderPanel(detail());
    await screen.findByText("Notes for this session");
    const input = screen.getAllByRole("textbox").find(
      (el) => (el as HTMLInputElement).value === "https://youtu.be/abc",
    )!;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    await waitFor(() => expect(onPatched).toHaveBeenCalledWith("l1", { hasVideo: false }));
  });

  it("shows a read-only Lesson PDF row when pdfFileId is set", async () => {
    renderPanel(detail({ pdfFileId: "file1" }));
    expect(await screen.findByText("Lesson PDF")).toBeTruthy();
    const link = screen.getAllByRole("link", { name: "View" })[0] as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/api/lessons/l1/pdf");
  });
});

describe("fix round 1", () => {
  it("paste failure on the second chunk keeps the dialog open with only the unsaved questions", async () => {
    let call = 0;
    fetchMock.mockImplementation(async (_u: string, init: { body: string }) => {
      call += 1;
      if (call === 2) return { ok: false, status: 500, json: async () => ({ error: "Server said no" }) };
      return { ok: true, status: 201, json: async () => ({ created: JSON.parse(init.body).questions.length }) };
    });
    const onAdded = vi.fn();
    const onOpenChange = vi.fn();
    render(<QuizPasteDialog lessonId="l1" open onOpenChange={onOpenChange} onAdded={onAdded} />);
    const area = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(area, { target: { value: Array.from({ length: 250 }, (_, i) => QUESTION(i + 1)).join("\n\n") } });
    fireEvent.click(screen.getByRole("button", { name: "Add 250 questions" }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(200));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add 50 questions" })).toBeTruthy());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(area.value).toContain("Question number 201?");
    expect(area.value).not.toContain("Question number 200?");
    fetchMock.mockClear();
    fetchMock.mockImplementation(async (_u: string, init: { body: string }) => ({
      ok: true, status: 201, json: async () => ({ created: JSON.parse(init.body).questions.length }),
    }));
    fireEvent.click(screen.getByRole("button", { name: "Add 50 questions" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).questions).toHaveLength(50);
  });

  it("switching lessons flushes A's pending text to A and does not send it for B", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async (_u: string, init?: { method?: string }) =>
      init?.method === "PATCH" ? { ok: true, json: async () => ({}) } : { ok: true, json: async () => detail({ textContent: "<p>old</p>" }) });
    const B = { ...LESSON, id: "l2" } as BuilderLesson;
    const { rerender } = render(<LessonEditorPanel lesson={LESSON} courseSlug="c" onLessonPatched={() => {}} onAdvance={() => {}} />);
    await vi.advanceTimersByTimeAsync(0);
    expect(rteChange.current).toBeTruthy();
    rteChange.current!("<p>new</p>");
    rerender(<LessonEditorPanel lesson={B} courseSlug="c" onLessonPatched={() => {}} onAdvance={() => {}} />);
    await vi.advanceTimersByTimeAsync(2000);
    const patches = fetchMock.mock.calls.filter((c) => c[1]?.method === "PATCH");
    expect(patches).toHaveLength(1);
    expect(patches[0][0]).toBe("/api/admin/lessons/l1");
    expect(JSON.parse(patches[0][1].body)).toEqual({ textContent: "<p>new</p>" });
    fireEvent.click(screen.getByRole("button", { name: /Save & Continue/ }));
    await vi.advanceTimersByTimeAsync(10);
    expect(fetchMock.mock.calls.filter((c) => c[1]?.method === "PATCH")).toHaveLength(1);
    vi.useRealTimers();
  });

  it("an upload finishing after a lesson switch does not touch the new lesson", async () => {
    let resolveUpload: (v: unknown) => void = () => {};
    fetchMock.mockImplementation(async (url: string, init?: { method?: string }) => {
      if (url === "/api/admin/uploads/document") return new Promise((r) => { resolveUpload = r; });
      if (init?.method === "PATCH") return { ok: true, json: async () => ({}) };
      return { ok: true, json: async () => detail() };
    });
    const B = { ...LESSON, id: "l2" } as BuilderLesson;
    const { rerender, container } = render(<LessonEditorPanel lesson={LESSON} courseSlug="c" onLessonPatched={() => {}} onAdvance={() => {}} />);
    await screen.findByText("Notes for this session");
    const file = new File(["x"], "a.pdf", { type: "application/pdf" });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === "/api/admin/uploads/document")).toBe(true));
    rerender(<LessonEditorPanel lesson={B} courseSlug="c" onLessonPatched={() => {}} onAdvance={() => {}} />);
    await screen.findByText("Notes for this session");
    resolveUpload({ ok: true, json: async () => ({ fileId: "f9", name: "late.pdf" }) });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("late.pdf")).toBeNull();
    const patches = fetchMock.mock.calls.filter((c) => c[1]?.method === "PATCH");
    expect(patches.every((c) => c[0] === "/api/admin/lessons/l1")).toBe(true);
  });

  it("a failed video save reverts the field", async () => {
    fetchMock.mockImplementation(async (_u: string, init?: { method?: string }) =>
      init?.method === "PATCH" ? { ok: false, json: async () => ({}) } : { ok: true, json: async () => detail() });
    render(<LessonEditorPanel lesson={LESSON} courseSlug="c" onLessonPatched={() => {}} onAdvance={() => {}} />);
    await screen.findByText("Notes for this session");
    const input = screen.getAllByRole("textbox").find((el) => (el as HTMLInputElement).value === "https://youtu.be/abc")!;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    await waitFor(() => expect((input as HTMLInputElement).value).toBe("https://youtu.be/abc"));
  });
});
