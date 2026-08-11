"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, Unlink, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const inputClass =
  "w-full border border-pz-outline-variant rounded-lg px-3 py-2.5 text-sm font-body focus:outline-none focus:ring-2 focus:ring-pz-primary/20 focus:border-pz-primary";
const labelClass = "block font-headline text-xs font-bold uppercase tracking-wide text-pz-on-surface-variant mb-1.5";

export function MentorAccountCard({ mentorId, linkedEmail }: { mentorId: string; linkedEmail: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [existingEmail, setExistingEmail] = useState<string | null>(null);
  const [unlinkOpen, setUnlinkOpen] = useState(false);

  function sendInvite() {
    startTransition(async () => {
      const res = await fetch(`/api/admin/mentors/${mentorId}/account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { status?: string; email?: string; error?: string }
        | null;

      if (!res.ok) {
        toast.error(payload?.error ?? "Could not process this invite.");
        return;
      }
      if (payload?.status === "existing" && payload.email) {
        setExistingEmail(payload.email);
        return;
      }
      toast.success(`Invite sent to ${payload?.email}.`);
      router.refresh();
    });
  }

  function confirmLink() {
    if (!existingEmail) return;
    startTransition(async () => {
      const res = await fetch(`/api/admin/mentors/${mentorId}/account`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: existingEmail }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not link this account.");
        setExistingEmail(null);
        return;
      }
      toast.success(`Linked existing account (${existingEmail}) as this mentor.`);
      setExistingEmail(null);
      router.refresh();
    });
  }

  function confirmUnlink() {
    startTransition(async () => {
      const res = await fetch(`/api/admin/mentors/${mentorId}/account`, { method: "DELETE" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not unlink this account.");
        setUnlinkOpen(false);
        return;
      }
      toast.success("Account unlinked.");
      setUnlinkOpen(false);
      router.refresh();
    });
  }

  return (
    <section className="bg-pz-surface-container-lowest p-6 sm:p-8 rounded-xl border border-pz-outline-variant space-y-4">
      <h3 className="font-headline text-lg font-bold text-pz-on-surface border-b border-pz-outline-variant pb-4 flex items-center gap-2">
        <Mail className="w-5 h-5 text-pz-primary" />
        Mentor Account
      </h3>

      {linkedEmail ? (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="font-body text-sm text-pz-on-surface">
              Linked to <span className="font-bold">{linkedEmail}</span>
            </p>
            <p className="font-body text-xs text-pz-on-surface-variant mt-0.5">
              This account can log in at /dashboard/mentor with role &ldquo;mentor&rdquo;.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setUnlinkOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 border border-pz-danger text-pz-danger font-headline font-bold text-sm rounded-lg hover:bg-pz-danger/10 transition-colors"
          >
            <Unlink className="w-4 h-4" />
            Unlink account
          </button>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className={labelClass}>Mentor&apos;s email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mentor@example.com"
              className={inputClass}
            />
          </div>
          <button
            type="button"
            onClick={sendInvite}
            disabled={isPending || email.trim().length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 self-end bg-pz-primary-container text-pz-on-primary-container font-headline font-bold text-sm rounded-lg hover:shadow-md transition-all disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {isPending ? "Working…" : "Invite Mentor"}
          </button>
        </div>
      )}

      <Dialog open={existingEmail !== null} onOpenChange={(open) => !open && setExistingEmail(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-headline text-pz-on-surface">Link existing account?</DialogTitle>
            <DialogDescription className="font-body text-pz-on-surface-variant">
              {existingEmail} already has an account. Promote it to mentor and link it to this profile?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setExistingEmail(null)}
              disabled={isPending}
              className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmLink}
              disabled={isPending}
              className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-primary-container text-pz-on-primary-container hover:shadow-md transition-all disabled:opacity-50"
            >
              {isPending ? "Linking…" : "Link account"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={unlinkOpen} onOpenChange={setUnlinkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-headline text-pz-on-surface">Unlink this account?</DialogTitle>
            <DialogDescription className="font-body text-pz-on-surface-variant">
              The account itself isn&apos;t deleted, but it loses mentor access and reverts to a regular student
              account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setUnlinkOpen(false)}
              disabled={isPending}
              className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmUnlink}
              disabled={isPending}
              className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-danger text-white hover:bg-pz-danger/90 transition-colors disabled:opacity-50"
            >
              {isPending ? "Unlinking…" : "Unlink"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
