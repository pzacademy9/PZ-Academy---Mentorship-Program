"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Kind = "course" | "workshop" | "webinar";

const KINDS: { value: Kind; label: string }[] = [
  { value: "course", label: "Course" },
  { value: "workshop", label: "Workshop" },
  { value: "webinar", label: "Webinar" },
];

const STEPS = [
  "1. Copy the instructions below.",
  "2. Open your AI chat (ChatGPT, Claude or Gemini), paste the instructions and attach your course document.",
  "3. Answer its questions. When it gives you the final file, save it as a .md file, then use Import .md on the Landing Pages list.",
];

const LIST_HREF = "/dashboard/admin/landing-pages";
const LINK_CLASS = "font-body text-sm font-semibold text-pz-primary hover:underline";

export function MakeWithAi({ prompts }: { prompts: Record<Kind, string> }) {
  const [kind, setKind] = useState<Kind>("course");
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preview = useRef<HTMLTextAreaElement>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function choose(next: Kind) {
    if (timer.current) clearTimeout(timer.current);
    setKind(next);
    setCopied(false);
    setFailed(false);
  }

  async function copy() {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(prompts[kind]);
      setFailed(false);
      setCopied(true);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setFailed(true);
      preview.current?.focus();
      preview.current?.select();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4">
        <Link href={LIST_HREF} className={LINK_CLASS}>Back to Landing Pages</Link>
        <Link href={LIST_HREF} className={LINK_CLASS}>Import .md</Link>
      </div>

      <div role="group" aria-label="What are you making?" className="inline-flex rounded-lg border border-pz-outline-variant overflow-hidden">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            aria-pressed={kind === k.value}
            onClick={() => choose(k.value)}
            className={`px-5 py-2 font-body text-sm font-semibold transition-colors ${
              kind === k.value ? "bg-pz-primary text-pz-on-primary" : "bg-pz-surface text-pz-on-surface-variant hover:bg-pz-surface-container"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <ol className="space-y-2 font-body text-sm text-pz-on-surface list-none">
        {STEPS.map((s) => <li key={s}>{s}</li>)}
      </ol>

      <div className="space-y-2">
        <Button type="button" size="lg" onClick={copy} aria-live="polite">
          {copied ? "Copied" : "Copy instructions"}
        </Button>
        {failed && (
          <p role="alert" className="font-body text-sm text-pz-error">
            Could not copy. Select the text below and copy it yourself.
          </p>
        )}
      </div>

      <textarea
        ref={preview}
        readOnly
        aria-label="Instructions preview"
        value={prompts[kind]}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full h-80 max-h-[60vh] overflow-auto rounded-lg border border-pz-outline-variant bg-pz-surface-container p-3 font-mono text-xs text-pz-on-surface"
      />
    </div>
  );
}
