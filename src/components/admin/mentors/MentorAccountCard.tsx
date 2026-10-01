"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, Unlink, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const inputClass =
  "w-full border border-pz-outline-variant rounded-lg px-3 py-2.5 text-sm max-md:text-base max-md:min-h-11 font-body focus:outline-none focus:ring-2 focus:ring-pz-primary/20 focus:border-pz-primary";
const labelClass = "block font-headline text-xs font-bold uppercase tracking-wide text-pz-on-surface-variant mb-1.5";

export function MentorAccountCard({ mentorId, linkedEmail }: { mentorId: string; linkedEmail: string | null }) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [existingEmail, setExistingEmail] = useState<string | null>(null);
  const [unlinkOpen, setUnlinkOpen] = useState(false);

  const { run: sendInvite, pending: inviting } = useAsyncAction(async () => {
    try {
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
      startTransition(() => router.refresh());
    } catch {
      toast.error("Could not process this invite.");
    }
  });

  const { run: confirmLink, pending: linking } = useAsyncAction(async () => {
    if (!existingEmail) return;
    try {
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
      startTransition(() => router.refresh());
    } catch {
      toast.error("Could not link this account.");
    }
  });

  const { run: confirmUnlink, pending: unlinking } = useAsyncAction(async () => {
    try {
      const res = await fetch(`/api/admin/mentors/${mentorId}/account`, { method: "DELETE" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not unlink this account.");
        setUnlinkOpen(false);
        return;
      }
      toast.success("Account unlinked.");
      setUnlinkOpen(false);
      startTransition(() => router.refresh());
    } catch {
      toast.error("Could not unlink this account.");
    }
  });

  return (
    <section className="bg-pz-surface-container-lowest p-4 sm:p-8 rounded-xl border border-pz-outline-variant space-y-4">
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
            className="inline-flex items-center justify-center gap-2 px-4 py-2 max-md:min-h-11 border border-pz-danger text-pz-danger font-headline font-bold text-sm rounded-lg hover:bg-pz-danger/10 transition-colors"
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
          <Button
            type="button"
            variant="bare"
            size="bare"
            loading={inviting || isRefreshing}
            disabled={email.trim().length === 0}
            onClick={() => sendInvite()}
            className="gap-2 px-4 py-2.5 max-md:min-h-11 sm:self-end bg-pz-primary-container text-pz-on-primary-container font-headline font-bold text-sm rounded-lg hover:shadow-md transition-all"
          >
            <Send className="w-4 h-4" />
            {inviting || isRefreshing ? "Working…" : "Invite Mentor"}
          </Button>
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
            <Button
              type="button"
              variant="bare"
              size="bare"
              onClick={() => setExistingEmail(null)}
              disabled={linking || isRefreshing}
              className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="bare"
              size="bare"
              loading={linking || isRefreshing}
              onClick={() => confirmLink()}
              className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-primary-container text-pz-on-primary-container hover:shadow-md transition-all"
            >
              {linking || isRefreshing ? "Linking…" : "Link account"}
            </Button>
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
            <Button
              type="button"
              variant="bare"
              size="bare"
              onClick={() => setUnlinkOpen(false)}
              disabled={unlinking || isRefreshing}
              className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="bare"
              size="bare"
              loading={unlinking || isRefreshing}
              onClick={() => confirmUnlink()}
              className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-danger text-white hover:bg-pz-danger/90 transition-colors"
            >
              {unlinking || isRefreshing ? "Unlinking…" : "Unlink"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
