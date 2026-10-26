import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StudentsList, type StudentsListProps } from "@/components/admin/students/StudentsList";
import type { StudentListRow } from "@/lib/data/admin-students";

const row = (over: Partial<StudentListRow> = {}): StudentListRow => ({
  id: "11111111-1111-4111-8111-111111111111",
  fullName: "Ayesha Khan",
  email: "ayesha@x.com",
  phone: null,
  joinedAt: "2026-09-01T10:00:00Z",
  courses: [{ title: "Clinical Research", status: "active" }],
  progress: 40,
  attended: "3 of 5",
  certificate: "issued",
  ...over,
});

const base = (over: Partial<StudentsListProps> = {}): StudentsListProps => ({
  rows: [row()],
  total: 126,
  page: 1,
  pageCount: 6,
  pageSize: 25,
  q: "aye",
  filter: "active",
  ...over,
});

const params = (href: string) => new URL(href, "http://x").searchParams;
const hrefOf = (name: RegExp | string) => screen.getByRole("link", { name }).getAttribute("href")!;

describe("StudentsList", () => {
  it("rows link to the student record", () => {
    render(<StudentsList {...base()} />);
    const links = screen.getAllByRole("link", { name: /Ayesha Khan/ });
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) {
      expect(l.getAttribute("href")).toBe("/dashboard/admin/students/11111111-1111-4111-8111-111111111111");
    }
  });

  it("shows two course chips then +N for three courses", () => {
    const courses = ["A", "B", "C"].map((t) => ({ title: `Course ${t}`, status: "active" }));
    render(<StudentsList {...base({ rows: [row({ courses })] })} />);
    expect(screen.getAllByText("Course A").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Course B").length).toBeGreaterThan(0);
    expect(screen.queryByText("Course C")).toBeNull();
    expect(screen.getAllByText("+1").length).toBeGreaterThan(0);
  });

  it("shows no +N for two courses", () => {
    const courses = ["A", "B"].map((t) => ({ title: `Course ${t}`, status: "active" }));
    render(<StudentsList {...base({ rows: [row({ courses })] })} />);
    expect(screen.queryByText(/^\+\d/)).toBeNull();
  });

  it("certificate chip texts", () => {
    render(
      <StudentsList
        {...base({
          rows: [
            row({ id: "a", fullName: "One", certificate: "issued" }),
            row({ id: "b", fullName: "Two", certificate: "pending" }),
            row({ id: "c", fullName: "Three", certificate: "none" }),
          ],
        })}
      />,
    );
    expect(screen.getAllByText("Issued").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
    expect(screen.getAllByText("None").length).toBeGreaterThan(0);
  });

  it("unknown certificate shows a dash and no chip", () => {
    render(<StudentsList {...base({ rows: [row({ certificate: "unknown" })] })} />);
    expect(screen.queryByText("Issued")).toBeNull();
    expect(screen.queryByText("Pending")).toBeNull();
    expect(screen.queryByText("None")).toBeNull();
    expect(screen.getAllByLabelText("Certificate status unavailable").length).toBeGreaterThan(0);
  });

  it("count line singular and plural", () => {
    const { unmount } = render(<StudentsList {...base({ total: 126 })} />);
    expect(screen.getByText("126 students")).toBeTruthy();
    unmount();
    render(<StudentsList {...base({ total: 1, pageCount: 1 })} />);
    expect(screen.getByText("1 student")).toBeTruthy();
  });

  it("empty state", () => {
    render(<StudentsList {...base({ rows: [], total: 0, pageCount: 1 })} />);
    expect(screen.getByText("No students match your search.")).toBeTruthy();
    expect(screen.getByText("0 students")).toBeTruthy();
    expect(screen.queryByText(/^Showing/)).toBeNull();
  });

  it("filter chips preserve q and reset page", () => {
    render(<StudentsList {...base({ page: 3 })} />);
    const p = params(hrefOf(/^Payment pending/));
    expect(p.get("filter")).toBe("payment-pending");
    expect(p.get("q")).toBe("aye");
    expect(p.get("page")).toBeNull();
    expect(params(hrefOf(/^Finished course/)).get("filter")).toBe("finished");
    const all = params(hrefOf(/^All/));
    expect(all.get("filter")).toBeNull();
    expect(all.get("q")).toBe("aye");
  });

  it("marks the active chip", () => {
    render(<StudentsList {...base()} />);
    expect(screen.getByRole("link", { name: /^Active/ }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("link", { name: /^All/ }).getAttribute("aria-current")).toBeNull();
  });

  it("search form is GET with hidden filter and the right placeholder", () => {
    const { container } = render(<StudentsList {...base()} />);
    const form = container.querySelector("form")!;
    expect(form.getAttribute("method")).toBe("get");
    expect(screen.getByPlaceholderText("Search by name, email or phone")).toBeTruthy();
    const hidden = form.querySelector('input[type="hidden"][name="filter"]') as HTMLInputElement;
    expect(hidden.value).toBe("active");
  });

  it("hostile q is encoded in links", () => {
    const q = `a&b#c"d'e=f`;
    render(<StudentsList {...base({ q })} />);
    const href = hrefOf(/^Finished course/);
    expect(href).not.toContain("#");
    expect(href).not.toContain('"');
    const p = params(href);
    expect(p.get("q")).toBe(q);
    expect(p.get("filter")).toBe("finished");
    expect(Array.from(p.keys()).sort()).toEqual(["filter", "q"]);
  });

  it("paging text and links at boundaries", () => {
    const { unmount } = render(<StudentsList {...base({ page: 1 })} />);
    expect(screen.getByText("Showing 1 to 25 of 126")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Previous" })).toBeNull();
    const next = params(hrefOf("Next"));
    expect(next.get("page")).toBe("2");
    expect(next.get("q")).toBe("aye");
    expect(next.get("filter")).toBe("active");
    unmount();

    render(<StudentsList {...base({ page: 6 })} />);
    expect(screen.getByText("Showing 126 to 126 of 126")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Next" })).toBeNull();
    expect(params(hrefOf("Previous")).get("page")).toBe("5");
  });

  it("previous to page 1 omits the page param", () => {
    render(<StudentsList {...base({ page: 2 })} />);
    expect(params(hrefOf("Previous")).get("page")).toBeNull();
  });

  it("shows progress percent and sessions attended", () => {
    render(<StudentsList {...base()} />);
    expect(screen.getAllByText("40%").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/3 of 5/).length).toBeGreaterThan(0);
  });
});
