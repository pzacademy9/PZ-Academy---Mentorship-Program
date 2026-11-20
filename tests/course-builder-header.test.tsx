import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import type { FlushResult } from "@/components/admin/program/LessonEditorPanel";
import { CourseBuilder } from "@/components/admin/program/CourseBuilder";
import type { BuilderState } from "@/lib/data/admin-lms";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));
const h = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  flush: null as (() => Promise<{ ok: boolean; alreadyToasted: boolean }>) | null,
  panelDirty: false,
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/components/admin/program/LessonEditorPanel", () => ({
  LessonEditorPanel: ({ flushRef, onDirtyChange }: {
    flushRef?: { current: (() => Promise<FlushResult>) | null }; onDirtyChange?: (d: boolean) => void;
  }) => {
    if (flushRef) flushRef.current = h.flush;
    useEffect(() => { onDirtyChange?.(h.panelDirty); }, [onDirtyChange]);
    return <div />;
  },
}));
vi.mock("@/components/admin/program/ModuleNotesPanel", () => ({ ModuleNotesPanel: () => <div /> }));
vi.mock("@/components/admin/program/ImportCurriculumDialog", () => ({ ImportCurriculumDialog: () => null }));
vi.mock("@/components/admin/program/PublishConfirmDialog", () => ({ PublishConfirmDialog: () => null }));

const state: BuilderState = {
  course: { id: "c1", slug: "c-one", title: "Course One", type: "course", isPublished: false },
  flat: false,
  modules: [],
};

describe("course builder header", () => {
  it("has a Back to program link before the title and no Basics link", () => {
    render(<CourseBuilder initialState={state} />);
    const back = screen.getByRole("link", { name: "Back to program" });
    expect(back.getAttribute("href")).toBe("/dashboard/admin/courses/c1");
    const title = screen.getByText("Course Builder");
    expect(back.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Basics" })).toBeNull();
  });

  describe("Save Draft", () => {
    beforeEach(() => {
      Object.values(h.toast).forEach((f) => f.mockClear());
      h.flush = null;
      h.panelDirty = false;
    });
    const withLesson = {
      ...state,
      modules: [{ id: "m1", title: "M", lessons: [{ id: "l1", title: "L" }] }],
    } as unknown as BuilderState;

    it("says Saved. when the flush succeeds", async () => {
      h.flush = async () => ({ ok: true, alreadyToasted: false });
      render(<CourseBuilder initialState={withLesson} />);
      fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
      await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith("Saved."));
      expect(h.toast.error).not.toHaveBeenCalled();
    });

    it("says some changes could not be saved when the flush fails", async () => {
      h.flush = async () => ({ ok: false, alreadyToasted: false });
      render(<CourseBuilder initialState={withLesson} />);
      fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
      await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith("Some changes could not be saved."));
      expect(h.toast.success).not.toHaveBeenCalled();
    });

    it("adds no second toast when the failed save already showed one", async () => {
      h.flush = async () => ({ ok: false, alreadyToasted: true });
      render(<CourseBuilder initialState={withLesson} />);
      fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
      await new Promise((r) => setTimeout(r, 20));
      expect(h.toast.error).not.toHaveBeenCalled();
      expect(h.toast.success).not.toHaveBeenCalled();
    });

    it("does not say Saved. when no panel can flush but work is still unsaved", async () => {
      h.panelDirty = true;
      render(<CourseBuilder initialState={withLesson} />);
      fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
      await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith("Some changes could not be saved."));
      expect(h.toast.success).not.toHaveBeenCalled();
    });
  });
});
