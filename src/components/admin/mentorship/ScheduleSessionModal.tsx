"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Info } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";

export function ScheduleSessionModal({
  bookingId,
  studentName,
  mentorName,
  packageName,
}: {
  bookingId: string;
  studentName: string;
  mentorName: string;
  packageName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const { run: submit, pending: isPending } = useAsyncAction(async () => {
    if (!date || !time) {
      toast.error("Pick both a date and a time.");
      return;
    }
    const scheduledAt = new Date(`${date}T${time}:00`).toISOString();

    const res = await fetch("/api/admin/mentorship/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, scheduledAt }),
    });

    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      toast.error(payload?.error ?? "Could not schedule this session.");
      return;
    }

    setOpen(false);
    toast.success(`Session 1 scheduled for ${studentName}.`);
    router.refresh();
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 max-md:min-h-11 rounded-lg px-3 py-1.5 text-xs font-headline font-bold text-pz-primary hover:bg-pz-primary/10 transition-colors"
      >
        <CalendarClock className="w-3.5 h-3.5" />
        Schedule
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-headline text-pz-on-surface">Schedule Session</DialogTitle>
          </DialogHeader>

          <div className="bg-pz-surface-container p-3 rounded-lg flex flex-col gap-1.5">
            <div className="flex justify-between text-sm">
              <span className="font-label text-pz-on-surface-variant">Student</span>
              <span className="font-body font-medium text-pz-on-surface">{studentName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-label text-pz-on-surface-variant">Mentor</span>
              <span className="font-body font-medium text-pz-on-surface">{mentorName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-label text-pz-on-surface-variant">Package</span>
              <span className="font-body font-medium text-pz-on-surface">{packageName}</span>
            </div>
          </div>

          <h3 className="font-headline font-semibold text-sm text-pz-on-surface border-b border-pz-outline-variant pb-1.5">Session 1</h3>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="session-date" className="font-headline text-xs font-semibold uppercase tracking-wide text-pz-on-surface-variant">
              Date
            </label>
            <input
              id="session-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-pz-outline-variant bg-white focus:border-pz-primary focus:ring-2 focus:ring-pz-primary/20 outline-none font-body text-sm max-md:text-base max-md:min-h-11"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="session-time" className="font-headline text-xs font-semibold uppercase tracking-wide text-pz-on-surface-variant">
              Time
            </label>
            <input
              id="session-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-pz-outline-variant bg-white focus:border-pz-primary focus:ring-2 focus:ring-pz-primary/20 outline-none font-body text-sm max-md:text-base max-md:min-h-11"
            />
          </div>

          <div className="flex gap-2 items-start bg-pz-surface-container p-3 rounded-lg">
            <Info className="w-4 h-4 text-pz-tertiary shrink-0 mt-0.5" />
            <p className="font-label text-xs text-pz-tertiary leading-relaxed">
              Sessions 2 and beyond (if this package has more) will be created as unscheduled — set their dates later from this table.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <Button
              variant="bare"
              size="bare"
              type="button"
              onClick={() => submit()}
              loading={isPending}
              className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors disabled:opacity-50"
            >
              {isPending ? "Working…" : "Create Sessions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
