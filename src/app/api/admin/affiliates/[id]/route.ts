import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { acceptApplication, dropAffiliate, getAffiliateDetail, markAffiliateLeft, updateAffiliate } from "@/lib/data/affiliates";
import { TEAMS } from "@/lib/affiliates/service";
import { affiliateLink } from "@/lib/affiliates/contact";
import { sendAccepted, sendDropped, sendLeft } from "@/lib/affiliates/send";

type Ctx = { params: Promise<{ id: string }> };

const team = z.enum(TEAMS).nullable();
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept"), code: z.string().max(10).optional(), team: team.optional() }),
  z.object({ action: z.literal("drop") }),
  z.object({ action: z.literal("leave") }),
  z.object({ action: z.literal("resend") }),
  z.object({
    action: z.literal("update"),
    team: team.optional(),
    commissionMode: z.enum(["manual", "automatic"]).optional(),
    manualPercent: z.number().nullable().optional(),
  }),
]);

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** One affiliate, plus the private link for an accepted one. The token itself is not in the body. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin("sales_hub");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  try {
    const detail = await getAffiliateDetail(id);
    if (!detail) return fail("Not found.", 404);
    const { token, ...affiliate } = detail;
    return NextResponse.json({ affiliate, link: detail.status === "accepted" && token ? affiliateLink(token) : null });
  } catch {
    return fail("Could not load this affiliate. Please try again.", 500);
  }
}

/** Accept, drop, mark as left, edit, or resend the welcome email. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin("sales_hub");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("That request was not understood.", 400);
  const input = parsed.data;

  try {
    if (input.action === "accept") {
      const r = await acceptApplication(id, { code: input.code, team: input.team ?? null });
      if (!r.ok) {
        switch (r.reason) {
          case "not-found": return fail("Not found.", 404);
          case "not-applied": return fail("This application was already handled.", 409);
          case "code-taken": return fail("That code is already taken. Try another.", 409);
          case "invalid-code": return fail("Codes are 1 to 3 letters then 1 to 4 numbers, like AK321.", 400);
          case "invalid-team": return fail("Pick one of the five teams.", 400);
          default: return fail("Could not accept. Please try again.", 500);
        }
      }
      const emailSent = await sendAccepted({ name: r.name, email: r.email, code: r.code, team: input.team ?? null, token: r.token });
      return NextResponse.json({ ok: true, code: r.code, emailSent });
    }

    if (input.action === "update") {
      const patch = { team: input.team, commissionMode: input.commissionMode, manualPercent: input.manualPercent };
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      const r = await updateAffiliate(id, clean);
      if (r.ok) return NextResponse.json({ ok: true });
      if (r.reason === "not-found") return fail("Not found.", 404);
      if (r.reason === "invalid-percent") return fail("The percent must be between 8 and 10.", 400);
      if (r.reason === "invalid-team") return fail("Pick one of the five teams.", 400);
      return fail("Could not save. Please try again.", 500);
    }

    const detail = await getAffiliateDetail(id);
    if (!detail) return fail("Not found.", 404);

    if (input.action === "resend") {
      if (detail.status === "dropped" || detail.status === "left") {
        const sent = detail.status === "dropped" ? await sendDropped(detail) : await sendLeft(detail);
        return NextResponse.json({ ok: true, emailSent: sent });
      }
      if (detail.status !== "accepted" || !detail.code || !detail.token) return fail("Only an accepted, dropped or left affiliate can be sent this email.", 409);
      const emailSent = await sendAccepted({ name: detail.name, email: detail.email, code: detail.code, team: detail.team, token: detail.token });
      return NextResponse.json({ ok: true, emailSent });
    }

    const r = input.action === "drop" ? await dropAffiliate(id) : await markAffiliateLeft(id);
    if (!r.ok) {
      if (r.reason === "not-found") return fail("Not found.", 404);
      if (r.reason === "wrong-status") return fail("This affiliate cannot be changed this way any more.", 409);
      return fail("Could not save. Please try again.", 500);
    }
    const emailSent = input.action === "drop" ? await sendDropped(detail) : await sendLeft(detail);
    return NextResponse.json({ ok: true, emailSent });
  } catch {
    return fail("Something went wrong. Please try again.", 500);
  }
}
