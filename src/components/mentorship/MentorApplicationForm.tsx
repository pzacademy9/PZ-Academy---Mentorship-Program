"use client";

import { useRef, useState, type ReactNode } from "react";
import { Camera, CheckCircle2, ChevronLeft, ChevronRight, FileText, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { compressImage } from "@/lib/landing/compress-image";
import { APPLY_ROLES, APPLY_STEPS, CV_ACCEPT, PHOTO_ACCEPT, cvProblem, photoProblem } from "@/lib/mentorship/apply-files";


type Fields = {
  fullName: string; email: string; phone: string; country: string;
  profession: string; position: string; expertise: string; organization: string; years: string; linkedin: string;
  roles: string[]; whyJoin: string; valueProvide: string;
};
const EMPTY: Fields = {
  fullName: "", email: "", phone: "", country: "",
  profession: "", position: "", expertise: "", organization: "", years: "", linkedin: "",
  roles: [], whyJoin: "", valueProvide: "",
};

const INPUT =
  "w-full min-h-11 rounded-xl border border-pz-border bg-pz-surface-container-lowest px-4 py-2.5 font-poppins text-base text-pz-ink placeholder:text-pz-outline focus:border-pz-solid-mid focus:outline-none focus:ring-2 focus:ring-pz-bright/30 md:text-[15px]";

function Field({ id, label, required, hint, children }: { id: string; label: string; required?: boolean; hint?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block font-montserrat text-[13px] font-bold text-pz-deep">
        {label}
        {required ? <span className="ml-0.5 text-pz-danger" aria-hidden="true">*</span> : <span className="ml-1 font-poppins text-xs font-normal text-pz-muted">(optional)</span>}
      </label>
      {children}
      {hint && <p className="mt-1.5 font-poppins text-xs text-pz-muted">{hint}</p>}
    </div>
  );
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/**
 * The mentor application on /mentorship/apply: five short steps, the same
 * fields and the same /api/mentorship/applications request as before, so the
 * admin Applications tab, the emails and the team Sheet keep working.
 */
export function MentorApplicationForm() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<Fields>(EMPTY);
  const [cv, setCv] = useState<File | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const cvRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const top = useRef<HTMLDivElement>(null);

  const set = (k: Exclude<keyof Fields, "roles">, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const toggleRole = (id: string) =>
    setForm((f) => ({ ...f, roles: f.roles.includes(id) ? f.roles.filter((r) => r !== id) : [...f.roles, id] }));

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  function ready(s = step): boolean {
    if (s === 1) return !!(form.fullName.trim() && emailOk && form.phone.trim() && form.country.trim());
    if (s === 2) return !!(form.profession.trim() && form.position.trim() && form.expertise.trim() && form.organization.trim() && form.years.trim());
    if (s === 3) return form.roles.length > 0;
    if (s === 5) return !!(cv && photo);
    return true;
  }
  const missing = step === 1 && form.email.trim() && !emailOk ? "Please check your email address." : "Please fill in the boxes marked with *.";

  function go(to: number) {
    setError("");
    setStep(to);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function pickCv(file: File | undefined) {
    if (cvRef.current) cvRef.current.value = "";
    if (!file) return;
    const problem = cvProblem(file);
    setFileError(problem ?? "");
    setCv(problem ? null : file);
  }

  async function pickPhoto(file: File | undefined) {
    if (photoRef.current) photoRef.current.value = "";
    if (!file) return;
    const small = await compressImage(file);
    const problem = photoProblem(small);
    setFileError(problem ?? "");
    setPhoto(problem ? null : small);
  }

  const { run: submit, pending } = useAsyncAction(async () => {
    if (!ready(5) || !cv || !photo) return;
    setError("");
    try {
      const res = await fetch("/api/mentorship/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          country: form.country.trim(),
          profession: form.profession.trim(),
          position: form.position.trim(),
          expertise: form.expertise.trim(),
          organization: form.organization.trim(),
          years: form.years.trim(),
          linkedin: form.linkedin.trim(),
          roles: form.roles.join(", "),
          whyJoin: form.whyJoin.trim(),
          valueProvide: form.valueProvide.trim(),
          cvBase64: await toBase64(cv),
          cvFileName: cv.name,
          photos: [{ name: photo.name, base64: await toBase64(photo) }],
        }),
      });
      if (res.status === 429) {
        setError("You have just sent an application. Please wait a few minutes, or contact us on WhatsApp.");
        return;
      }
      if (!res.ok) {
        setError("Your application could not be sent. Please try again, or contact us on WhatsApp.");
        return;
      }
      setSent(true);
      top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      setError("Your application could not be sent. Check your connection and try again.");
    }
  });

  if (sent) {
    return (
      <div ref={top} role="status" className="scroll-mt-28 rounded-[28px] border border-pz-border bg-pz-surface-container-lowest p-8 text-center shadow-[0_8px_30px_rgba(15,61,34,0.08)] sm:p-12">
        <CheckCircle2 className="mx-auto h-14 w-14 text-pz-mid" strokeWidth={1.5} aria-hidden="true" />
        <h3 className="mt-4 font-montserrat text-2xl font-extrabold text-pz-deep">Application sent</h3>
        <p className="mx-auto mt-2 max-w-md font-poppins text-[15px] leading-relaxed text-pz-muted">
          Thank you, {form.fullName.trim().split(/\s+/)[0]}. Our team will review your profile and reach out within 48 hours, by email or WhatsApp.
        </p>
      </div>
    );
  }

  const fileBox = (picked: boolean) =>
    `flex w-full min-h-11 flex-col items-center gap-2 rounded-2xl border-2 p-5 text-center transition-colors ${picked ? "border-pz-solid-mid bg-pz-web-surface-low" : "border-dashed border-pz-gold/70 hover:bg-pz-web-surface-low"}`;

  return (
    <div ref={top} className="scroll-mt-28 rounded-[28px] border border-pz-border bg-pz-surface-container-lowest p-5 shadow-[0_8px_30px_rgba(15,61,34,0.08)] sm:p-8">
      <ol aria-label="Application steps" className="mb-8 grid grid-cols-5 gap-1.5">
        {APPLY_STEPS.map((title, i) => {
          const n = i + 1;
          return (
            <li key={title} aria-current={n === step ? "step" : undefined} className="min-w-0">
              <span className={`block h-1.5 rounded-full ${n < step ? "bg-pz-solid-mid" : n === step ? "bg-pz-gold" : "bg-pz-web-surface-high"}`} />
              <span className={`mt-1.5 hidden break-words font-poppins text-[11px] leading-tight md:block ${n === step ? "font-bold text-pz-deep" : "text-pz-muted"}`}>{title}</span>
            </li>
          );
        })}
      </ol>

      <h3 className="mb-6 font-montserrat text-xl font-extrabold text-pz-deep">
        <span className="mr-2 font-poppins text-sm font-semibold text-pz-muted">Step {step} of {APPLY_STEPS.length}</span>
        <span className="block sm:inline">{APPLY_STEPS[step - 1]}</span>
      </h3>

      {step === 1 && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field id="ap-name" label="Full name" required><input id="ap-name" className={INPUT} autoComplete="name" placeholder="e.g. Dr. Ayesha Siddiqui" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} maxLength={200} /></Field>
          <Field id="ap-email" label="Email address" required><input id="ap-email" type="email" className={INPUT} autoComplete="email" placeholder="you@example.com" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field id="ap-phone" label="WhatsApp number" required><input id="ap-phone" type="tel" className={INPUT} autoComplete="tel" placeholder="+92 300 0000000" value={form.phone} onChange={(e) => set("phone", e.target.value)} maxLength={40} /></Field>
          <Field id="ap-country" label="Country you live in" required><input id="ap-country" className={INPUT} autoComplete="country-name" placeholder="Pakistan" value={form.country} onChange={(e) => set("country", e.target.value)} maxLength={100} /></Field>
        </div>
      )}

      {step === 2 && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field id="ap-prof" label="Profession" required><input id="ap-prof" className={INPUT} placeholder="e.g. Pharmacist, Doctor" value={form.profession} onChange={(e) => set("profession", e.target.value)} maxLength={200} /></Field>
          <Field id="ap-pos" label="Current position" required><input id="ap-pos" className={INPUT} placeholder="e.g. Clinical Pharmacist" value={form.position} onChange={(e) => set("position", e.target.value)} maxLength={200} /></Field>
          <div className="md:col-span-2">
            <Field id="ap-exp" label="Areas of expertise" required hint="Up to 3, separated by commas."><input id="ap-exp" className={INPUT} placeholder="e.g. Oncology, Residency, Research" value={form.expertise} onChange={(e) => set("expertise", e.target.value)} maxLength={300} /></Field>
          </div>
          <Field id="ap-org" label="Hospital, company or university" required><input id="ap-org" className={INPUT} value={form.organization} onChange={(e) => set("organization", e.target.value)} maxLength={200} /></Field>
          <Field id="ap-years" label="Years of experience" required><input id="ap-years" className={INPUT} placeholder="e.g. 5 years" value={form.years} onChange={(e) => set("years", e.target.value)} maxLength={50} /></Field>
          <div className="md:col-span-2">
            <Field id="ap-li" label="LinkedIn profile link" hint="Recommended: it helps our team check your background."><input id="ap-li" type="url" className={INPUT} placeholder="https://linkedin.com/in/yourname" value={form.linkedin} onChange={(e) => set("linkedin", e.target.value)} maxLength={300} /></Field>
          </div>
        </div>
      )}

      {step === 3 && (
        <fieldset>
          <legend className="mb-4 font-poppins text-sm text-pz-muted">How would you like to teach? Choose one or both. <span className="text-pz-danger" aria-hidden="true">*</span></legend>
          <div className="space-y-3">
            {APPLY_ROLES.map((r) => {
              const on = form.roles.includes(r.id);
              return (
                <label key={r.id} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition-colors ${on ? "border-pz-solid-mid bg-pz-web-surface-low" : "border-pz-border hover:bg-pz-web-surface-low"}`}>
                  <input type="checkbox" checked={on} onChange={() => toggleRole(r.id)} className="mt-0.5 h-5 w-5 shrink-0 accent-pz-solid-mid" />
                  <span>
                    <span className="block font-montserrat text-[15px] font-bold text-pz-deep">{r.label}</span>
                    <span className="block font-poppins text-sm text-pz-muted">{r.desc}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {step === 4 && (
        <div className="space-y-5">
          <Field id="ap-why" label="Why do you want to join PZ Academy?"><textarea id="ap-why" rows={4} maxLength={2000} className={`${INPUT} resize-y`} placeholder="3 to 5 lines" value={form.whyJoin} onChange={(e) => set("whyJoin", e.target.value)} /></Field>
          <Field id="ap-value" label="What can you offer students?"><textarea id="ap-value" rows={4} maxLength={2000} className={`${INPUT} resize-y`} placeholder="3 to 5 lines" value={form.valueProvide} onChange={(e) => set("valueProvide", e.target.value)} /></Field>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-5">
          <div>
            <p className="mb-1.5 font-montserrat text-[13px] font-bold text-pz-deep">CV or resume <span className="text-pz-danger" aria-hidden="true">*</span></p>
            <button type="button" onClick={() => cvRef.current?.click()} className={fileBox(!!cv)}>
              <FileText className="h-7 w-7 text-pz-mid" strokeWidth={1.5} aria-hidden="true" />
              <span className="break-all font-poppins text-sm font-semibold text-pz-deep">{cv ? cv.name : "Choose your CV"}</span>
              <span className="font-poppins text-xs text-pz-muted">PDF or Word, under 2 MB</span>
            </button>
            <input ref={cvRef} type="file" accept={CV_ACCEPT} className="sr-only" aria-label="CV or resume file" onChange={(e) => pickCv(e.target.files?.[0])} />
          </div>
          <div>
            <p className="mb-1.5 font-montserrat text-[13px] font-bold text-pz-deep">Professional photo <span className="text-pz-danger" aria-hidden="true">*</span></p>
            <button type="button" onClick={() => photoRef.current?.click()} className={fileBox(!!photo)}>
              <Camera className="h-7 w-7 text-pz-mid" strokeWidth={1.5} aria-hidden="true" />
              <span className="break-all font-poppins text-sm font-semibold text-pz-deep">{photo ? photo.name : "Choose your photo"}</span>
              <span className="font-poppins text-xs text-pz-muted">JPG, PNG or WEBP. Formal or semi-formal. Used on your profile if you are accepted.</span>
            </button>
            <input ref={photoRef} type="file" accept={PHOTO_ACCEPT} className="sr-only" aria-label="Professional photo file" onChange={(e) => pickPhoto(e.target.files?.[0])} />
          </div>
          {fileError && <p role="alert" className="font-poppins text-sm font-semibold text-pz-danger">{fileError}</p>}
        </div>
      )}

      {error && <p role="alert" className="mt-5 font-poppins text-sm font-semibold text-pz-danger">{error}</p>}
      {!ready() && step !== 4 && <p className="mt-5 font-poppins text-xs text-pz-muted">{missing}</p>}

      <div className={`mt-8 flex gap-3 ${step === 1 ? "justify-end" : "justify-between"}`}>
        {step > 1 && (
          <button type="button" onClick={() => go(step - 1)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-pz-border px-5 font-montserrat text-sm font-bold text-pz-deep hover:bg-pz-web-surface-low">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Back
          </button>
        )}
        {step < APPLY_STEPS.length ? (
          <button type="button" disabled={!ready()} onClick={() => go(step + 1)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-pz-solid-deep px-6 font-montserrat text-sm font-bold text-white shadow-md transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100">
            Continue <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <Button
            type="button"
            variant="bare"
            size="bare"
            loading={pending}
            disabled={!ready()}
            onClick={() => submit()}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-pz-bright px-6 font-montserrat text-sm font-bold text-pz-solid-deep shadow-md disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="h-4 w-4" aria-hidden="true" /> {pending ? "Sending…" : "Send application"}
          </Button>
        )}
      </div>
    </div>
  );
}
