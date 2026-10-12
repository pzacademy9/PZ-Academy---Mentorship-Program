// src/lib/landing/templates.ts
import { emptyContent, type LandingContent, type PageKind } from "@/lib/landing/content";
import { PPC_BATCH_3 } from "@/lib/landing/templates-data/ppc-batch-3";
import { MDC_BATCH_3 } from "@/lib/landing/templates-data/mdc-batch-3";
import { W20_DIABETES } from "@/lib/landing/templates-data/w20-diabetes";

export interface TemplateInfo { id: string; kind: PageKind; label: string; description: string }

interface TemplateDef extends TemplateInfo { build: () => LandingContent }

const DEFS: TemplateDef[] = [
  { id: "blank-course", kind: "course", label: "Blank course page", description: "Every course section, ready to fill in.", build: () => emptyContent("course") },
  { id: "blank-workshop", kind: "workshop", label: "Blank workshop page", description: "Every workshop section, ready to fill in.", build: () => emptyContent("workshop") },
  { id: "blank-webinar", kind: "webinar", label: "Blank webinar page", description: "Every webinar section, ready to fill in.", build: () => emptyContent("webinar") },
  { id: "ppc-batch-3", kind: "course", label: "Practical Pharmacology Course (Batch 3)", description: "A copy of the current PPC Batch 3 page, ready to edit.", build: () => PPC_BATCH_3 },
  { id: "mdc-batch-3", kind: "workshop", label: "Mastering Dose Calculation (Batch 3)", description: "A copy of the current MDC workshop page, ready to edit.", build: () => MDC_BATCH_3 },
  { id: "w20-diabetes", kind: "webinar", label: "Diabetes Pharmacotherapy (Webinar 20)", description: "A copy of the current Webinar 20 page, ready to edit.", build: () => W20_DIABETES },
];

export const TEMPLATES: TemplateInfo[] = DEFS.map(({ id, kind, label, description }) => ({ id, kind, label, description }));

function fresh(c: LandingContent): LandingContent {
  const copy = structuredClone(c);
  copy.sections = copy.sections.map((s) => ({ ...s, id: globalThis.crypto.randomUUID() }));
  return copy;
}

/** A fresh deep copy with NEW section ids, or null for an unknown id or a kind mismatch. */
export function buildTemplate(id: string, kind: PageKind): LandingContent | null {
  const def = DEFS.find((d) => d.id === id);
  if (!def || def.kind !== kind) return null;
  return fresh(def.build());
}
