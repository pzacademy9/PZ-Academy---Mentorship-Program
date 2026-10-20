// src/lib/data/participant-campaigns.ts
// Admin-only reads behind the participants messaging screen. Callers gate with requireAdmin;
// there is deliberately no agent-scope path here. Test rows are never returned.
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { RegistrationStatus } from "@/lib/landing/registration/config";
import type { Candidate } from "@/lib/landing/participants/types";
import { applyHeadFilters, type RegistrationListFilters } from "@/lib/data/landing-registration-admin";

type Row = Record<string, unknown>;
const STATUSES: RegistrationStatus[] = ["pending", "reserved", "underpaid", "paid", "free"];
const HEAD_ROW_TYPES = ["individual", "lead"];
const str = (v: unknown): string => (typeof v === "string" ? v : "");

export interface Campaign {
  pageId: string;
  title: string;
  pageStatus: "draft" | "published" | "closed";
  total: number;
  counts: Record<RegistrationStatus, number>;
}

export async function listCampaigns(): Promise<Campaign[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("landing_registrations")
    .select("page_id, status, created_at")
    .in("row_type", HEAD_ROW_TYPES)
    .eq("is_test", false)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const byPage = new Map<string, Campaign>();
  for (const r of (data ?? []) as unknown as Row[]) {
    const id = str(r.page_id);
    let c = byPage.get(id);
    if (!c) {
      c = { pageId: id, title: "", pageStatus: "draft", total: 0, counts: { pending: 0, reserved: 0, underpaid: 0, paid: 0, free: 0 } };
      byPage.set(id, c);
    }
    c.total += 1;
    const s = str(r.status) as RegistrationStatus;
    if (STATUSES.includes(s)) c.counts[s] += 1;
  }
  if (byPage.size === 0) return [];
  const { data: pages, error: pErr } = await admin.from("landing_pages").select("id, title, status").in("id", Array.from(byPage.keys()));
  if (pErr) throw pErr;
  for (const p of pages ?? []) {
    const c = byPage.get(p.id);
    if (!c) continue;
    c.title = p.title;
    c.pageStatus = p.status === "published" || p.status === "closed" ? p.status : "draft";
  }
  return Array.from(byPage.values()); // Map keeps first-seen order: newest registration first
}

export async function listCampaignFilterOptions(pageId: string): Promise<{ regions: string[]; optionLabels: string[] }> {
  const { data, error } = await createAdminSupabase()
    .from("landing_registrations")
    .select("region, option_label")
    .eq("page_id", pageId)
    .in("row_type", HEAD_ROW_TYPES)
    .eq("is_test", false);
  if (error) throw error;
  const regions = new Set<string>();
  const labels = new Set<string>();
  for (const r of (data ?? []) as unknown as Row[]) {
    if (str(r.region)) regions.add(str(r.region));
    if (str(r.option_label)) labels.add(str(r.option_label));
  }
  return { regions: Array.from(regions).sort(), optionLabels: Array.from(labels).sort() };
}

/** Heads (and their non-test members) of one page, as sendable candidates. Members take the lead's refId and status. */
export async function resolveCandidates(input: { pageId: string; ids?: string[]; filters?: RegistrationListFilters }): Promise<Candidate[]> {
  const admin = createAdminSupabase();
  let heads: Row[];
  if (input.ids) {
    const ids = Array.from(new Set(input.ids));
    if (ids.length === 0) return [];
    const { data, error } = await admin
      .from("landing_registrations")
      .select("*")
      .in("id", ids)
      .eq("page_id", input.pageId)
      .in("row_type", HEAD_ROW_TYPES)
      .eq("is_test", false);
    if (error) throw error;
    heads = (data ?? []) as unknown as Row[];
    const found = new Set(heads.map((h) => str(h.id)));
    if (ids.some((id) => !found.has(id))) throw new Error("A selected registration is not on this campaign");
  } else {
    const f = input.filters ?? {};
    let query = applyHeadFilters(
      admin.from("landing_registrations").select("*"),
      { kind: "all" },
      { ...f, pageId: input.pageId },
    );
    if (f.status && f.status !== "all") query = query.eq("status", f.status);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;
    heads = (data ?? []) as unknown as Row[];
  }
  if (heads.length === 0) return [];

  const { data: memberData, error: mErr } = await admin
    .from("landing_registrations")
    .select("*")
    .in("lead_registration_id", heads.map((h) => str(h.id)))
    .eq("is_test", false)
    .order("created_at", { ascending: true });
  if (mErr) throw mErr;
  const members = (memberData ?? []) as unknown as Row[];

  const out: Candidate[] = [];
  for (const h of heads) {
    const lead = { leadId: str(h.id), refId: str(h.ref_id), status: str(h.status) as RegistrationStatus };
    out.push({ registrationId: lead.leadId, leadId: lead.leadId, isMember: false, name: str(h.name), email: str(h.email), phone: str(h.whatsapp), refId: lead.refId, status: lead.status });
    for (const m of members.filter((x) => str(x.lead_registration_id) === lead.leadId)) {
      out.push({ registrationId: str(m.id), leadId: lead.leadId, isMember: true, name: str(m.name), email: str(m.email), phone: str(m.whatsapp), refId: lead.refId, status: lead.status });
    }
  }
  return out;
}
