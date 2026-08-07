import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { sendMentorshipEmail } from "@/lib/emails/mentorship";
import { pushMentorshipStatusToSheet, pushMentorshipDelete } from "@/lib/gas/mentorship-sync-client";

export type MentorApplicationStatus = Database["public"]["Enums"]["mentor_application_status"];

export interface MentorApplicationRow {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  country: string | null;
  profession: string | null;
  position: string | null;
  expertise: string | null;
  organization: string | null;
  yearsExperience: string | null;
  linkedinUrl: string | null;
  roles: string | null;
  whyJoin: string | null;
  valueProvide: string | null;
  cvUrl: string | null;
  photoUrls: string[];
  status: MentorApplicationStatus;
  rejectionReason: string | null;
  createdAt: string;
}

interface RawApplicationRow {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  country: string | null;
  profession: string | null;
  position: string | null;
  expertise: string | null;
  organization: string | null;
  years_experience: string | null;
  linkedin_url: string | null;
  roles: string | null;
  why_join: string | null;
  value_provide: string | null;
  cv_url: string | null;
  photo_urls: string[];
  status: MentorApplicationStatus;
  rejection_reason: string | null;
  created_at: string;
}

function toRow(row: RawApplicationRow): MentorApplicationRow {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    country: row.country,
    profession: row.profession,
    position: row.position,
    expertise: row.expertise,
    organization: row.organization,
    yearsExperience: row.years_experience,
    linkedinUrl: row.linkedin_url,
    roles: row.roles,
    whyJoin: row.why_join,
    valueProvide: row.value_provide,
    cvUrl: row.cv_url,
    photoUrls: row.photo_urls,
    status: row.status,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
  };
}

const SELECT =
  "id, full_name, email, phone, country, profession, position, expertise, organization, years_experience, linkedin_url, roles, why_join, value_provide, cv_url, photo_urls, status, rejection_reason, created_at";

export async function listApplicationsForReview(): Promise<MentorApplicationRow[]> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("mentor_applications").select(SELECT).order("created_at", { ascending: false });
  return (data ?? []).map((row) => toRow(row as RawApplicationRow));
}

/** The logged-in user's own most recent application, for /dashboard/mentor-application. */
export async function getMyApplication(applicantId: string): Promise<MentorApplicationRow | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("mentor_applications")
    .select(SELECT)
    .eq("applicant_id", applicantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toRow(data as RawApplicationRow) : null;
}

export interface InsertApplicationInput {
  applicantId: string | null;
  fullName: string;
  email: string;
  phone: string;
  country?: string | null;
  profession?: string | null;
  position?: string | null;
  expertise?: string | null;
  organization?: string | null;
  yearsExperience?: string | null;
  linkedinUrl?: string | null;
  roles?: string | null;
  whyJoin?: string | null;
  valueProvide?: string | null;
  cvUrl?: string | null;
  photoUrls?: string[];
}

export async function insertApplication(input: InsertApplicationInput): Promise<{ id: string }> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("mentor_applications")
    .insert({
      applicant_id: input.applicantId,
      full_name: input.fullName,
      email: input.email,
      phone: input.phone,
      country: input.country ?? null,
      profession: input.profession ?? null,
      position: input.position ?? null,
      expertise: input.expertise ?? null,
      organization: input.organization ?? null,
      years_experience: input.yearsExperience ?? null,
      linkedin_url: input.linkedinUrl ?? null,
      roles: input.roles ?? null,
      why_join: input.whyJoin ?? null,
      value_provide: input.valueProvide ?? null,
      cv_url: input.cvUrl ?? null,
      photo_urls: input.photoUrls ?? [],
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Could not insert application");
  return { id: data.id };
}

export type ApplyApplicationStatusResult =
  | { ok: true; id: string; status: MentorApplicationStatus }
  | { ok: false; reason: "not-found" | "already-in-status" | "db-error" };

export async function applyApplicationStatus(params: {
  applicationId: string;
  targetStatus: MentorApplicationStatus;
  rejectionReason?: string | null;
  emailKind?: "applicationApproved" | "applicationRejected" | null;
}): Promise<ApplyApplicationStatusResult> {
  const admin = createAdminSupabase();
  const { data: existing } = await admin
    .from("mentor_applications")
    .select("id, status, full_name, email")
    .eq("id", params.applicationId)
    .maybeSingle();

  if (!existing) return { ok: false, reason: "not-found" };
  if (existing.status === params.targetStatus) return { ok: false, reason: "already-in-status" };

  const { data: updated, error } = await admin
    .from("mentor_applications")
    .update({
      status: params.targetStatus,
      rejection_reason: params.targetStatus === "rejected" ? (params.rejectionReason ?? null) : null,
      status_changed_at: new Date().toISOString(),
    })
    .eq("id", params.applicationId)
    .select("id, status")
    .single();

  if (error || !updated) return { ok: false, reason: "db-error" };

  if (params.emailKind) {
    await sendMentorshipEmail(params.emailKind, existing.email, {
      fullName: existing.full_name,
      rejectionReason: params.rejectionReason ?? null,
    });
  }

  await pushMentorshipStatusToSheet({ sheetKind: "application", email: existing.email, status: updated.status });

  return { ok: true, id: updated.id, status: updated.status };
}

export type DeleteApplicationResult =
  | { ok: true; sheetDeleted: boolean }
  | { ok: false; reason: "not-found" | "db-error" };

/** Mirrors deleteBooking in mentorship-bookings.ts — see its comment. */
export async function deleteApplication(applicationId: string): Promise<DeleteApplicationResult> {
  const admin = createAdminSupabase();
  const { data: existing } = await admin
    .from("mentor_applications")
    .select("id, email, created_at")
    .eq("id", applicationId)
    .maybeSingle();

  if (!existing) return { ok: false, reason: "not-found" };

  const { error } = await admin.from("mentor_applications").delete().eq("id", applicationId);
  if (error) return { ok: false, reason: "db-error" };

  const sheetDeleted = await pushMentorshipDelete({
    sheetKind: "application",
    email: existing.email,
    timestamp: existing.created_at,
  });

  return { ok: true, sheetDeleted };
}
