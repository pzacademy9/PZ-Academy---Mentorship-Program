import { getCourseBySlug } from "@/lib/data/lms";
import { getOpenLiveBatch } from "@/lib/data/landing-website";
import { courseCalendarEvent, icsFile } from "@/lib/marketing/calendar";
import { isUpcomingWebinar } from "@/lib/marketing/webinar-time";
import { siteOrigin } from "@/lib/marketing/site-origin";

export const dynamic = "force-dynamic";

/** The "Phone or Outlook" calendar file for a course page's live batch or upcoming webinar. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const course = await getCourseBySlug(slug);
  if (!course || !course.isPublished) return new Response("Not found", { status: 404 });

  const nowMs = Date.now();
  const batch = await getOpenLiveBatch(course.id);
  const event = courseCalendarEvent({
    course,
    batch,
    origin: siteOrigin(),
    nowMs,
    webinarUpcoming: course.type === "webinar" && isUpcomingWebinar(course, nowMs),
  });
  const text = event ? icsFile(event, `${course.id}-${Date.parse(event.startIso)}@pz-academy`, nowMs) : null;
  if (!text) return new Response("No date to add yet", { status: 404 });

  const safeName = course.slug.replace(/[^a-z0-9-]/gi, "") || "event";
  return new Response(text, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
