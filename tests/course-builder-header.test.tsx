import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CourseBuilder } from "@/components/admin/program/CourseBuilder";
import type { BuilderState } from "@/lib/data/admin-lms";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/components/admin/program/LessonEditorPanel", () => ({ LessonEditorPanel: () => <div /> }));
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
});
