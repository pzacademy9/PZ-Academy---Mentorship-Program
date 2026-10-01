import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import { describe, it, expect } from "vitest";

describe("Button", () => {
  it("loading disables, sets aria-busy and shows a spinner, keeping the label", () => {
    render(<Button loading>Save</Button>);
    const btn = screen.getByRole("button", { name: /save/i });
    expect(btn).toHaveProperty("disabled", true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.querySelector("[data-spinner]")).not.toBeNull();
  });

  it("without loading renders unchanged: enabled, no aria-busy, no spinner", () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole("button", { name: /save/i });
    expect(btn).toHaveProperty("disabled", false);
    expect(btn.getAttribute("aria-busy")).toBeNull();
    expect(btn.querySelector("[data-spinner]")).toBeNull();
  });

  it("respects an explicit disabled even when not loading", () => {
    render(<Button disabled>Save</Button>);
    expect(screen.getByRole("button")).toHaveProperty("disabled", true);
  });

  it("bare variant and size add no visual classes beyond the base", () => {
    render(<Button variant="bare" size="bare" className="px-1 text-xs">x</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).not.toContain("bg-primary");
    expect(cls).not.toContain("h-9");
    expect(cls).toContain("px-1");
  });

  it("default size gets the mobile 44px minimum", () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole("button").className).toContain("max-md:min-h-11");
  });
});
