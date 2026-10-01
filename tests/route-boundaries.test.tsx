import { render, screen, fireEvent } from "@testing-library/react";
import DashboardError from "@/app/dashboard/error";
import RootError from "@/app/error";
import NotFound from "@/app/not-found";
import { vi } from "vitest";

it("dashboard error shows the alert card and Try again calls reset", () => {
  const reset = vi.fn();
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  render(<DashboardError error={Object.assign(new Error("x"), { digest: "d1" })} reset={reset} />);
  expect(screen.getByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /try again/i }));
  expect(reset).toHaveBeenCalledTimes(1);
  expect(spy).toHaveBeenCalled();
  spy.mockRestore();
});

it("root error links home, not to the dashboard", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(<RootError error={new Error("x")} reset={() => {}} />);
  expect(screen.getByRole("link", { name: /go home/i }).getAttribute("href")).toBe("/");
});

it("404 offers dashboard and courses", () => {
  render(<NotFound />);
  expect(screen.getByRole("heading", { name: /page not found/i })).toBeTruthy();
  expect(screen.getByRole("link", { name: /go to dashboard/i }).getAttribute("href")).toBe("/dashboard");
  expect(screen.getByRole("link", { name: /browse courses/i }).getAttribute("href")).toBe("/courses");
});
