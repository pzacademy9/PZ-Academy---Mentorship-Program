"use client";

// src/components/affiliates/PayoutRequestSheet.tsx
// Asks where to send the money. A bottom sheet on a phone, a centred dialog on a wide screen.
// The amount is only shown here: the server works out the real amount from the balance.
import { useEffect, useRef, useState } from "react";
import { formatPayoutPkr, maskAccount, validatePayoutDetails, type PayoutMethod } from "@/lib/affiliates/payouts";

const METHODS: { value: PayoutMethod; label: string; hint: string }[] = [
  { value: "jazzcash", label: "JazzCash", hint: "Mobile wallet" },
  { value: "easypaisa", label: "Easypaisa", hint: "Mobile wallet" },
  { value: "bank", label: "Bank", hint: "IBAN" },
];

const FIELD =
  "min-h-[44px] w-full rounded-2xl border border-landing-border bg-landing-surface px-3 py-2 text-sm text-landing-deep outline-none focus:border-landing-primary";
const NETWORK_ERROR = "Could not reach the server. Please check your connection and try again.";

export function PayoutRequestSheet({
  token,
  amountPkr,
  onDone,
  onClose,
}: {
  token: string;
  amountPkr: number;
  onDone: (done: { amountPkr: number; method: PayoutMethod; accountMask: string }) => void;
  onClose: () => void;
}) {
  const [method, setMethod] = useState<PayoutMethod>("jazzcash");
  const [title, setTitle] = useState("");
  const [number, setNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (!sendingRef.current) onClose();
      return;
    }
    if (e.key !== "Tab") return;
    // Keep the Tab key inside the sheet while it is open.
    const items = dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input, [tabindex='0']");
    if (!items || items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  async function confirm() {
    if (sendingRef.current) return;
    const checked = validatePayoutDetails({ method, title, number });
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/affiliates/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, method: checked.method, title: checked.title, number: checked.number }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; amountPkr?: number; error?: string };
      if (res.ok && body.ok && typeof body.amountPkr === "number") {
        onDone({ amountPkr: body.amountPkr, method: checked.method, accountMask: maskAccount(checked.number) });
        return;
      }
      setError(body.error || "Something went wrong. Please try again.");
    } catch {
      setError(NETWORK_ERROR);
    }
    sendingRef.current = false;
    setSending(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center md:p-6" onKeyDown={onKeyDown}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payout-sheet-title"
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-landing-border bg-white p-5 shadow-landing-soft md:rounded-3xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="payout-sheet-title" ref={headingRef} tabIndex={-1} className="font-headline text-lg font-bold text-landing-deep outline-none">
            {`Request payout of ${formatPayoutPkr(amountPkr)}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            aria-label="Close"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-landing-border bg-white text-lg text-landing-deep"
          >
            <span aria-hidden>×</span>
          </button>
        </div>

        <fieldset className="mb-4">
          <legend className="mb-2 text-xs font-semibold text-landing-deep">Payment method</legend>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map((m) => (
              <label
                key={m.value}
                className={`flex min-h-[44px] cursor-pointer flex-col items-center justify-center rounded-2xl border p-2.5 text-center ${
                  method === m.value ? "border-landing-primary bg-landing-mint-light" : "border-landing-border bg-landing-surface"
                }`}
              >
                <input
                  type="radio"
                  name="payout-method"
                  value={m.value}
                  checked={method === m.value}
                  onChange={() => setMethod(m.value)}
                  className="sr-only"
                />
                <span className="text-xs font-bold text-landing-deep">{m.label}</span>
                <span className="mt-0.5 text-[10px] text-landing-muted">{m.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mb-4 space-y-3">
          <div>
            <label htmlFor="payout-title" className="mb-1 block text-xs font-semibold text-landing-deep">Account title</label>
            <input id="payout-title" type="text" autoComplete="off" value={title} onChange={(e) => setTitle(e.target.value)} className={FIELD} />
            <p className="mt-1 text-[11px] text-landing-muted">Must match the name on the account.</p>
          </div>
          <div>
            <label htmlFor="payout-number" className="mb-1 block text-xs font-semibold text-landing-deep">Account number or IBAN</label>
            <input id="payout-number" type="text" inputMode={method === "bank" ? "text" : "numeric"} autoComplete="off" value={number} onChange={(e) => setNumber(e.target.value)} className={FIELD} />
            <p className="mt-1 text-[11px] text-landing-muted">11 digits for JazzCash or Easypaisa, or a 24-character IBAN for Bank.</p>
          </div>
        </div>

        <p className="mb-4 rounded-2xl bg-landing-mint-light p-3 text-xs font-medium text-landing-deep">The whole balance is paid in one go</p>

        {error && (
          <p role="alert" className="mb-3 text-sm font-medium text-pz-danger">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={confirm}
          disabled={sending}
          className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-landing-mint px-6 py-3 font-headline text-sm font-bold text-landing-deep disabled:opacity-60"
        >
          Confirm
        </button>
      </div>
    </div>
  );
}
