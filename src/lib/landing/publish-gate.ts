// src/lib/landing/publish-gate.ts
// One call that answers "can this page go live?": the readiness list plus the page checks.
// Failed checks block publish (they become problems). Warnings never block; the builder asks first.
import { computeReadiness, type LandingContent, type Problem } from "./content";
import { failures, runPageChecks, warnings, type PageCheck } from "./page-check";
import { registrationTarget } from "./registration/setup-steps";

export interface PublishCheckResult {
  ready: boolean;
  problems: Problem[];
  warnings: PageCheck[];
  checks: PageCheck[];
}

export function publishCheck(
  c: LandingContent,
  page: { title: string; slug: string; hasCourse: boolean },
): PublishCheckResult {
  const checks = runPageChecks(c, { hasCourse: page.hasCourse });
  const problems: Problem[] = [...computeReadiness(c, { title: page.title, slug: page.slug }).problems];
  for (const f of failures(checks)) {
    problems.push({
      message: f.detail ?? f.title,
      sectionId: f.sectionId ?? (f.step ? registrationTarget(f.step) : undefined),
    });
  }
  return { ready: problems.length === 0, problems, warnings: warnings(checks), checks };
}
