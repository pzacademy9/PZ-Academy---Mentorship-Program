// Default text of a live-session email. Plain text with tags; the send renders them per person.
export type SessionEmailSource = {
  title: string;
  number: number;
  include_kahoot: boolean;
  kahoot_url: string;
  include_attendance_link: boolean;
};

export function buildSessionEmail(
  session: SessionEmailSource,
  kind: "reminder" | "update" = "reminder",
): { subject: string; body: string } {
  const name = session.title.trim() !== "" ? session.title.trim() : `Session ${session.number}`;
  const lines: string[] = ["Hi {{first_name}},", ""];
  if (kind === "update") {
    lines.push(`The time of your live session "${name}" has changed. The new time is:`);
  } else {
    lines.push(`Your live session "${name}" is coming up:`);
  }
  lines.push("{{session_time}}", "", "Join on Zoom here:", "{{zoom_link}}");
  if (session.include_kahoot && session.kahoot_url.trim() !== "") {
    lines.push("", "Kahoot quiz link:", "{{kahoot_link}}");
  }
  if (session.include_attendance_link) {
    lines.push("", "Mark your attendance with this link during the session:", "{{attendance_link}}");
  }
  lines.push("", "Your PZ ID: {{pz_id}}", "", "See you there,", "PZ Academy");
  const subject = kind === "update" ? `Updated: ${name} is on a new time` : `Reminder: ${name} is coming up`;
  return { subject, body: lines.join("\n") };
}
