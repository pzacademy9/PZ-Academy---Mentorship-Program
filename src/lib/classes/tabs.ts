// The three tabs of a class on the Classes screen. No "use client": server and client files both use these plain values.

export const CLASS_TABS = ["links", "attendance", "quiz"] as const;
export type ClassTab = (typeof CLASS_TABS)[number];

export const CLASS_TAB_LABELS: Record<ClassTab, string> = {
  links: "Links and emails",
  attendance: "Attendance",
  quiz: "Quiz and podium",
};

/** Short labels for a phone, where three tabs share one row. */
export const CLASS_TAB_SHORT_LABELS: Record<ClassTab, string> = {
  links: "Links",
  attendance: "Attendance",
  quiz: "Quiz",
};

/** Anything unknown gives the Links tab. */
export function parseClassTab(v: string | null | undefined): ClassTab {
  return (CLASS_TABS as readonly string[]).includes(v ?? "") ? (v as ClassTab) : "links";
}

export const classTabId = (t: ClassTab): string => `class-tab-${t}`;
export const classPanelId = (t: ClassTab): string => `class-panel-${t}`;
