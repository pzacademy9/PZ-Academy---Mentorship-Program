// src/components/landing/sections/types.ts
import type { Register } from "../RegisterButton";
import type { RegistrationConfig } from "@/lib/landing/registration/config";

export interface SectionProps {
  data: Record<string, unknown>;
  register: Register;
  /** Ids of the page's enabled sections; lets a Hero button link to one. */
  sectionIds?: string[];
  /** The page's registration settings; pricing cards linked to an option read their prices from it. */
  registration?: RegistrationConfig;
  /** Render time as ISO; the first paint of Early Bird prices uses it (the browser then re-checks the live clock). */
  nowIso?: string;
}
