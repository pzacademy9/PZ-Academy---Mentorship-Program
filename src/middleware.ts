import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { roleHome, type Role } from "@/lib/roles";

export async function middleware(request: NextRequest) {
  const { user, supabase, response } = await updateSession(request);
  const path = request.nextUrl.pathname;

  if (path.startsWith("/dashboard")) {
    if (!user) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("returnUrl", path);
      return NextResponse.redirect(loginUrl);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = (profile?.role ?? "student") as Role;
    const home = roleHome(role);

    if (path.startsWith("/dashboard/admin") && role !== "admin" && role !== "super_admin") {
      return NextResponse.redirect(new URL(home, request.url));
    }

    if (path.startsWith("/dashboard/mentor") && role !== "mentor" && role !== "admin" && role !== "super_admin") {
      return NextResponse.redirect(new URL(home, request.url));
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
