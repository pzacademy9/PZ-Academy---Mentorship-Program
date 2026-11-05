import type { CourseType } from "@/lib/data/lms";

/**
 * Type-aware copy for /courses/[slug], per the plan's table: a webinar's
 * single free session reads very differently from a multi-week course.
 * `showCertificate` is false for webinar — a single free session isn't a
 * credentialed program the way a course/workshop is.
 */
export const PROGRAM_COPY: Record<
  CourseType,
  {
    priceLabel: string;
    curriculumHeading: string;
    unitNoun: string;
    accessPerkTitle: string;
    accessPerkDesc: string;
    ctaVerb: "Enroll" | "Register";
    showCertificate: boolean;
    /** Lower-case name used in sentences ("This workshop includes"). */
    noun: string;
    /** The list page a visitor came from, for the "back" trail. */
    list: { label: string; href: string };
  }
> = {
  course: {
    priceLabel: "Course Fee",
    curriculumHeading: "Course Curriculum",
    unitNoun: "Module",
    accessPerkTitle: "Lifetime Access",
    accessPerkDesc: "Watch lessons anywhere, anytime forever.",
    ctaVerb: "Enroll",
    showCertificate: true,
    noun: "course",
    list: { label: "Courses", href: "/courses" },
  },
  workshop: {
    priceLabel: "Workshop Fee",
    curriculumHeading: "Workshop Agenda",
    unitNoun: "Day",
    accessPerkTitle: "Lifetime Recordings",
    accessPerkDesc: "Revisit every session recording anytime, anywhere.",
    ctaVerb: "Register",
    showCertificate: true,
    noun: "workshop",
    list: { label: "Workshops", href: "/workshops" },
  },
  webinar: {
    priceLabel: "Registration",
    curriculumHeading: "What's Covered",
    unitNoun: "Session",
    accessPerkTitle: "Recording Access",
    accessPerkDesc: "Watch the recording anytime after the session.",
    ctaVerb: "Register",
    showCertificate: false,
    noun: "webinar",
    list: { label: "Webinars", href: "/webinars" },
  },
  mentorship: {
    priceLabel: "Fee",
    curriculumHeading: "Curriculum",
    unitNoun: "Session",
    accessPerkTitle: "Lifetime Access",
    accessPerkDesc: "Watch lessons anywhere, anytime forever.",
    ctaVerb: "Enroll",
    showCertificate: true,
    noun: "program",
    list: { label: "Mentorship", href: "/mentorship" },
  },
};
