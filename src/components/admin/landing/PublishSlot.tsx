import type { LandingPage, LandingVersion } from "@/lib/data/landing-pages";
import type { LandingContent } from "@/lib/landing/content";
import type { SaveState } from "@/hooks/useAutosaveDraft";

export interface EditorSlotProps {
  page: LandingPage;
  /** The current saved page name (may be newer than page.title after a rename). Readiness should use this. */
  title: string;
  versions: LandingVersion[];
  content: LandingContent;
  saveState: SaveState;
  saveNow: () => Promise<boolean>;
}

/**
 * Reserved for the publish step: the top bar's Versions and Publish controls. Intentionally renders
 * nothing yet, so the editor shows no control that does not work.
 */
export function PublishSlot(_props: EditorSlotProps): React.ReactNode {
  return null;
}

/** Reserved for the publish step: the "Ready to publish?" checklist under the section list. */
export function ReadinessSlot(_props: EditorSlotProps): React.ReactNode {
  return null;
}
