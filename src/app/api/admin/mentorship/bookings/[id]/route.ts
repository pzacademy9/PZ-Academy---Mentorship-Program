import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { applyBookingStatus, deleteBooking } from "@/lib/data/mentorship-bookings";

const bodySchema = z.object({
  status: z.enum(["confirmed", "cancelled"]),
  reason: z.string().trim().max(500).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await applyBookingStatus({
    bookingId: id,
    targetStatus: parsed.data.status,
    cancellationReason: parsed.data.reason ?? null,
    emailKind: parsed.data.status === "confirmed" ? "bookingConfirmed" : "bookingCancelled",
  });

  if (!result.ok) {
    if (result.reason === "not-found") return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    if (result.reason === "already-in-status") {
      return NextResponse.json({ error: `Booking is already ${parsed.data.status}.` }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not update booking" }, { status: 500 });
  }

  return NextResponse.json({ id: result.id, status: result.status });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const result = await deleteBooking(id);

  if (!result.ok) {
    if (result.reason === "not-found") return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    return NextResponse.json({ error: "Could not delete booking" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, warnings: result.warnings });
}
