import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { VideoField } from "@/components/admin/program/VideoField";
import { QuizPasteDialog } from "@/components/admin/program/QuizPasteDialog";
import { LessonEditorPanel } from "@/components/admin/program/LessonEditorPanel";
import type { BuilderLesson } from "@/lib/data/admin-lms";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/admin/program/RichTextEditor", () => ({
  RichTextEditor: () => <div data-testid="rte" />,
}));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
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
