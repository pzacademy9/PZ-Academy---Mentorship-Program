// src/lib/landing/registration/choice-types.ts
// Shapes shared by the server helpers and the admin card. No server or database imports.
import type { ChoiceOption } from "@/lib/landing/registration/match-choice";

export type ChoiceGroup = {
  label: string;
  mode: "live" | "recorded" | null;
  count: number;
  paidCount: number;
  suggestedKeys: string[];
  confident: boolean;
};

export type ChoiceOverview = { hasOptions: boolean; options: ChoiceOption[]; groups: ChoiceGroup[] };
