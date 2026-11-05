"use client";

import { useEffect, useState, useTransition } from "react";
import type { PersonDetail } from "@/lib/data/pz-people-fix";

type Res = { ok: true } | { ok: false; message: string };

export interface FixActions {
  load: (id: string) => Promise<{ ok: true; person: PersonDetail } | { ok: false; message: string }>;
  rename: (id: string, name: string) => Promise<Res>;
  reissue: (id: string) => Promise<{ ok: true; oldId: string; newId: string } | { ok: false; message: string }>;
  addEmail: (id: string, email: string) => Promise<Res>;
  removeEmail: (id: string, email: string) => Promise<Res>;
  sendId: (id: string, email: string) => Promise<Res>;
}

interface Props {
  personId: string;
  actions: FixActions;
  onClose: () => void;
  /** Called after any change, with the student's current ID, so the list can refresh. */
  onChanged: (pzId: string) => void;
}

const box = "rounded-xl border border-pz-outline-variant bg-pz-surface-container-low p-4";
const input =
  "w-full rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2.5 text-sm text-pz-on-surface outline-none focus:border-pz-primary max-md:min-h-11";
const primaryBtn = "shrink-0 whitespace-nowrap rounded-lg bg-pz-primary px-4 py-2 text-sm font-bold text-pz-on-primary hover:opacity-90 disabled:opacity-60 max-md:min-h-11";
const ghostBtn = "shrink-0 whitespace-nowrap rounded-lg border border-pz-outline-variant px-4 py-2 text-sm font-semibold text-pz-on-surface hover:bg-pz-surface-container disabled:opacity-60 max-md:min-h-11";

export function PersonFixPanel({ personId, actions, onClose, onChanged }: Props) {
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [name, setName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [sendTo, setSendTo] = useState("");
  const [confirmReissue, setConfirmReissue] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function apply(p: PersonDetail) {
    setPerson(p);
    setName(p.name);
    setSendTo((cur) => (p.emails.includes(cur) ? cur : (p.emails[0] ?? "")));
  }

  async function reload(): Promise<PersonDetail | null> {
    const res = await actions.load(personId);
    if (!res.ok) {
      setError(res.message);
      return null;
    }
    apply(res.person);
    return res.person;
  }

  // Load once per student.
  useEffect(() => {
    let live = true;
    actions
      .load(personId)
      .then((res) => {
        if (!live) return;
        if (res.ok) apply(res.person);
        else setError(res.message);
      })
      .catch(() => live && setError("Could not load this student. Please try again."));
    return () => {
      live = false;
    };
  }, [personId, actions]);

  function run(work: () => Promise<Res | { ok: true; oldId: string; newId: string }>, done: (res: { ok: true; oldId?: string; newId?: string }) => string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const res = await work();
        if (!res.ok) {
          setError(res.message);
          return;
        }
        const fresh = await reload();
        setNotice(done(res));
        if (fresh) onChanged(fresh.pzId);
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  if (!person) {
    return (
      <section aria-label="Fix student" className="rounded-xl border border-pz-primary bg-pz-surface-container-lowest p-5">
        <p className="text-sm text-pz-on-surface-variant">{error ?? "Loading…"}</p>
        <button type="button" onClick={onClose} className={`mt-3 ${ghostBtn}`}>Close</button>
      </section>
    );
  }

  const nameChanged = name.replace(/\s+/g, " ").trim() !== person.name;

  return (
    <section aria-label={`Fix ${person.pzId}`} className="space-y-4 rounded-xl border border-pz-primary bg-pz-surface-container-lowest p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-pz-on-surface-variant">Fix or view student</p>
          <p className="break-words font-headline text-2xl font-bold text-pz-on-surface">{person.pzId}</p>
          <p className="break-words text-sm text-pz-on-surface-variant">{person.name}</p>
        </div>
        <button type="button" onClick={onClose} className={ghostBtn}>Close</button>
      </div>

      <div aria-live="polite">
        {error && <p className="text-sm font-semibold text-red-700 dark:text-red-400">{error}</p>}
        {notice && <p className="text-sm font-semibold text-pz-primary">{notice}</p>}
      </div>

      {/* Quick facts for troubleshooting */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Batches", value: person.batches.length },
          { label: "Quiz results", value: person.quizResults },
          { label: "Classes attended", value: person.attendance },
          { label: "Emails", value: person.emails.length },
        ].map((f) => (
          <div key={f.label} className="rounded-lg bg-pz-surface-container-low p-3">
            <dt className="text-xs text-pz-on-surface-variant">{f.label}</dt>
            <dd className="font-headline text-xl font-bold text-pz-on-surface">{f.value}</dd>
          </div>
        ))}
      </dl>

      {/* 1. Name */}
      <div className={box}>
        <label htmlFor={`fix-name-${person.id}`} className="block font-headline text-sm font-bold text-pz-on-surface">
          Full name
        </label>
        <p className="mt-0.5 text-xs text-pz-on-surface-variant">Fix spelling here. It changes the name on the website lists and the ID PDF.</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input id={`fix-name-${person.id}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={input} />
          <button
            type="button"
            disabled={pending || !nameChanged}
            onClick={() => run(() => actions.rename(person.id, name), () => "Name saved.")}
            className={primaryBtn}
          >
            Save name
          </button>
        </div>
      </div>

      {/* 2. New ID */}
      <div className={box}>
        <p className="font-headline text-sm font-bold text-pz-on-surface">Give a new ID</p>
        <p className="mt-0.5 text-xs text-pz-on-surface-variant">
          Use this when the ID was made from a wrong name. Fix the name first. The new ID starts with the first name. The old ID keeps working, so old results still count.
        </p>
        {person.oldIds.length > 0 && (
          <p className="mt-2 break-words text-xs text-pz-on-surface-variant">
            Old IDs that still work: <span className="font-mono">{person.oldIds.join(", ")}</span>
          </p>
        )}
        {!confirmReissue ? (
          <button type="button" disabled={pending || nameChanged} onClick={() => setConfirmReissue(true)} className={`mt-3 ${ghostBtn}`}>
            Give a new ID
          </button>
        ) : (
          <div role="alertdialog" aria-label="Confirm new ID" className="mt-3 rounded-lg border border-pz-primary bg-pz-surface-container-lowest p-3">
            <p className="text-sm text-pz-on-surface">
              {`Give ${person.name} a new ID instead of ${person.pzId}? Tell the student their new ID. ${person.pzId} will keep working.`}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setConfirmReissue(false);
                  run(() => actions.reissue(person.id), (r) => `New ID: ${r.newId}. ${r.oldId} still works.`);
                }}
                className={primaryBtn}
              >
                Yes, give a new ID
              </button>
              <button type="button" onClick={() => setConfirmReissue(false)} className={ghostBtn}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Emails */}
      <div className={box}>
        <p className="font-headline text-sm font-bold text-pz-on-surface">Emails</p>
        <p className="mt-0.5 text-xs text-pz-on-surface-variant">The ID belongs to these emails. A new registration with any of them gets this same ID. Remove only an email that is wrong.</p>
        <ul className="mt-2 space-y-2">
          {person.emails.map((e) => (
            <li key={e} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-pz-surface-container-lowest px-3 py-2">
              <span className="min-w-0 break-all text-sm text-pz-on-surface">{e}</span>
              {person.emails.length > 1 && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => actions.removeEmail(person.id, e), () => `Removed ${e}.`)}
                  aria-label={`Remove ${e}`}
                  className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-pz-surface-container dark:text-red-400 max-md:min-h-11"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex flex-col gap-2 sm:flex-row"
          onSubmit={(ev) => {
            ev.preventDefault();
            const email = newEmail;
            run(() => actions.addEmail(person.id, email), () => {
              setNewEmail("");
              return `Added ${email.trim().toLowerCase()}.`;
            });
          }}
        >
          <label htmlFor={`fix-email-${person.id}`} className="sr-only">Add an email</label>
          <input
            id={`fix-email-${person.id}`}
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Add an email"
            className={input}
          />
          <button type="submit" disabled={pending || !newEmail.trim()} className={ghostBtn}>Add email</button>
        </form>
      </div>

      {/* 4. Send ID */}
      <div className={box}>
        <p className="font-headline text-sm font-bold text-pz-on-surface">Send the ID by email</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <label htmlFor={`fix-send-${person.id}`} className="sr-only">Send to</label>
          <select id={`fix-send-${person.id}`} value={sendTo} onChange={(e) => setSendTo(e.target.value)} className={input}>
            {person.emails.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || !sendTo}
            onClick={() => run(() => actions.sendId(person.id, sendTo), () => `ID email sent to ${sendTo}.`)}
            className={primaryBtn}
          >
            Send ID email
          </button>
        </div>
      </div>

      {/* Batches */}
      {person.batches.length > 0 && (
        <div className={box}>
          <p className="font-headline text-sm font-bold text-pz-on-surface">Batches</p>
          <ul className="mt-2 space-y-1.5">
            {person.batches.map((b, i) => (
              <li key={`${b.title}-${i}`} className="flex flex-wrap justify-between gap-2 text-sm text-pz-on-surface">
                <span className="min-w-0 break-words">{b.title}</span>
                <span className="text-pz-on-surface-variant">
                  {b.mode === "recorded" ? "Recorded" : "Live"} · {b.status === "free" ? "Free" : "Paid"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
