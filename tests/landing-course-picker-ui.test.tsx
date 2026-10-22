// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const { refresh, toastError, toastSuccess } = vi.hoisted(() => ({ refresh: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));

import { CourseMainPicker } from "@/components/admin/landing/CourseMainPicker";

const courses = [
  { id: "c1", title: "Course One" },
  { id: "c2", title: "Course Two" },
];
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

const lastBody = () => JSON.parse(fetchMock.mock.calls.at(-1)![1].body);

describe("CourseMainPicker", () => {
  it("disables the checkbox while no course is chosen", () => {
    render(<CourseMainPicker pageId="p1" courses={courses} courseId={null} isMainPage={false} />);
    expect(screen.getByRole("option", { name: "No course" })).toBeTruthy();
    expect((screen.getByLabelText(/Main page for this course/) as HTMLInputElement).disabled).toBe(true);
  });

  it("posts the chosen course with isMain false", async () => {
    render(<CourseMainPicker pageId="p1" courses={courses} courseId={null} isMainPage={false} />);
    fireEvent.change(screen.getByLabelText("Course"), { target: { value: "c2" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/landing-pages/p1/course");
    expect(lastBody()).toEqual({ courseId: "c2", isMain: false });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("posts isMain true when the box is ticked", async () => {
    render(<CourseMainPicker pageId="p1" courses={courses} courseId="c1" isMainPage={false} />);
    fireEvent.click(screen.getByLabelText(/Main page for this course/));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastBody()).toEqual({ courseId: "c1", isMain: true });
  });

  it("clearing the course posts null and isMain false", async () => {
    render(<CourseMainPicker pageId="p1" courses={courses} courseId="c1" isMainPage={true} />);
    fireEvent.change(screen.getByLabelText("Course"), { target: { value: "" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastBody()).toEqual({ courseId: null, isMain: false });
  });

  it("shows the API message and leaves the checkbox unchanged on error", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "This page has no live option, so it cannot be the main page" }) });
    render(<CourseMainPicker pageId="p1" courses={courses} courseId="c1" isMainPage={false} />);
    const box = screen.getByLabelText(/Main page for this course/) as HTMLInputElement;
    fireEvent.click(box);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("This page has no live option, so it cannot be the main page"));
    expect(box.checked).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });
});
