import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { roleHome, type Role } from "@/lib/roles";

/**
 * Pre-launch gate: students (the only role with no other reason to be in the
 * app yet) are held on /coming-soon until STUDENT_ACCESS_LOCKED is flipped
 * off. Admin/mentor are never affected, so testing continues normally.
 *
 * STUDENT_ACCESS_ALLOWLIST carves out specific student emails (comma-
 * separated) who can pass the gate anyway — for testing the real student
 * view while the lock is still on for everyone else.
 */
const STUDENT_ACCESS_LOCKED = process.env.STUDENT_ACCESS_LOCKED !== "false";
const STUDENT_ACCESS_ALLOWLIST = (process.env.STUDENT_ACCESS_ALLOWLIST ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export async function middleware(request: NextRequest) {
  const { user, supabase, response } = await updateSession(request);
  const path = request.nextUrl.pathname;

  if (path.startsWith("/dashboard") || path.startsWith("/enroll")) {
    if (!user) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("returnUrl", path);
      return NextResponse.redirect(loginUrl);
    }
  }

  if (path.startsWith("/dashboard") || path.startsWith("/enroll")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user!.id)
      .single();

    const role = (profile?.role ?? "student") as Role;
    const isAllowlistedStudent = Boolean(
      user!.email && STUDENT_ACCESS_ALLOWLIST.includes(user!.email.toLowerCase()),
    );

    if (STUDENT_ACCESS_LOCKED && role === "student" && !isAllowlistedStudent && path !== "/coming-soon") {
      return NextResponse.redirect(new URL("/coming-soon", request.url));
    }

    if (path.startsWith("/dashboard/admin") && role !== "admin" && role !== "super_admin") {
      return NextResponse.redirect(new URL(roleHome(role), request.url));
    }

    if ((path === "/dashboard/mentor" || path.startsWith("/dashboard/mentor/")) && role !== "mentor" && role !== "admin" && role !== "super_admin") {
      return NextResponse.redirect(new URL(roleHome(role), request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
