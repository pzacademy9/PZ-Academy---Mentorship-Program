import { NextResponse } from "next/server";

/** A known, calm failure the admin can read. Anything else stays a plain 500. */
export class PortalError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "PortalError";
  }
}

/** Maps a thrown error to a response. Database text is never echoed. */
export function portalErrorResponse(e: unknown, tag: string): NextResponse {
  if (e instanceof PortalError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(`[portal] ${tag} failed`);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
