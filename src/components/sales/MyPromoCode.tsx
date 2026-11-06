"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, CircleCheck, Ticket, UserPlus } from "lucide-react";

export type MyPromo = { code: string; used: number; paid: number };

function Stat({ icon: Icon, label, value }: { icon: typeof Ticket; label: string; value: number }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5 rounded-xl bg-pz-surface-container-low px-3 py-2.5 md:min-w-[5.5rem] md:flex-none">
      <span className="flex items-center gap-1 font-body text-xs text-pz-on-surface-variant">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </span>
      <span className="font-headline text-xl font-bold text-pz-secondary">{value.toLocaleString("en-US")}</span>
    </div>
  );
}

export function MyPromoCode({ promo }: { promo: MyPromo | null }) {
  const [current, setCurrent] = useState<MyPromo | null>(promo);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/sales/my-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
      if (res.ok && j.code) setCurrent({ code: j.code, used: 0, paid: 0 });
      else setError(j.error ?? "Could not save your code. Please try again.");
    } catch {
      setError("Could not save your code. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(current.code);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="rounded-2xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4 md:p-5">
      <h2 className="font-headline text-lg font-bold text-pz-on-surface">My discount code</h2>
      {current ? (
        <>
          <p className="mt-1 font-body text-sm text-pz-on-surface-variant">
            Give this to a student who asks for a discount. They can also add a percent, like {current.code}-15%.
          </p>
          <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
            <span className="flex-1 rounded-xl bg-pz-surface-container-low px-3 py-2.5 font-mono text-sm font-semibold text-pz-on-surface">
              {current.code}
            </span>
            <button
              type="button"
              onClick={copy}
              aria-label="Copy code"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-pz-primary px-4 py-2.5 font-body text-sm font-semibold text-pz-on-primary hover:opacity-90 max-md:w-full"
            >
              {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              {copied ? "Copied!" : "Copy code"}
            </button>
          </div>
          <div className="mt-4 flex w-full gap-2 border-t border-pz-outline-variant pt-4 md:w-auto">
            <Stat icon={UserPlus} label="Students who used it" value={current.used} />
            <Stat icon={CircleCheck} label="Paid" value={current.paid} />
          </div>
        </>
      ) : (
        <form onSubmit={create} className="mt-1 space-y-3">
          <p className="font-body text-sm text-pz-on-surface-variant">
            Make your own code for students who ask for a discount. You can make it once, so choose carefully.
          </p>
          <div>
            <label htmlFor="my-code-name" className="font-body text-sm font-semibold text-pz-on-surface">Your code name</label>
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded-xl bg-pz-surface-container-high px-3 py-2.5 font-mono text-sm font-semibold text-pz-on-surface-variant">PZ-</span>
              <input
                id="my-code-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={12}
                autoCapitalize="characters"
                autoComplete="off"
                placeholder="AHM"
                className="min-w-0 flex-1 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2.5 font-mono text-sm uppercase text-pz-on-surface"
              />
            </div>
            <p className="mt-1 font-body text-xs text-pz-on-surface-variant">2 to 8 letters or numbers, like your initials.</p>
          </div>
          {error && <p role="alert" className="font-body text-sm text-pz-danger">{error}</p>}
          <button
            type="submit"
            disabled={busy || name.trim() === ""}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-pz-primary px-4 py-2.5 font-body text-sm font-semibold text-pz-on-primary hover:opacity-90 disabled:opacity-50 max-md:w-full"
          >
            <Ticket className="h-4 w-4" aria-hidden="true" />
            Create my code
          </button>
        </form>
      )}
    </section>
  );
}
