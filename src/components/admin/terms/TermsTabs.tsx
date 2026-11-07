"use client";

import { useState } from "react";
import { GeneralTermsEditor } from "./GeneralTermsEditor";
import type { TermsKey } from "@/lib/validations/site-terms";

const AFFILIATE_HELP =
  "Shown on the public affiliate application pages. Applications stay closed until all three affiliate documents have text. Plain text: start each part with 1. 2. 3. and a short title on its own line.";

const TABS: { key: TermsKey; tab: string; label: string; help?: string }[] = [
  { key: "general", tab: "General", label: "General Terms and Conditions" },
  { key: "affiliate_terms", tab: "Affiliate Terms", label: "Affiliate Terms", help: AFFILIATE_HELP },
  { key: "affiliate_rules", tab: "Affiliate Rules", label: "Affiliate Rules", help: AFFILIATE_HELP },
  { key: "affiliate_privacy", tab: "Affiliate Privacy", label: "Affiliate Privacy Policy", help: AFFILIATE_HELP },
];

/** The four Terms documents, one editor per tab. */
export function TermsTabs({ initial }: { initial: Record<TermsKey, string> }) {
  const [active, setActive] = useState<TermsKey>("general");
  const current = TABS.find((t) => t.key === active) ?? TABS[0];
  return (
    <div className="space-y-4">
      <div role="tablist" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === active}
            onClick={() => setActive(t.key)}
            className={`rounded-md border px-3 py-1.5 font-body text-sm font-semibold ${
              t.key === active
                ? "border-pz-solid-forest bg-pz-solid-forest text-white"
                : "border-pz-outline-variant bg-pz-surface-container-lowest text-pz-on-surface"
            }`}
          >
            {t.tab}
          </button>
        ))}
      </div>
      <GeneralTermsEditor key={current.key} initial={initial[current.key]} docKey={current.key} label={current.label} help={current.help} />
    </div>
  );
}
