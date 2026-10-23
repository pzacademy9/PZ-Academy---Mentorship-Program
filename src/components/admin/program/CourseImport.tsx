"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ImportSummary } from "@/lib/lms/course-import/analyze";

type Preview = {
  title: string;
  type: string;
  warnings: string[];
  summary: ImportSummary;
};

type Created = {
  id: string;
  warnings: string[];
  summary: ImportSummary;
};

type Stage =
  | { name: "start" }
  | { name: "preview"; text: string; preview: Preview }
  | { name: "done"; created: Created };

const ATTACH = [
  "Your course information files (the ones that list the modules and sessions)",
  "Your YouTube links, with the lecture name or day written beside each link",
  "Your quiz file (Word or PDF) with the correct answers marked",
  "Links to your notes on Google Drive",
];

const TYPE_LABEL: Record<string, string> = { course: "Course", workshop: "Workshop", webinar: "Webinar" };

const CARD = "rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4 md:p-6 space-y-4";
const STEP_HEAD = "font-headline font-bold text-lg text-pz-secondary";
const LINK_CLASS = "font-body text-sm font-semibold text-pz-primary hover:underline";
const SECONDARY_BTN =
  "inline-flex items-center justify-center rounded-lg border border-pz-outline-variant px-4 py-2 max-md:min-h-11 font-body text-sm font-semibold text-pz-on-surface-variant hover:bg-pz-surface-container-low transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const FIELD_CLASS =
  "w-full rounded-lg border border-pz-outline-variant bg-pz-surface p-3 font-mono text-xs text-pz-on-surface";

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

async function readErrors(res: Response): Promise<string[]> {
  try {
    const body = (await res.json()) as { errors?: unknown };
    if (Array.isArray(body.errors) && body.errors.length > 0) return body.errors.map(String);
  } catch {
    // fall through to the generic message
  }
  return ["Something went wrong. Please try again."];
}

function WarningList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 font-body text-sm text-pz-on-surface">
      {items.map((w, i) => (
        <li key={i}>{w}</li>
      ))}
    </ul>
  );
}

export function CourseImport({ prompt }: { prompt: string }) {
  const [stage, setStage] = useState<Stage>({ name: "start" });
  const [pasted, setPasted] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [notesCopied, setNotesCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptBox = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (notesTimer.current) clearTimeout(notesTimer.current);
    },
    [],
  );

  async function copy() {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyFailed(false);
      setCopied(true);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setCopyFailed(true);
      promptBox.current?.focus();
      promptBox.current?.select();
    }
  }

  async function copyNotes(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotesCopied(true);
      if (notesTimer.current) clearTimeout(notesTimer.current);
      notesTimer.current = setTimeout(() => setNotesCopied(false), 2000);
    } catch {
      setNotesCopied(false);
    }
  }

  async function check(text: string) {
    if (busy) return;
    setBusy(true);
    setErrors([]);
    try {
      const res = await fetch("/api/admin/courses/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        setErrors(await readErrors(res));
        return;
      }
      const preview = (await res.json()) as Preview;
      setStage({ name: "preview", text, preview });
    } catch {
      setErrors(["Could not reach the server. Check your connection and try again."]);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      setErrors(["That file could not be read. Try another file."]);
      return;
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
    await check(text);
  }

  async function create(text: string) {
    if (busy) return;
    setBusy(true);
    setErrors([]);
    try {
      const res = await fetch("/api/admin/courses/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        setErrors(await readErrors(res));
        // Only a rejected file sends you back to step 1; a server failure keeps the preview.
        if (res.status === 400) setStage({ name: "start" });
        return;
      }
      const created = (await res.json()) as Created;
      setStage({ name: "done", created });
    } catch {
      setErrors(["We could not confirm the course was created. Check the course list before trying again."]);
    } finally {
      setBusy(false);
    }
  }

  function reset(keepPasted = false) {
    setStage({ name: "start" });
    setErrors([]);
    if (!keepPasted) setPasted("");
  }

  if (stage.name === "done") {
    const { id, warnings, summary } = stage.created;
    const notesText = summary.unassignedNotes
      .map((n) => (n.label ? `${n.label} | ${n.url}` : n.url))
      .join("\n");
    return (
      <div className="space-y-6">
        <section className={CARD}>
          <h2 className={STEP_HEAD}>4. Done</h2>
          <div role="status" className="rounded-lg bg-pz-primary-container px-3 py-2 font-body text-sm font-semibold text-pz-on-primary-container">
            Draft course created
          </div>
          <div className="space-y-1 font-body text-sm text-pz-on-surface">
            <p className="font-semibold">What is left to do</p>
            <ol className="list-decimal pl-5 space-y-1">
              {summary.detailsFilled.length > 0 && (
                <li>Check the course details that were filled in: {summary.detailsFilled.join(", ")}.</li>
              )}
              <li>Add the images.</li>
              <li>Publish the course when you are ready. Students cannot see it until then.</li>
            </ol>
          </div>

          {warnings.length > 0 && (
            <div className="space-y-2">
              <p className="font-body text-sm font-semibold text-pz-on-surface">Needs your attention</p>
              <WarningList items={warnings} />
            </div>
          )}

          {summary.unassignedNotes.length > 0 && (
            <div className="space-y-2">
              <p className="font-body text-sm font-semibold text-pz-on-surface">
                Notes links that were not placed on a session
              </p>
              <p className="font-body text-sm text-pz-on-surface-variant">
                These were not saved. Copy them and add them to the right sessions by hand.
              </p>
              <textarea
                readOnly
                aria-label="Notes links that were not placed"
                value={notesText}
                rows={Math.min(10, summary.unassignedNotes.length + 1)}
                onFocus={(e) => e.currentTarget.select()}
                className={FIELD_CLASS}
              />
              <button type="button" onClick={() => copyNotes(notesText)} className={SECONDARY_BTN} aria-live="polite">
                {notesCopied ? "Copied" : "Copy these links"}
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <Link
              href={`/dashboard/admin/courses/${id}`}
              className="inline-flex items-center justify-center rounded-lg bg-pz-primary px-4 py-2 max-md:min-h-11 font-body text-sm font-bold text-pz-on-primary hover:opacity-90 transition-opacity"
            >
              Open course editor
            </Link>
            <button type="button" onClick={() => reset()} className={LINK_CLASS}>
              Build another course
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (stage.name === "preview") {
    const { text, preview } = stage;
    const { summary } = preview;
    return (
      <div className="space-y-6">
        <section className={CARD}>
          <h2 className={STEP_HEAD}>3. Check before saving</h2>
          <div role="status" className="rounded-lg bg-pz-surface-container px-3 py-2 font-body text-sm font-semibold text-pz-on-surface">
            Nothing saved yet. Look through the list below, then create the draft.
          </div>

          <div>
            <p className="font-headline text-xl font-bold text-pz-secondary">{preview.title}</p>
            <p className="font-body text-sm text-pz-on-surface-variant">
              {TYPE_LABEL[preview.type] ?? preview.type} ·{" "}
              {preview.type === "course" ? `${plural(summary.modules, "module")} · ` : ""}
              {plural(summary.sessions, "session")} · {plural(summary.videos, "video link")} ·{" "}
              {plural(summary.questions, "quiz question")}
            </p>
            <p className="mt-1 font-body text-sm text-pz-on-surface-variant">
              {summary.detailsFilled.length > 0
                ? `Course details found: ${summary.detailsFilled.join(", ")}`
                : "No course details in the file"}
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-pz-outline-variant">
            <table className="w-full min-w-[40rem] text-left font-body text-sm">
              <thead className="bg-pz-surface-container text-pz-on-surface-variant">
                <tr>
                  {preview.type === "course" && <th className="px-3 py-2 font-semibold">Module</th>}
                  <th className="px-3 py-2 font-semibold">Session</th>
                  <th className="px-3 py-2 font-semibold">Video link</th>
                  <th className="px-3 py-2 font-semibold">First quiz question</th>
                </tr>
              </thead>
              <tbody>
                {summary.sessionList.map((s, i) => (
                  <tr key={i} className="border-t border-pz-outline-variant align-top">
                    {preview.type === "course" && <td className="px-3 py-2">{s.module}</td>}
                    <td className="px-3 py-2 font-semibold text-pz-on-surface">{s.title}</td>
                    <td className="px-3 py-2 break-all">
                      {s.videoUrl || <span className="text-pz-on-surface-variant">No video link</span>}
                    </td>
                    <td className="px-3 py-2">
                      {s.firstQuestion || <span className="text-pz-on-surface-variant">No quiz</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.warnings.length > 0 && (
            <div className="space-y-2">
              <p className="font-body text-sm font-semibold text-pz-on-surface">
                {plural(preview.warnings.length, "thing")} to look at
              </p>
              <WarningList items={preview.warnings} />
            </div>
          )}

          {errors.length > 0 && (
            <div role="alert" className="space-y-1 rounded-lg bg-pz-error-container px-3 py-2 text-sm text-pz-on-error-container">
              {errors.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          )}

          <p className="font-body text-sm text-pz-on-surface-variant">
            Something not right? Fix the file, or ask the AI to fix it, then choose a different file. You can also
            create the draft anyway and fix things by hand.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" size="lg" disabled={busy} onClick={() => create(text)}>
              {busy ? "Creating..." : "Create draft course"}
            </Button>
            <button type="button" disabled={busy} onClick={() => reset(true)} className={SECONDARY_BTN}>
              Choose a different file
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className={CARD}>
        <h2 className={STEP_HEAD}>1. Get the file from AI</h2>
        <ol className="list-decimal space-y-1 pl-5 font-body text-sm text-pz-on-surface">
          <li>Copy the instructions below.</li>
          <li>Open your AI chat (ChatGPT, Claude or Gemini) and paste the instructions.</li>
          <li>Attach your material, then answer any questions it asks.</li>
          <li>Save the file it gives you, or copy it, and add it here.</li>
        </ol>

        <div className="space-y-1 font-body text-sm text-pz-on-surface">
          <p className="font-semibold">What to attach in the AI chat</p>
          <ul className="list-disc space-y-1 pl-5">
            {ATTACH.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <Button type="button" size="lg" onClick={copy} aria-live="polite">
            {copied ? "Copied" : "Copy instructions"}
          </Button>
          {copyFailed && (
            <p role="alert" className="font-body text-sm text-pz-on-error-container">
              Could not copy. Select the text below and copy it yourself.
            </p>
          )}
          <textarea
            ref={promptBox}
            readOnly
            aria-label="Instructions for the AI"
            value={prompt}
            onFocus={(e) => e.currentTarget.select()}
            className={`${FIELD_CLASS} h-40 max-h-[40vh] overflow-auto bg-pz-surface-container`}
          />
        </div>
      </section>

      <section className={CARD}>
        <h2 className={STEP_HEAD}>2. Add the file</h2>
        <div className="space-y-2">
          <label htmlFor="course-file" className="block font-body text-sm font-semibold text-pz-on-surface">
            Choose the file
          </label>
          <input
            ref={fileInput}
            id="course-file"
            type="file"
            accept=".md,.txt,text/plain,text/markdown"
            disabled={busy}
            onChange={(e) => onFile(e.target.files?.[0])}
            className="block w-full font-body text-sm text-pz-on-surface"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="course-paste" className="block font-body text-sm font-semibold text-pz-on-surface">
            Or paste the file here
          </label>
          <textarea
            id="course-paste"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={8}
            className={FIELD_CLASS}
          />
          <Button type="button" disabled={busy || pasted.trim() === ""} onClick={() => check(pasted)}>
            {busy ? "Checking..." : "Check the file"}
          </Button>
        </div>

        {errors.length > 0 && (
          <div role="alert" className="space-y-1 rounded-lg bg-pz-error-container px-3 py-2 text-sm text-pz-on-error-container">
            <p className="font-semibold">Please check the file:</p>
            <ul className="list-disc pl-5">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
