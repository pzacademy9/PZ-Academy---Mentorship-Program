// src/components/landing/sections/types.ts
import type { Register } from "../RegisterButton";

export interface SectionProps {
  data: Record<string, unknown>;
  register: Register;
}
