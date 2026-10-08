// Client-safe types and pure helpers for the agent campaigns UI. No I/O.
import type { CampaignStatus, CampaignRecipientStatus } from "@/lib/crm/campaign-rules";
import { outcomeLabel } from "@/lib/crm/sales-ui";

export type AudienceRowJson = { id: string; fullName: string; phone: string; lastOutcome: string | null; courses: string[] };
export type CampaignListItemJson = {
  id: string; name: string; status: CampaignStatus; recipientCount: number; sentCount: number;
  pendingCount: number; pausedReason: string | null; createdAt: string;
};
export type CampaignRecipientJson = { id: string; contactId: string | null; fullName: string; phone: string; status: CampaignRecipientStatus };
export type CampaignDetailJson = CampaignListItemJson & {
  messageTemplate: string; numberId: string | null; followupInHours: number; recipients: CampaignRecipientJson[];
};
export type AudienceFilter = { q: string; outcome: string; course: string }; // "" = no filter; outcome "new" = no outcome yet

export function filterAudience(rows: AudienceRowJson[], f: AudienceFilter): AudienceRowJson[] {
  const q = f.q.trim().toLowerCase();
  const qDigits = f.q.replace(/\D/g, "").replace(/^0+/, "");
  return rows.filter((r) => {
    if (q !== "") {
      const nameHit = r.fullName.toLowerCase().includes(q);
      const phoneHit = qDigits !== "" && r.phone.replace(/\D/g, "").includes(qDigits);
      if (!nameHit && !phoneHit) return false;
    }
    if (f.outcome !== "") {
      if (f.outcome === "new" ? r.lastOutcome !== null : r.lastOutcome !== f.outcome) return false;
    }
    if (f.course !== "" && !r.courses.includes(f.course)) return false;
    return true;
  });
}

export function courseOptions(rows: AudienceRowJson[]): string[] {
  return Array.from(new Set(rows.flatMap((r) => r.courses))).sort((a, b) => a.localeCompare(b));
}

export function outcomeOptions(rows: AudienceRowJson[]): { value: string; label: string }[] {
  const seen = new Set(rows.map((r) => r.lastOutcome ?? "new"));
  const order = ["new", "interested", "replied", "bought", "not_interested"];
  return order.filter((v) => seen.has(v)).map((v) => ({ value: v, label: v === "new" ? "New" : outcomeLabel(v) }));
}
