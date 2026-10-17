// src/components/landing/sections/types.ts
import type { Register } from "../RegisterButton";

export interface SectionProps {
  data: Record<string, unknown>;
  register: Register;
  /** Ids of the page's enabled sections; lets a Hero button link to one. */
  sectionIds?: string[];
}
