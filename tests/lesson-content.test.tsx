import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { LessonView } from "@/lib/data/lms";

vi.mock("@/app/portal/actions", () => ({ saveNote: vi.fn() }));
vi.mock("@/components/lms/NoteEditorToolbar", () => ({ NoteEditorToolbar: () => null }));
vi.mock("@tiptap/react", () => ({ useEditor: () => null, EditorContent: () => null }));
vi.mock("@tiptap/starter-kit", () => ({ default: {} }));
vi.mock("@/lib/notes-export", () => ({ exportNotePdf: vi.fn(), exportNoteDoc: vi.fn() }));

import { LessonContent } from "@/components/lms/LessonContent";
import { LessonSidePanel } from "@/components/lms/LessonSidePanel";

function lesson(over: Partial<LessonView> = {}): LessonView {
  return {
    id: "l-1", title: "Lesson", contentType: "text", videoUrl: null, videoUrl2: null,
    textContent: null, pdfUrl: null, pdfFileId: null, resources: [], documents: [],
    moduleNotes: { moduleId: "m-1", resources: [], documents: [] },
    hasQuiz: false, status: "unlocked", courseId: "c", courseSlug: "c", courseTitle: "C",
    prevLessonId: null, nextLessonId: null, ...over,
  };
}

describe("LessonContent", () => {
  it("shows a single video without a part label", () => {
    const { container } = render(<LessonContent lesson={lesson({ contentType: "video", videoUrl: "https://youtu.be/abc" })} />);
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
    expect(screen.queryByText("Part 1")).toBeNull();
  });

  it("shows two videos labelled Part 1 and Part 2", () => {
    const { container } = render(
      <LessonContent lesson={lesson({ videoUrl: "https://youtu.be/abc", videoUrl2: "https://youtu.be/def" })} />,
    );
    expect(container.querySelectorAll("iframe")).toHaveLength(2);
    expect(screen.getByText("Part 1")).toBeTruthy();
    expect(screen.getByText("Part 2")).toBeTruthy();
  });

  it("a text lesson with a video shows the video and the text", () => {
    const { container } = render(
      <LessonContent lesson={lesson({ contentType: "text", videoUrl: "https://youtu.be/abc", textContent: "<p>Hello notes</p>" })} />,
    );
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
    expect(screen.getByText("Hello notes")).toBeTruthy();
  });

  it("shows text only", () => {
    const { container } = render(<LessonContent lesson={lesson({ textContent: "<p>Only text</p>" })} />);
    expect(container.querySelectorAll("iframe")).toHaveLength(0);
    expect(screen.getByText("Only text")).toBeTruthy();
  });

  it("shows No content when nothing exists", () => {
    render(<LessonContent lesson={lesson({ textContent: "   " })} />);
    expect(screen.getByText("No content.")).toBeTruthy();
  });

  it("shows the private pdf iframe when pdfFileId is set", () => {
    const { container } = render(<LessonContent lesson={lesson({ contentType: "pdf", pdfFileId: "f-1" })} />);
    const frame = container.querySelector("iframe");
    expect(frame?.getAttribute("src")).toContain("/api/lessons/l-1/pdf");
    expect(screen.queryByText("No content.")).toBeNull();
  });
});

describe("LessonSidePanel module notes", () => {
  const base = { lessonId: "l-1", courseId: "c", lessonTitle: "L", resources: [], documents: [], initialNoteHtml: "" };

  it("shows Module notes with links and documents when present", () => {
    render(
      <LessonSidePanel
        {...base}
        moduleNotes={{
          moduleId: "m-1",
          resources: [{ label: "Slides", url: "https://x.test/s" }],
          documents: [{ fileId: "d-1", name: "Handout.pdf" }] as never,
        }}
      />,
    );
    expect(screen.getByText("Module notes")).toBeTruthy();
    expect(screen.getByText("Slides")).toBeTruthy();
    const doc = screen.getByText("Handout.pdf").closest("a");
    expect(doc?.getAttribute("href")).toBe("/api/modules/m-1/documents/d-1");
  });

  it("hides Module notes when empty or absent", () => {
    const { rerender } = render(
      <LessonSidePanel {...base} moduleNotes={{ moduleId: "m-1", resources: [], documents: [] }} />,
    );
    expect(screen.queryByText("Module notes")).toBeNull();
    rerender(<LessonSidePanel {...base} />);
    expect(screen.queryByText("Module notes")).toBeNull();
  });
});
