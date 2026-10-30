// src/lib/data/participant-campaigns.ts
// Admin-only reads behind the participants messaging screen. Callers gate with requireAdmin;
// there is deliberately no agent-scope path here. Test rows are never returned.
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { RegistrationStatus } from "@/lib/landing/registration/config";
import type { Candidate } from "@/lib/landing/participants/types";
import { applyHeadFilters, HEAD_ROW_TYPES, type RegistrationListFilters } from "@/lib/data/landing-registration-admin";

type Row = Record<string, unknown>;
const STATUSES: RegistrationStatus[] = ["pending", "reserved", "underpaid", "paid", "free"];
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Tunable so tests can use small values. PostgREST caps a response at 1000 rows; URLs break with hundreds of ids. */
export const paging = { pageSize: 1000, idChunk: 100 };

/** Reads every row of a query by paging with range() until a short page. `build` must give a stable total order. */
async function fetchAll(build: () => { range: (a: number, b: number) => PromiseLike<{ data: unknown; error: unknown }> }): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += paging.pageSize) {
    const { data, error } = await build().range(from, from + paging.pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < paging.pageSize) return out;
  }
}

function chunks<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += paging.idChunk) out.push(list.slice(i, i + paging.idChunk));
  return out;
}

export interface Campaign {
  pageId: string;
  title: string;
  pageStatus: "draft" | "published" | "closed";
  total: number;
  counts: Record<RegistrationStatus, number>;
}

export async function listCampaigns(): Promise<Campaign[]> {
  const admin = createAdminSupabase();
  const data = await fetchAll(() =>
    admin
      .from("landing_registrations")
      .select("id, page_id, status, created_at")
      .in("row_type", HEAD_ROW_TYPES)
      .eq("is_test", false)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true }),
  );
  const byPage = new Map<string, Campaign>();
  for (const r of data) {
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
  const pages: { id: string; title: string; status: string }[] = [];
  for (const part of chunks(Array.from(byPage.keys()))) {
    const { data: got, error } = await admin.from("landing_pages").select("id, title, status").in("id", part);
    if (error) throw error;
    pages.push(...(got ?? []));
  }
  for (const p of pages) {
    const c = byPage.get(p.id);
    if (!c) continue;
    c.title = p.title;
    c.pageStatus = p.status === "published" || p.status === "closed" ? p.status : "draft";
  }
  return Array.from(byPage.values()); // Map keeps first-seen order: newest registration first
}

export async function listCampaignFilterOptions(pageId: string): Promise<{ regions: string[]; optionLabels: string[] }> {
  const data = await fetchAll(() =>
    createAdminSupabase()
      .from("landing_registrations")
      .select("id, region, option_label")
      .eq("page_id", pageId)
      .in("row_type", HEAD_ROW_TYPES)
      .eq("is_test", false)
      .order("id", { ascending: true }),
  );
  const regions = new Set<string>();
  const labels = new Set<string>();
  for (const r of data) {
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
    heads = [];
    for (const part of chunks(ids)) {
      heads.push(...await fetchAll(() =>
        admin
          .from("landing_registrations")
          .select("*")
          .in("id", part)
          .eq("page_id", input.pageId)
          .in("row_type", HEAD_ROW_TYPES)
          .eq("is_test", false)
          .order("created_at", { ascending: false })
          .order("id", { ascending: true }),
      ));
    }
    const found = new Set(heads.map((h) => str(h.id)));
    if (ids.some((id) => !found.has(id))) throw new Error("A selected registration is not on this campaign");
  } else {
    const f = input.filters ?? {};
    heads = await fetchAll(() => {
      let query = applyHeadFilters(
        admin.from("landing_registrations").select("*"),
        { kind: "all" },
        { ...f, pageId: input.pageId },
      );
      if (f.status && f.status !== "all") query = query.eq("status", f.status);
      return query.order("created_at", { ascending: false }).order("id", { ascending: true });
    });
  }
  if (heads.length === 0) return [];

  const members: Row[] = [];
  for (const part of chunks(heads.map((h) => str(h.id)))) {
    members.push(...await fetchAll(() =>
      admin
        .from("landing_registrations")
        .select("*")
        .in("lead_registration_id", part)
        .eq("is_test", false)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
    ));
  }
  const byLead = new Map<string, Row[]>();
  for (const m of members) {
    const k = str(m.lead_registration_id);
    const list = byLead.get(k);
    if (list) list.push(m);
    else byLead.set(k, [m]);
  }

  const out: Candidate[] = [];
  for (const h of heads) {
    const lead = { leadId: str(h.id), refId: str(h.ref_id), status: str(h.status) as RegistrationStatus };
    const mode = str(h.mode) === "live" ? "live" : str(h.mode) === "recorded" ? "recorded" : undefined;
    const optionLabel = str(h.option_label);
    out.push({ registrationId: lead.leadId, leadId: lead.leadId, isMember: false, name: str(h.name), email: str(h.email), phone: str(h.whatsapp), refId: lead.refId, status: lead.status, mode, optionLabel });
    for (const m of byLead.get(lead.leadId) ?? []) {
      out.push({ registrationId: str(m.id), leadId: lead.leadId, isMember: true, name: str(m.name), email: str(m.email), phone: str(m.whatsapp), refId: lead.refId, status: lead.status, mode, optionLabel });
    }
  }
  return out;
}
