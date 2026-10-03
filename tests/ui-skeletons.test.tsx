import { render, screen } from "@testing-library/react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TableSkeleton, DetailSkeleton, CardGridSkeleton, FormSkeleton, ChatSkeleton, LessonSkeleton,
} from "@/components/ui/skeletons";

describe("Skeleton", () => {
  it("is hidden from assistive tech and uses the muted token", () => {
    const { container } = render(<Skeleton className="h-4 w-10" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.className).toContain("bg-muted");
    expect(el.className).toContain("h-4");
  });
});

describe.each([
  ["TableSkeleton", <TableSkeleton key="t" />],
  ["DetailSkeleton", <DetailSkeleton key="d" />],
  ["CardGridSkeleton", <CardGridSkeleton key="c" />],
  ["FormSkeleton", <FormSkeleton key="f" />],
  ["ChatSkeleton", <ChatSkeleton key="ch" />],
  ["LessonSkeleton", <LessonSkeleton key="l" />],
])("%s", (_name, el) => {
  it("announces loading once via role=status", () => {
    render(el);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("Loading…")).toBeTruthy();
  });
});

it("TableSkeleton renders the requested number of mobile cards and desktop rows", () => {
  const { container } = render(<TableSkeleton rows={3} />);
  expect(container.querySelectorAll("[data-skel=card]").length).toBe(3);
  expect(container.querySelectorAll("[data-skel=row]").length).toBe(3);
});
