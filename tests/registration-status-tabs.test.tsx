// tests/registration-status-tabs.test.tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StatusTabs } from "@/components/admin/registrations/StatusTabs";

const counts = { all: 9, pending: 2, reserved: 1, underpaid: 1, paid: 4, free: 1 };
const BASE = "/dashboard/admin/enrollments/registrations";

afterEach(cleanup);

describe("StatusTabs", () => {
  it("renders six tabs with their counts", () => {
    render(<StatusTabs basePath={BASE} filters={{}} counts={counts} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(6);
    expect(links[0].textContent).toContain("All");
    expect(links[0].textContent).toContain("9");
    expect(links[4].textContent).toContain("4");
  });

  it("marks only the active tab with aria-current", () => {
    render(<StatusTabs basePath={BASE} filters={{ status: "paid" }} counts={counts} />);
    const current = screen.getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain("Paid");
  });

  it("marks All active when there is no status", () => {
    render(<StatusTabs basePath={BASE} filters={{}} counts={counts} />);
    expect(screen.getAllByRole("link")[0].getAttribute("aria-current")).toBe("page");
  });

  it("keeps q and region and resets the page on a tab link", () => {
    render(<StatusTabs basePath={BASE} filters={{ q: "zainab", region: "PK", p: 3 }} counts={counts} />);
    const paid = screen.getAllByRole("link").find((l) => l.textContent?.includes("Paid"))!;
    const href = paid.getAttribute("href")!;
    expect(href).toContain("status=paid");
    expect(href).toContain("q=zainab");
    expect(href).toContain("region=PK");
    expect(href).not.toContain("p=");
  });

  it("wraps by default and slides sideways with scroll", () => {
    const { container, rerender } = render(<StatusTabs basePath={BASE} filters={{}} counts={counts} />);
    expect((container.firstElementChild as HTMLElement).className).toContain("flex-wrap");
    expect((container.firstElementChild as HTMLElement).className).not.toContain("overflow-x-auto");
    rerender(<StatusTabs basePath={BASE} filters={{}} counts={counts} scroll />);
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(cls).toContain("overflow-x-auto");
    expect(cls).toContain("flex-nowrap");
    expect(cls).not.toContain("flex-wrap");
  });
});
