import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FoldCard } from "@/components/admin/classes/FoldCard";

afterEach(cleanup);
const base = { id: "fold-x", icon: null, title: "Attendance", status: { line: "42 of 60 present", badge: "70% present", tone: "ok" as const } };

describe("FoldCard", () => {
  it("closed: header says so, shows the status line, and the content is hidden on phones", () => {
    render(<FoldCard {...base} open={false} onToggle={() => {}}><p>Inside</p></FoldCard>);
    const btn = screen.getByRole("button", { name: /Attendance/ });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(btn.textContent).toContain("42 of 60 present");
    expect(btn.textContent).toContain("70% present");
    expect(document.getElementById("fold-x")!.className).toContain("max-lg:hidden");
  });
  it("open: content is shown", () => {
    render(<FoldCard {...base} open onToggle={() => {}}><p>Inside</p></FoldCard>);
    expect(screen.getByRole("button", { name: /Attendance/ }).getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById("fold-x")!.className).not.toContain("max-lg:hidden");
  });
  it("tapping the header asks the parent to toggle", () => {
    const onToggle = vi.fn();
    render(<FoldCard {...base} open={false} onToggle={onToggle}><p>Inside</p></FoldCard>);
    fireEvent.click(screen.getByRole("button", { name: /Attendance/ }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
  it("the badge sits inside the text column so it cannot squeeze the title", () => {
    render(<FoldCard {...base} open={false} onToggle={() => {}}><p>Inside</p></FoldCard>);
    const badge = screen.getByText("70% present");
    expect(badge.closest("span.min-w-0")).not.toBeNull();
    expect(badge.className).not.toContain("shrink-0");
  });
  it("has a scroll target above the content and a focusable header, both reachable by id", () => {
    render(<FoldCard {...base} open={false} onToggle={() => {}}><p>Inside</p></FoldCard>);
    expect(document.getElementById("fold-x-fold")!.className).toContain("scroll-mt-20");
    expect(document.getElementById("fold-x-header")!.tagName).toBe("BUTTON");
  });
  it("content stays in the page even when closed", () => {
    render(<FoldCard {...base} open={false} onToggle={() => {}}><p>Inside</p></FoldCard>);
    expect(screen.getByText("Inside")).toBeTruthy();
  });
});
