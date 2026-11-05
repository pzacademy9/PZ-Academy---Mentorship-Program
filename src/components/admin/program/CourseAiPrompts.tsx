"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type Kind = "whole" | "page" | "improve";

const TABS: { value: Kind; label: string; what: string; steps: string[] }[] = [
  {
    value: "whole",
    label: "Whole course",
    what: "A new course from your brochure, YouTube links and quiz file: details, page, modules, sessions and quizzes.",
    steps: [
      "Copy the instructions below.",
      "Open your AI chat (ChatGPT, Claude or Gemini), paste them, and attach your brochure, YouTube links and quiz file.",
      "Answer its questions. Save the file it gives you.",
      "Go to Courses, press Build from file, and add the file. A draft course is made.",
    ],
  },
  {
    value: "page",
    label: "Page only",
    what: "The course page from a WhatsApp post, poster text or brochure: details, price, lists and questions. No sessions.",
    steps: [
      "Copy the instructions below.",
      "Open your AI chat, paste them, then paste your WhatsApp post or poster text.",
      "Save the file it gives you.",
      "Open the course in the editor. In the Public Page card, press Import page from a file. Check, then Save.",
    ],
  },
  {
    value: "improve",
    label: "Improve my page",
    what: "Makes your current page clearer and shorter. It keeps your facts and never invents numbers, reviews or teacher names.",
    steps: [
      "Open the course in the editor. In the Public Page card, press Download my page as a file.",
      "Copy the instructions below, paste them in your AI chat, and attach that file.",
      "Save the improved file it gives you.",
      "Back in the editor, press Import page from a file. Check every change, then Save.",
    ],
  },
];

const LINK = "font-body text-sm font-semibold text-pz-primary hover:underline";

export function CourseAiPrompts({ prompts, example }: { prompts: Record<Kind, string>; example: string }) {
  const [kind, setKind] = useState<Kind>("whole");
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preview = useRef<HTMLTextAreaElement>(null);
  const tab = TABS.find((t) => t.value === kind)!;

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

  function downloadExample() {
    const url = URL.createObjectURL(new Blob([example], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "example-course-file.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Link href="/dashboard/admin/courses" className={LINK}>Back to Courses</Link>
        <Link href="/dashboard/admin/courses/import" className={LINK}>Build a course from a file</Link>
      </div>

      <div role="group" aria-label="What do you want to make?" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            aria-pressed={kind === t.value}
            onClick={() => choose(t.value)}
            className={`min-h-11 rounded-lg px-4 font-body text-sm font-semibold transition-colors ${
              kind === t.value ? "bg-pz-primary text-pz-on-primary" : "border border-pz-outline-variant bg-pz-surface text-pz-on-surface-variant hover:bg-pz-surface-container"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section aria-label={tab.label} className="space-y-4 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4 sm:p-6">
        <p className="font-body text-sm text-pz-on-surface">{tab.what}</p>
        <ol className="list-decimal space-y-1 pl-5 font-body text-sm text-pz-on-surface">
          {tab.steps.map((s) => <li key={s}>{s}</li>)}
        </ol>

        <div className="space-y-2">
          <Button type="button" size="lg" onClick={copy} aria-live="polite">
            {copied ? "Copied" : "Copy instructions"}
          </Button>
          {failed && (
            <p role="alert" className="font-body text-sm text-pz-error">Could not copy. Select the text below and copy it yourself.</p>
          )}
        </div>

        <textarea
          ref={preview}
          readOnly
          aria-label="Instructions preview"
          value={prompts[kind]}
          onFocus={(e) => e.currentTarget.select()}
          className="h-72 max-h-[60vh] w-full overflow-auto rounded-lg border border-pz-outline-variant bg-pz-surface-container p-3 font-mono text-xs text-pz-on-surface"
        />
      </section>

      <section aria-label="Example file" className="space-y-2 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4 sm:p-6">
        <p className="font-headline text-base font-bold text-pz-on-surface">Example file</p>
        <p className="font-body text-sm text-pz-on-surface-variant">
          A complete small course file with every part filled in. Open it to see the layout, or give it to your AI chat as a model.
        </p>
        <button
          type="button"
          onClick={downloadExample}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-pz-outline-variant px-4 font-headline text-sm font-bold text-pz-primary transition-colors hover:bg-pz-surface-container-low"
        >
          <Download className="h-4 w-4" aria-hidden="true" /> Download example file
        </button>
      </section>
    </div>
  );
}
