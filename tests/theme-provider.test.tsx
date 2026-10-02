import { render } from "@testing-library/react";
import { isThemedPath, ThemeProvider } from "@/components/theme-provider";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
const seen: Record<string, unknown>[] = [];
vi.mock("next-themes", () => ({
  ThemeProvider: (props: Record<string, unknown> & { children?: React.ReactNode }) => {
    seen.push(props);
    return <>{props.children}</>;
  },
}));

it("isThemedPath is true only for /dashboard and /portal trees", () => {
  expect(isThemedPath("/dashboard")).toBe(true);
  expect(isThemedPath("/dashboard/admin/crm")).toBe(true);
  expect(isThemedPath("/portal/pmh/lessons/x")).toBe(true);
  expect(isThemedPath("/")).toBe(false);
  expect(isThemedPath("/courses")).toBe(false);
  expect(isThemedPath("/dashboardx")).toBe(false);
  expect(isThemedPath(null)).toBe(false);
});

it("forces light outside app routes and leaves theme free inside", () => {
  pathname = "/courses";
  render(<ThemeProvider><div /></ThemeProvider>);
  expect(seen.at(-1)?.forcedTheme).toBe("light");
  pathname = "/dashboard/settings";
  render(<ThemeProvider><div /></ThemeProvider>);
  expect(seen.at(-1)?.forcedTheme).toBeUndefined();
});
