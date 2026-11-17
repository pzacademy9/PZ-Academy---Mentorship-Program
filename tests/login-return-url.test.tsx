import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
let returnUrl: string | null = null;
let role: string | null = "student";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => ({ get: (k: string) => (k === "returnUrl" ? returnUrl : null) }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({
    auth: { signInWithPassword: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: role ? { role } : null }) }) }) }),
  }),
}));

import { LoginForm } from "@/components/auth/LoginForm";

async function signIn() {
  const { container } = render(<LoginForm />);
  fireEvent.change(container.querySelector('input[name="email"]')!, { target: { value: "a@b.com" } });
  fireEvent.change(container.querySelector('input[name="password"]')!, { target: { value: "secret123" } });
  fireEvent.submit(container.querySelector("form")!);
  await waitFor(() => expect(push).toHaveBeenCalled());
  return push.mock.calls[0][0];
}

beforeEach(() => {
  push.mockClear();
  returnUrl = null;
  role = "admin";
});

describe("LoginForm returnUrl", () => {
  it("follows a safe portal returnUrl", async () => {
    returnUrl = "/dashboard/admin/landing-promo-codes";
    expect(await signIn()).toBe("/dashboard/admin/landing-promo-codes");
  });
  it.each(["//evil.com", "https://x", "/login"])("ignores hostile returnUrl %s", async (u) => {
    returnUrl = u;
    expect(await signIn()).toBe("/dashboard/admin");
  });
  it("uses the role home with no returnUrl, /dashboard with no role", async () => {
    expect(await signIn()).toBe("/dashboard/admin");
  });
  it("goes to /dashboard when there is no role and the returnUrl is hostile", async () => {
    role = null;
    returnUrl = "//evil.com";
    expect(await signIn()).toBe("/dashboard");
  });
});
