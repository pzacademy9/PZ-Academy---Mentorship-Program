"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

// Dark mode is supported on app screens only. Public marketing pages have no
// toggle and no dark styling, so a saved "dark" preference must not leak there.
const THEMED_PREFIXES = ["/dashboard", "/portal"];

export function isThemedPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return THEMED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  const pathname = usePathname();
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      forcedTheme={isThemedPath(pathname) ? undefined : "light"}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
export default ThemeProvider;
