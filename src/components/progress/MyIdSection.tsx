"use client";

import { useEffect, useRef, useState, useTransition, type RefObject } from "react";
import { Check, CircleAlert, Copy, Hourglass, LoaderCircle, Search } from "lucide-react";
import type { FindMyIdByNameResult } from "@/app/progress/actions";
import { StepHeading, btnFocus, inputClass } from "./ui";

const COPIED_MS = 2000;
const FALLBACK_ERROR = "Something went wrong. Please try again in a minute.";

type CopyState = { key: string; status: "copied" | "failed" } | null;

interface Props {
  findId: (query: string) => Promise<FindMyIdByNameResult>;
  nameRef: RefObject<HTMLInputElement>;
  /** Put an ID into the step 2 box. `focus` moves the keyboard focus there. */
  onFill: (pzId: string, focus: boolean) => void;
}

export function MyIdSection({ findId, nameRef, onFill }: Props) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<FindMyIdByNameResult | null>(null);
  const [copy, setCopy] = useState<CopyState>(null);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCopy(null);
    if (query.trim().length < 3) {
      setResult({ status: "too_short" });
      return;
    }
    startTransition(async () => {
      try {
        setResult(await findId(query));
      } catch {
        setResult({ status: "error", message: FALLBACK_ERROR });
      }
    });
  }

  async function onCopy(key: string, pzId: string) {
    if (timer.current) clearTimeout(timer.current);
    onFill(pzId, false);
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(pzId);
        ok = true;
      }
    } catch {
      ok = false;
    }
    setCopy({ key, status: ok ? "copied" : "failed" });
    if (ok) timer.current = setTimeout(() => setCopy(null), COPIED_MS);
  }

  const invalid = result?.status === "too_short" || result?.status === "not_found";

  return (
    <section aria-labelledby="find-id-heading" className="flex min-w-0 flex-col gap-3">
      <StepHeading n={1} id="find-id-heading" title="Find My ID" note="Privacy-safe lookup" />
      <div className="flex min-w-0 flex-col gap-3 rounded-xl bg-pz-surface-container-lowest p-4 shadow-sm ring-1 ring-pz-outline-variant/40">
        <form onSubmit={onSubmit} noValidate className="flex min-w-0 flex-col gap-3">
          <label htmlFor="progress-name" className="font-headline text-sm font-semibold text-pz-on-surface-variant">
            Type your first name
          </label>
          <input
            ref={nameRef}
            id="progress-name"
            name="name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Sample"
            autoComplete="given-name"
            enterKeyHint="search"
            aria-invalid={invalid || undefined}
            aria-describedby="progress-name-status"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={pending}
            aria-busy={pending || undefined}
            className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-pz-surface-container-highest px-4 py-3 font-headline text-base font-bold text-pz-on-surface transition-colors hover:bg-pz-surface-variant disabled:opacity-60 motion-reduce:transition-none ${btnFocus}`}
          >
            {pending ? (
              <LoaderCircle aria-hidden className="h-5 w-5 motion-safe:animate-spin" />
            ) : (
              <Search aria-hidden className="h-5 w-5" />
            )}
            {pending ? "Searching..." : "Find my ID"}
          </button>
        </form>

        <div id="progress-name-status" aria-live="polite" className="min-w-0">
          {result && (
            <IdResult result={result} copy={copy} onCopy={onCopy} onUse={(id) => onFill(id, true)} />
          )}
        </div>
      </div>
    </section>
  );
}

function Notice({ tone, title, body }: { tone: "error" | "wait"; title: string; body: string }) {
  const cls =
    tone === "error"
      ? "bg-pz-error-container text-pz-on-error-container"
      : "bg-pz-secondary-fixed text-pz-on-secondary-fixed";
  const Icon = tone === "error" ? CircleAlert : Hourglass;
  return (
    <div className={`flex min-w-0 items-start gap-2.5 rounded-lg p-3.5 ${cls}`}>
      <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0">
        <p className="font-headline text-sm font-bold">{title}</p>
        <p className="mt-0.5 break-words text-sm">{body}</p>
      </div>
    </div>
  );
}

function IdResult({
  result,
  copy,
  onCopy,
  onUse,
}: {
  result: FindMyIdByNameResult;
  copy: CopyState;
  onCopy: (key: string, pzId: string) => void;
  onUse: (pzId: string) => void;
}) {
  switch (result.status) {
    case "too_short":
      return <Notice tone="error" title="Name too short" body="Type at least 3 letters of your first name, then tap Find my ID." />;
    case "not_found":
      return (
        <Notice
          tone="error"
          title="We could not find that name"
          body="Check the spelling and use the first name you registered with. Still stuck? Message the PZ Academy team."
        />
      );
    case "rate_limited":
      return <Notice tone="wait" title="Too many tries" body="Please wait a few minutes, then try again." />;
    case "error":
      return <Notice tone="error" title="Something went wrong" body={result.message} />;
    case "ok":
      break;
  }

  if (result.rows.length === 1) {
    const r = result.rows[0];
    const key = `0-${r.pzId}`;
    const state = copy?.key === key ? copy.status : null;
    return (
      <div className="flex min-w-0 flex-col gap-3 rounded-lg bg-pz-surface-container-low p-3.5">
        <div className="min-w-0">
          <p className="break-words font-headline text-base font-bold text-pz-on-surface">{r.firstName}</p>
          {r.batchTitle && <p className="break-words text-sm text-pz-on-surface-variant">Batch: {r.batchTitle}</p>}
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md bg-pz-surface-container-lowest p-3 shadow-sm">
          <div className="min-w-0">
            <span className="block font-headline text-xs font-semibold uppercase tracking-wider text-pz-outline">Your PZ ID</span>
            <span className="block break-all font-headline text-2xl font-black tracking-wide text-pz-primary">{r.pzId}</span>
          </div>
          <CopyButton state={state} onClick={() => onCopy(key, r.pzId)} label={`Copy ID ${r.pzId}`} />
        </div>
        <CopyMessage state={state} />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg bg-pz-surface-container-low p-3.5">
      <p className="font-headline text-sm font-bold text-pz-on-surface">{result.rows.length} matches found</p>
      <p className="text-sm text-pz-on-surface-variant">Pick the one with your batch. Tap Use to put it in the box below.</p>
      <ul className="flex min-w-0 flex-col gap-2">
        {result.rows.map((r, i) => (
          <li
            key={`${i}-${r.pzId}`}
            className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md bg-pz-surface-container-lowest p-3 shadow-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="break-words font-headline text-sm font-bold text-pz-on-surface">
                {r.firstName} <span aria-hidden>·</span>{" "}
                <span className="break-all font-black text-pz-primary">{r.pzId}</span>
              </p>
              {r.batchTitle && <p className="break-words text-sm text-pz-on-surface-variant">Batch: {r.batchTitle}</p>}
            </div>
            <button
              type="button"
              onClick={() => onUse(r.pzId)}
              aria-label={`Use ID ${r.pzId}`}
              className={`min-h-11 min-w-16 shrink-0 rounded-md bg-pz-surface-container-high px-4 font-headline text-sm font-bold text-pz-on-surface transition-colors hover:bg-pz-surface-container-highest motion-reduce:transition-none ${btnFocus}`}
            >
              Use
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CopyButton({ state, onClick, label }: { state: "copied" | "failed" | null; onClick: () => void; label: string }) {
  const copied = state === "copied";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={copied ? "Copied" : label}
      className={`flex min-h-12 shrink-0 items-center gap-1.5 rounded-md px-4 font-headline text-sm font-bold shadow-sm transition-colors motion-reduce:transition-none ${btnFocus} ${
        copied ? "bg-pz-tertiary text-pz-on-tertiary" : "bg-pz-primary text-pz-on-primary"
      }`}
    >
      {copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CopyMessage({ state }: { state: "copied" | "failed" | null }) {
  if (state === "copied") {
    return <p className="text-sm text-pz-on-surface-variant">Copied. We also put it in the box below, ready to use.</p>;
  }
  if (state === "failed") {
    return (
      <p role="alert" className="text-sm font-semibold text-pz-academy-error">
        Your phone did not let us copy it. We put your ID in the box below, so just tap Show my progress. To keep it, press and hold the ID to copy it yourself.
      </p>
    );
  }
  return null;
}
