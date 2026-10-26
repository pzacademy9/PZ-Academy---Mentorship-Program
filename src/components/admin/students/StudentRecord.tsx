import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { formatDate, initials } from "@/lib/format";
import type { CertChip, StudentRecordData } from "@/lib/data/admin-students";
import { Overview } from "./tabs/Overview";
import { CoursesPayments } from "./tabs/CoursesPayments";
import { Progress } from "./tabs/Progress";
import { Attendance } from "./tabs/Attendance";
import { Feedback } from "./tabs/Feedback";
import { Certificates } from "./tabs/Certificates";
import { Mentorship } from "./tabs/Mentorship";

export const TABS = [
  { key: "overview", label: "Overview" },
  { key: "courses", label: "Courses and payments" },
  { key: "progress", label: "Progress" },
  { key: "attendance", label: "Attendance" },
  { key: "feedback", label: "Feedback" },
  { key: "certificates", label: "Certificates" },
  { key: "mentorship", label: "Mentorship" },
] as const;

export type Tab = (typeof TABS)[number]["key"];

/** Invalid, missing or repeated values fall back to overview. */
export function parseTab(v: string | string[] | undefined): Tab {
  if (typeof v !== "string") return "overview";
  return TABS.some((t) => t.key === v) ? (v as Tab) : "overview";
}

const CERT_LABEL: Record<Exclude<CertChip, "unknown">, string> = { issued: "Issued", pending: "Pending", none: "None" };

function Tile({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div
      data-testid={`tile-${id}`}
      className="min-w-36 flex-1 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4"
    >
      <p className="font-body text-xs font-bold uppercase text-pz-on-surface-variant">{label}</p>
      <p className="mt-1 font-headline text-2xl font-bold text-pz-on-surface">{children}</p>
    </div>
  );
}

export function StudentRecord({ data, tab }: { data: StudentRecordData; tab: Tab }) {
  const { profile, tiles } = data;
  const base = `/dashboard/admin/students/${encodeURIComponent(profile.id)}`;
  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/admin/students"
        className="inline-flex min-h-11 items-center gap-1.5 font-body text-sm font-bold text-pz-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to Students
      </Link>

      <div className="flex items-center gap-4">
        <Avatar className="h-14 w-14">
          <AvatarFallback className="bg-pz-primary-container text-base font-bold text-pz-on-primary-container">
            {initials(profile.fullName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 space-y-0.5">
          <h1 className="break-words font-headline text-2xl font-bold text-pz-on-surface">{profile.fullName}</h1>
          {profile.email && <p className="break-all font-body text-sm text-pz-on-surface-variant">{profile.email}</p>}
          {profile.phone && <p className="font-body text-sm text-pz-on-surface-variant">{profile.phone}</p>}
          <p className="font-body text-xs text-pz-on-surface-variant">Joined {formatDate(profile.joinedAt)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Tile id="courses" label="Courses">{tiles.courses}</Tile>
        <Tile id="progress" label="Progress">{tiles.progress}%</Tile>
        <Tile id="sessions" label="Sessions attended">{tiles.attended}</Tile>
        <Tile id="average" label="Average feedback">
          {tiles.averageFeedback === null ? "—" : Math.round(tiles.averageFeedback * 10) / 10}
        </Tile>
        <Tile id="certificate" label="Certificate">
          {tiles.certificate === "unknown" ? "—" : CERT_LABEL[tiles.certificate]}
        </Tile>
      </div>

      <nav aria-label="Student sections" className="-mx-4 overflow-x-auto px-4">
        <ul className="flex w-max gap-2">
          {TABS.map((t) => (
            <li key={t.key}>
              <Link
                href={t.key === "overview" ? base : `${base}?tab=${t.key}`}
                aria-current={tab === t.key ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-4 font-body text-sm font-semibold",
                  tab === t.key
                    ? "border-pz-primary bg-pz-primary-container text-pz-on-primary-container"
                    : "border-pz-outline-variant bg-pz-surface-container-lowest text-pz-on-surface hover:bg-pz-surface-container-low",
                )}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div>
        {tab === "overview" && <Overview data={data} />}
        {tab === "courses" && <CoursesPayments enrollments={data.enrollments} />}
        {tab === "progress" && <Progress rows={data.progressByCourse} />}
        {tab === "attendance" && <Attendance rows={data.attendance} />}
        {tab === "feedback" && <Feedback rows={data.feedback} />}
        {tab === "certificates" && <Certificates certs={data.certs} />}
        {tab === "mentorship" && <Mentorship rows={data.mentorship} />}
      </div>
    </div>
  );
}
