import { CalendarPlus, Download } from "lucide-react";

export type CalendarLinks = { google: string; ics: string };

/** "Add to calendar": Google Calendar, or an .ics file for phones, Outlook and Apple Calendar. */
export function CalendarButtons({ links, tone = "light" }: { links: CalendarLinks; tone?: "light" | "dark" }) {
  const base = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 font-poppins text-sm font-semibold transition-colors";
  const look = tone === "dark"
    ? "bg-white/10 text-white hover:bg-white/20"
    : "border border-pz-border bg-pz-surface-container-lowest text-pz-deep hover:bg-pz-web-surface-low";
  return (
    <div role="group" aria-label="Add to calendar" className="flex flex-wrap items-center gap-2">
      <a href={links.google} target="_blank" rel="noopener noreferrer" className={`${base} ${look}`}>
        <CalendarPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
        Google Calendar
      </a>
      <a href={links.ics} download className={`${base} ${look}`}>
        <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
        Phone or Outlook
      </a>
    </div>
  );
}
