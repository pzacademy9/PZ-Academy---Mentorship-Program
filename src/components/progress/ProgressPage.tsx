"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CircleAlert, CircleHelp, Hourglass, LoaderCircle, Lock, ShieldCheck, TrendingUp } from "lucide-react";
import type { FindMyIdByNameResult, MyProgressResult } from "@/app/progress/actions";
import type { Progress } from "@/lib/progress/build";
import { MyIdSection } from "./MyIdSection";
import { ProgressSection } from "./ProgressSection";
import { StepHeading, btnFocus, inputClass } from "./ui";

const FALLBACK_ERROR = "Something went wrong. Please try again in a minute.";

type IdError = "empty" | "not_found" | "rate_limited" | { message: string } | null;

interface Props {
  findId: (query: string) => Promise<FindMyIdByNameResult>;
  getProgress: (rawId: string) => Promise<MyProgressResult>;
}

export function ProgressPage({ findId, getProgress }: Props) {
  const [pzId, setPzId] = useState("");
  const [progress, setProgress] = useState<{ data: Progress; lookup: number } | null>(null);
  const [idError, setIdError] = useState<IdError>(null);
  const [pending, startTransition] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);
  const idRef = useRef<HTMLInputElement>(null);
  const helloRef = useRef<HTMLHeadingElement>(null);
  const lookups = useRef(0);

  // After a successful lookup, move focus to the greeting so screen readers announce it.
  useEffect(() => {
    if (progress) helloRef.current?.focus();
  }, [progress]);

  function fill(id: string, focus: boolean) {
    setPzId(id);
    setIdError(null);
    if (focus) idRef.current?.focus();
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = pzId.trim();
    if (!id) {
      setIdError("empty");
      setProgress(null);
      return;
    }
    startTransition(async () => {
      let res: MyProgressResult;
      try {
        res = await getProgress(id);
      } catch {
        res = { status: "error", message: FALLBACK_ERROR };
      }
      if (res.status === "ok") {
        setIdError(null);
        lookups.current += 1;
        setProgress({ data: res.progress, lookup: lookups.current });
        return;
      }
      setProgress(null);
      setIdError(res.status === "error" ? { message: res.message } : res.status);
    });
  }

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-2xl flex-col gap-6 font-body text-pz-on-surface">
      <header className="relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-xl bg-gradient-to-br from-pz-surface-container-lowest to-pz-surface-container-low p-5 shadow-sm ring-1 ring-pz-outline-variant/40">
        <div aria-hidden className="pointer-events-none absolute -bottom-6 -right-4 h-28 w-28 rounded-full bg-pz-primary-container/20 blur-xl" />
        <div className="flex min-w-0 items-center gap-2">
          <ShieldCheck aria-hidden className="h-7 w-7 shrink-0 text-pz-primary" />
          <h1 className="min-w-0 break-words font-headline text-2xl font-extrabold tracking-tight text-pz-on-surface sm:text-3xl">
            Track Your Progress
          </h1>
        </div>
        <p className="text-base leading-relaxed text-pz-on-surface-variant">
          Check your attendance and quiz results with your PZ ID. No login needed.
        </p>
        <p className="flex min-w-0 items-start gap-2 pt-1 font-label text-sm text-pz-secondary">
          <Lock aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0">Your privacy is protected: no email, phone number or surname is ever shown.</span>
        </p>
      </header>

      <MyIdSection findId={findId} nameRef={nameRef} onFill={fill} />

      <section aria-labelledby="my-progress-heading" className="flex min-w-0 flex-col gap-3">
        <StepHeading n={2} id="my-progress-heading" title="My Progress Tracker" note="Your own record only" />
        <form
          onSubmit={onSubmit}
          noValidate
          className="flex min-w-0 flex-col gap-3 rounded-xl bg-pz-surface-container-lowest p-4 shadow-sm ring-1 ring-pz-outline-variant/40"
        >
          <label htmlFor="progress-id" className="font-headline text-sm font-semibold text-pz-on-surface-variant">
            Your PZ ID
          </label>
          <input
            ref={idRef}
            id="progress-id"
            name="pzId"
            value={pzId}
            onChange={(e) => {
              setPzId(e.target.value);
              if (idError) setIdError(null);
            }}
            placeholder="Name-0000"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            aria-invalid={idError ? true : undefined}
            aria-describedby="progress-id-status"
            className={`${inputClass} font-headline font-bold tracking-wide`}
          />
          <button
            type="submit"
            disabled={pending}
            aria-busy={pending || undefined}
            className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-pz-primary px-4 py-3 font-headline text-base font-bold text-pz-on-primary shadow-md transition-opacity hover:opacity-90 disabled:opacity-60 motion-reduce:transition-none ${btnFocus}`}
          >
            {pending ? (
              <LoaderCircle aria-hidden className="h-5 w-5 motion-safe:animate-spin" />
            ) : (
              <TrendingUp aria-hidden className="h-5 w-5" />
            )}
            {pending ? "Loading your progress..." : "Show my progress"}
          </button>
          <div id="progress-id-status" className="min-w-0">
            {idError && <IdErrorNotice error={idError} />}
          </div>
          <button
            type="button"
            onClick={() => nameRef.current?.focus()}
            className={`flex min-h-11 items-center gap-1.5 self-start rounded text-left font-label text-sm text-pz-secondary underline-offset-2 hover:underline ${btnFocus}`}
          >
            <CircleHelp aria-hidden className="h-4 w-4 shrink-0" />
            Forgot your ID? Use Find my ID above
          </button>
        </form>
      </section>

      {progress && (
        <ProgressSection key={progress.lookup} progress={progress.data} headingRef={helloRef} />
      )}

      <footer className="flex flex-col items-center gap-1 pb-4 pt-2 text-center">
        <p className="flex items-center justify-center gap-1.5 font-headline text-sm font-semibold text-pz-primary">
          <ShieldCheck aria-hidden className="h-4 w-4 shrink-0" />
          PZ Academy privacy promise
        </p>
        <p className="max-w-sm text-sm text-pz-on-surface-variant">
          This page only ever shows a first name, a PZ ID and that one person&apos;s own classes and marks. No phone number,
          email or surname is ever shown.
        </p>
      </footer>
    </div>
  );
}

function IdErrorNotice({ error }: { error: Exclude<IdError, null> }) {
  if (error === "rate_limited") {
    return (
      <div role="alert" className="flex min-w-0 items-start gap-2 rounded-lg bg-pz-secondary-fixed p-3 text-pz-on-secondary-fixed">
        <Hourglass aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
        <p className="min-w-0 text-sm font-medium">Too many tries. Please wait a few minutes, then try again.</p>
      </div>
    );
  }
  const text =
    error === "empty"
      ? "Type your PZ ID first. It looks like Name-0000."
      : error === "not_found"
        ? "We could not find that ID. Check it matches the format Name-0000 and try again, or use Find my ID above."
        : error.message;
  return (
    <div role="alert" className="flex min-w-0 items-start gap-2 rounded-lg bg-pz-error-container p-3 text-pz-on-error-container">
      <CircleAlert aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
      <p className="min-w-0 break-words text-sm font-medium">{text}</p>
    </div>
  );
}
