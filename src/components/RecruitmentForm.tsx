"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, ChevronRight, ChevronLeft, Send, FileText, Camera } from "lucide-react";

const MENTOR_SCRIPT_URL = process.env.NEXT_PUBLIC_MENTOR_SCRIPT_URL;

const STEPS = [
  { number: 1, title: "Basic Information" },
  { number: 2, title: "Professional Background" },
  { number: 3, title: "Role Selection" },
  { number: 4, title: "Short Descriptive Responses" },
  { number: 5, title: "Supporting Documents" },
];

const ROLES = [
  {
    id: "mentor",
    label: "Mentor & Consultant",
    desc: "Providing mentorship & consultation through 1-on-1 online sessions",
  },
  {
    id: "instructor",
    label: "Instructor",
    desc: "Conducting courses, workshops, seminars, or webinars",
  },
];

interface FormData {
  fullName: string;
  email: string;
  phone: string;
  country: string;
  profession: string;
  position: string;
  expertise: string;
  organization: string;
  years: string;
  linkedin: string;
  roles: string[];
  whyJoin: string;
  valueProvide: string;
}

const empty: FormData = {
  fullName: "", email: "", phone: "", country: "",
  profession: "", position: "", expertise: "", organization: "", years: "", linkedin: "",
  roles: [],
  whyJoin: "", valueProvide: "",
};

/* ── shared styles ── */
const inputCls = `
  w-full px-4 py-3 rounded-lg border border-gray-200
  font-poppins text-[15px] text-gray-900 placeholder-gray-400
  bg-white outline-none transition-all duration-200
  focus:border-[#1A4D2E] focus:ring-2 focus:ring-[#1A4D2E]/10
`.replace(/\s+/g, " ").trim();

const labelCls = "block font-poppins text-[13px] font-semibold text-gray-700 mb-1.5";

function Field({
  label, required, children,
}: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label className={labelCls}>
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function SectionHeader({ number, title }: { number: number; title: string }) {
  return (
    <div
      className="flex items-center gap-4 px-6 py-4 mb-6 -mx-6 rounded-t-2xl"
      style={{ background: "rgba(26,77,46,0.06)", borderLeft: "4px solid #1A4D2E" }}
    >
      <div
        className="flex-shrink-0 flex items-center justify-center rounded-full font-montserrat font-black text-white text-sm"
        style={{ width: 32, height: 32, background: "#1A4D2E", fontSize: "13px" }}
      >
        {number}
      </div>
      <h3
        className="font-montserrat font-bold"
        style={{ fontSize: "17px", color: "#1A4D2E" }}
      >
        {title}
      </h3>
    </div>
  );
}

/* ── Step Progress Bar ── */
function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1 mb-8">
      {STEPS.map((s, i) => {
        const done = current > s.number;
        const active = current === s.number;
        return (
          <div key={s.number} className="flex items-center flex-1 gap-1">
            <div className="flex flex-col items-center gap-1 flex-1">
              <div
                className="w-full h-1.5 rounded-full transition-all duration-500"
                style={{
                  background: done
                    ? "#1A4D2E"
                    : active
                      ? "#C9A84C"
                      : "rgba(26,77,46,0.12)",
                }}
              />
              <span
                className="font-poppins hidden md:block text-center"
                style={{
                  fontSize: "10px",
                  fontWeight: active ? 700 : 500,
                  color: active ? "#1A4D2E" : done ? "#1A4D2E" : "#9CA3AF",
                  letterSpacing: "0.04em",
                  lineHeight: "1.2",
                  maxWidth: "100%",
                }}
              >
                {s.title}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ width: 6, flexShrink: 0 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function RecruitmentForm() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(empty);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [direction, setDirection] = useState<1 | -1>(1);
  const cvRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  function set(field: keyof FormData, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function toggleRole(id: string) {
    setForm(prev => ({
      ...prev,
      roles: prev.roles.includes(id)
        ? prev.roles.filter(r => r !== id)
        : [...prev.roles, id],
    }));
  }

  function canAdvance(): boolean {
    if (step === 1) return !!(form.fullName && form.email && form.phone && form.country);
    if (step === 2) return !!(form.profession && form.position && form.expertise && form.organization && form.years);
    if (step === 3) return form.roles.length > 0;
    if (step === 4) return true;
    if (step === 5) return !!(cvFile && photos.length > 0);
    return true;
  }

  function next() {
    if (!canAdvance()) return;
    setDirection(1);
    setStep(s => Math.min(s + 1, STEPS.length));
  }

  function back() {
    setDirection(-1);
    setStep(s => Math.max(s - 1, 1));
  }

  async function toBase64(file: File): Promise<string> {
    return new Promise(resolve => {
      const r = new FileReader();
      r.onload = () => resolve((r.result as string).split(",")[1] ?? "");
      r.readAsDataURL(file);
    });
  }

  async function handleSubmit() {
    // Rate limiting: prevent submissions within 30 seconds
    const now = Date.now();
    if (now - lastSubmitRef.current < 30_000) {
      setError("Please wait before submitting again.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (MENTOR_SCRIPT_URL) {
        const cvBase64 = cvFile ? await toBase64(cvFile) : "";
        const encodedPhotos = await Promise.all(
          photos.map(async p => ({ name: p.name, base64: await toBase64(p) }))
        );
        await fetch(MENTOR_SCRIPT_URL, {
          method: "POST",
          body: JSON.stringify({
            fullName: form.fullName,
            email: form.email,
            phone: form.phone,
            country: form.country,
            profession: form.profession,
            position: form.position,
            expertise: form.expertise,
            organization: form.organization,
            years: form.years,
            linkedin: form.linkedin,
            roles: form.roles.join(", "),
            whyJoin: form.whyJoin,
            valueProvide: form.valueProvide,
            cvBase64,
            cvFileName: cvFile?.name ?? "",
            photos: encodedPhotos,
          }),
        });
      }
      setSubmitted(true);
      // Record submission timestamp
      lastSubmitRef.current = Date.now();
    } catch {
      setError("Something went wrong. Please try again or reach out via WhatsApp.");
    } finally {
      setLoading(false);
    }
  }

  /* ── slide variants ── */
  const variants = {
    enter: (d: number) => ({ x: d * 48, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d * -48, opacity: 0 }),
  };

  return (
    <section
      id="apply"
      className="diamond-texture"
      style={{ background: "#1A4D2E", padding: "100px 0" }}
      aria-labelledby="apply-heading"
    >
      <div className="container-max px-6 md:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">

          {/* ── LEFT: Copy ── */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.65 }}
          >
            <span className="section-label" style={{ color: "#C9A84C", borderColor: "rgba(201,168,76,0.4)" }}>
              For Professionals
            </span>
            <h2 id="apply-heading" className="font-montserrat mb-4" style={{ fontWeight: 800, lineHeight: 1.15 }}>
              <span className="block" style={{ fontSize: "clamp(30px, 4.5vw, 48px)", color: "#FFFFFF" }}>Are You an Expert?</span>
              <span className="block" style={{ fontSize: "clamp(30px, 4.5vw, 48px)", color: "#C9A84C" }}>Join Our Mentor</span>
              <span className="block" style={{ fontSize: "clamp(30px, 4.5vw, 48px)", color: "#C9A84C" }}>Network.</span>
            </h2>
            <div className="gold-divider-left mb-6" />
            <p className="font-poppins mb-8" style={{ fontSize: "16px", lineHeight: 1.7, color: "rgba(255,255,255,0.78)", maxWidth: "420px" }}>
              We curate a highly selective group of mentors to guide the next generation of Pakistani professionals. If you have a proven track record and a passion for teaching, we invite you to apply.
            </p>
            <ul className="space-y-4">
              {[
                "Set your own schedule and session rates",
                "Access a vetted pool of highly motivated mentees",
                "Join an exclusive community of top-tier professionals",
                "Earn while sharing your expertise",
              ].map(item => (
                <li key={item} className="flex items-start gap-3">
                  <div className="flex-shrink-0 flex items-center justify-center rounded-full mt-0.5" style={{ width: 20, height: 20, background: "#C9A84C" }} aria-hidden="true">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" /></svg>
                  </div>
                  <span className="font-poppins" style={{ fontSize: "15px", color: "rgba(255,255,255,0.8)" }}>{item}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* ── RIGHT: Multi-step Form ── */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.65 }}
          >
            <AnimatePresence mode="wait">
              {submitted ? (

                /* ── Success state ── */
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  style={{ background: "#fff", borderRadius: 20, padding: "48px 40px", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 14 }}
                    style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(201,168,76,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}
                  >
                    <CheckCircle size={36} style={{ color: "#C9A84C" }} strokeWidth={1.5} />
                  </motion.div>
                  <h3 className="font-montserrat mb-2" style={{ fontWeight: 700, fontSize: "20px", color: "#1A4D2E" }}>Application Submitted!</h3>
                  <p className="font-poppins" style={{ fontSize: "14px", color: "#6B7280" }}>Our team will review your profile and reach out within 48 hours.</p>
                </motion.div>

              ) : (

                /* ── Form card ── */
                <div style={{ background: "#fff", borderRadius: 20, padding: "36px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>

                  <StepBar current={step} />

                  <div style={{ overflow: "hidden" }}>
                    <AnimatePresence mode="wait" custom={direction}>
                      <motion.div
                        key={step}
                        custom={direction}
                        variants={variants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                      >

                        {/* ────── STEP 1 ────── */}
                        {step === 1 && (
                          <div>
                            <SectionHeader number={1} title="Basic Information" />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                              <Field label="Full Name" required>
                                <input className={inputCls} type="text" placeholder="Dr. Jane Smith"
                                  value={form.fullName} onChange={e => set("fullName", e.target.value)} />
                              </Field>
                              <Field label="Email Address" required>
                                <input className={inputCls} type="email" placeholder="you@example.com"
                                  value={form.email} onChange={e => set("email", e.target.value)} />
                              </Field>
                              <Field label="WhatsApp / Contact Number" required>
                                <input className={inputCls} type="tel" placeholder="+92 300 0000000"
                                  value={form.phone} onChange={e => set("phone", e.target.value)} />
                              </Field>
                              <Field label="Country of Residence" required>
                                <input className={inputCls} type="text" placeholder="Pakistan"
                                  value={form.country} onChange={e => set("country", e.target.value)} />
                              </Field>
                            </div>
                          </div>
                        )}

                        {/* ────── STEP 2 ────── */}
                        {step === 2 && (
                          <div>
                            <SectionHeader number={2} title="Professional Background" />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                              <Field label="Current Profession" required>
                                <input className={inputCls} type="text" placeholder="e.g., Pharmacist, Doctor, Nurse"
                                  value={form.profession} onChange={e => set("profession", e.target.value)} />
                              </Field>
                              <Field label="Current Position / Role" required>
                                <input className={inputCls} type="text" placeholder="e.g., Clinical Pharmacist"
                                  value={form.position} onChange={e => set("position", e.target.value)} />
                              </Field>
                            </div>
                            <div className="mt-5">
                              <Field label="Area of Expertise" required>
                                <input className={inputCls} type="text" placeholder="e.g., Pharmacology, Research (max 3)"
                                  value={form.expertise} onChange={e => set("expertise", e.target.value)} />
                                <p className="font-poppins mt-1.5" style={{ fontSize: "11px", color: "#9CA3AF" }}>List up to 3 areas, separated by commas</p>
                              </Field>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
                              <Field label="Organization / Hospital / University" required>
                                <input className={inputCls} type="text" placeholder="Institution name"
                                  value={form.organization} onChange={e => set("organization", e.target.value)} />
                              </Field>
                              <Field label="Years of Experience" required>
                                <input className={inputCls} type="text" placeholder="e.g., 3 years, 5+ years"
                                  value={form.years} onChange={e => set("years", e.target.value)} />
                              </Field>
                            </div>
                            <div className="mt-5">
                              <Field label="LinkedIn Profile URL">
                                <input className={inputCls} type="url" placeholder="https://linkedin.com/in/yourprofile"
                                  value={form.linkedin} onChange={e => set("linkedin", e.target.value)} />
                                <p className="font-poppins mt-1.5" style={{ fontSize: "11px", color: "#9CA3AF" }}>Optional but recommended</p>
                              </Field>
                            </div>
                          </div>
                        )}

                        {/* ────── STEP 3 ────── */}
                        {step === 3 && (
                          <div>
                            <SectionHeader number={3} title="Role Selection" />
                            <p className="font-poppins mb-4" style={{ fontSize: "13px", color: "#6B7280" }}>
                              Select all that apply <span className="text-red-400">*</span>
                            </p>
                            <div className="space-y-3">
                              {ROLES.map(role => {
                                const checked = form.roles.includes(role.id);
                                return (
                                  <button
                                    key={role.id}
                                    type="button"
                                    onClick={() => toggleRole(role.id)}
                                    className="w-full text-left transition-all duration-200 cursor-pointer"
                                    style={{
                                      border: checked ? "2px solid #1A4D2E" : "1.5px solid #E5E7EB",
                                      borderRadius: 10,
                                      padding: "16px 18px",
                                      background: checked ? "rgba(26,77,46,0.04)" : "#fff",
                                    }}
                                  >
                                    <div className="flex items-start gap-3">
                                      <div
                                        className="flex-shrink-0 mt-0.5"
                                        style={{
                                          width: 20, height: 20, borderRadius: 5,
                                          border: checked ? "none" : "2px solid #D1D5DB",
                                          background: checked ? "#1A4D2E" : "transparent",
                                          display: "flex", alignItems: "center", justifyContent: "center",
                                          transition: "all 0.2s",
                                        }}
                                      >
                                        {checked && (
                                          <svg width="11" height="11" viewBox="0 0 24 24" fill="white">
                                            <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
                                          </svg>
                                        )}
                                      </div>
                                      <div>
                                        <p className="font-poppins font-semibold" style={{ fontSize: "14px", color: "#111827" }}>
                                          {role.label}
                                        </p>
                                        <p className="font-poppins mt-0.5" style={{ fontSize: "12px", color: "#6B7280" }}>
                                          {role.desc}
                                        </p>
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* ────── STEP 4 ────── */}
                        {step === 4 && (
                          <div>
                            <SectionHeader number={4} title="Short Descriptive Responses" />
                            <div className="space-y-6">
                              <Field label="Why do you want to join PZ Academy?">
                                <span className="font-poppins text-xs text-gray-400 block mb-1.5">(Optional)</span>
                                <textarea
                                  className={inputCls + " resize-none"}
                                  rows={4}
                                  placeholder="Answer in 3–5 lines..."
                                  value={form.whyJoin}
                                  onChange={e => set("whyJoin", e.target.value)}
                                />
                              </Field>
                              <Field label="What value can you provide to students?">
                                <span className="font-poppins text-xs text-gray-400 block mb-1.5">(Optional)</span>
                                <textarea
                                  className={inputCls + " resize-none"}
                                  rows={4}
                                  placeholder="Answer in 3–5 lines..."
                                  value={form.valueProvide}
                                  onChange={e => set("valueProvide", e.target.value)}
                                />
                              </Field>
                            </div>
                          </div>
                        )}

                        {/* ────── STEP 5 ────── */}
                        {step === 5 && (
                          <div>
                            <SectionHeader number={5} title="Supporting Documents" />
                            <div className="space-y-6">

                              {/* CV Upload */}
                              <Field label="Upload CV / Resume" required>
                                <button
                                  type="button"
                                  onClick={() => cvRef.current?.click()}
                                  className="w-full cursor-pointer transition-all duration-200"
                                  style={{
                                    border: cvFile ? "2px solid #1A4D2E" : "2px dashed #C9A84C",
                                    borderRadius: 10,
                                    padding: "20px",
                                    background: cvFile ? "rgba(26,77,46,0.04)" : "transparent",
                                    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                                  }}
                                >
                                  <FileText size={28} style={{ color: cvFile ? "#1A4D2E" : "#C9A84C" }} strokeWidth={1.5} />
                                  <p className="font-poppins font-semibold" style={{ fontSize: "13px", color: "#1A4D2E" }}>
                                    {cvFile ? cvFile.name : <><strong>Click to upload</strong> your CV / Resume</>}
                                  </p>
                                  <p className="font-poppins" style={{ fontSize: "11px", color: "#9CA3AF" }}>PDF, DOC, DOCX accepted</p>
                                </button>
                                <input ref={cvRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
                                  onChange={e => setCvFile(e.target.files?.[0] ?? null)} />
                              </Field>

                              {/* Photos Upload */}
                              <Field label="Upload Professional Photograph (1)" required>
                                <button
                                  type="button"
                                  onClick={() => photoRef.current?.click()}
                                  className="w-full cursor-pointer transition-all duration-200"
                                  style={{
                                    border: photos.length ? "2px solid #1A4D2E" : "2px dashed #C9A84C",
                                    borderRadius: 10,
                                    padding: "20px",
                                    background: photos.length ? "rgba(26,77,46,0.04)" : "transparent",
                                    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                                  }}
                                >
                                  <Camera size={28} style={{ color: photos.length ? "#1A4D2E" : "#C9A84C" }} strokeWidth={1.5} />
                                  <p className="font-poppins font-semibold" style={{ fontSize: "13px", color: "#1A4D2E" }}>
                                     {photos.length
                                       ? photos[0].name
                                       : <><strong>Click to upload</strong> your photo</>}
                                  </p>
                                  <p className="font-poppins" style={{ fontSize: "11px", color: "#9CA3AF" }}>JPG, PNG, WEBP — formal or semi-formal appearance</p>
                                </button>
                                <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                                   onChange={e => setPhotos(e.target.files ? [e.target.files[0]] : [])} />
                              </Field>

                              <p className="font-poppins text-center" style={{ fontSize: "12px", color: "#9CA3AF" }}>
                                All applications are carefully reviewed. We will be in touch via your provided email or WhatsApp.
                              </p>
                            </div>
                          </div>
                        )}

                      </motion.div>
                    </AnimatePresence>
                  </div>

                  {/* ── Navigation buttons ── */}
                  {error && (
                    <p className="font-poppins mt-4 text-center" style={{ fontSize: "13px", color: "#ef4444" }}>{error}</p>
                  )}

                  <div className={`flex mt-8 gap-3 ${step === 1 ? "justify-end" : "justify-between"}`}>
                    {step > 1 && (
                      <motion.button
                        type="button"
                        onClick={back}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        className="flex items-center gap-2 font-montserrat font-bold cursor-pointer transition-colors"
                        style={{
                          padding: "13px 24px", borderRadius: 6,
                          border: "2px solid rgba(26,77,46,0.2)",
                          color: "#1A4D2E", background: "transparent",
                          fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase",
                        }}
                      >
                        <ChevronLeft size={14} />
                        Back
                      </motion.button>
                    )}

                    {step < STEPS.length ? (
                      <motion.button
                        type="button"
                        onClick={next}
                        disabled={!canAdvance()}
                        whileHover={canAdvance() ? { scale: 1.02 } : {}}
                        whileTap={canAdvance() ? { scale: 0.97 } : {}}
                        className="flex items-center gap-2 font-montserrat font-bold cursor-pointer"
                        style={{
                          padding: "13px 28px", borderRadius: 6,
                          background: canAdvance() ? "#1A4D2E" : "#D1D5DB",
                          color: canAdvance() ? "#C9A84C" : "#9CA3AF",
                          fontSize: "12px", letterSpacing: "0.10em", textTransform: "uppercase",
                          cursor: canAdvance() ? "pointer" : "not-allowed",
                          transition: "all 0.2s",
                          boxShadow: canAdvance() ? "0 4px 16px rgba(26,77,46,0.25)" : "none",
                        }}
                      >
                        Continue
                        <ChevronRight size={14} />
                      </motion.button>
                    ) : (
                      <motion.button
                        type="button"
                        onClick={handleSubmit}
                        disabled={loading || !canAdvance()}
                        whileHover={!loading ? { scale: 1.02 } : {}}
                        whileTap={!loading ? { scale: 0.97 } : {}}
                        className="flex items-center gap-2 font-montserrat font-bold cursor-pointer"
                        style={{
                          padding: "13px 28px", borderRadius: 6,
                          background: loading ? "#D1D5DB" : "#1A4D2E",
                          color: loading ? "#9CA3AF" : "#C9A84C",
                          fontSize: "12px", letterSpacing: "0.10em", textTransform: "uppercase",
                          cursor: loading ? "not-allowed" : "pointer",
                          opacity: loading ? 0.8 : 1,
                          transition: "all 0.2s",
                          boxShadow: loading ? "none" : "0 4px 16px rgba(26,77,46,0.25)",
                        }}
                      >
                        {loading ? (
                          <>
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                              style={{ width: 14, height: 14, border: "2px solid rgba(26,77,46,0.2)", borderTopColor: "#1A4D2E", borderRadius: "50%" }}
                            />
                            Submitting...
                          </>
                        ) : (
                          <>
                            <Send size={13} />
                            Submit Application
                          </>
                        )}
                      </motion.button>
                    )}
                  </div>

                  {/* Step counter */}
                  <p className="font-poppins text-center mt-4" style={{ fontSize: "11px", color: "#9CA3AF" }}>
                    Step {step} of {STEPS.length}
                  </p>

                </div>
              )}
            </AnimatePresence>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
