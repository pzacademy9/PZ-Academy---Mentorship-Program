"use client";

// Paste your deployed Apps Script URL here after following AppScript_BookingForm.js guide
const BOOKING_SCRIPT_URL = process.env.NEXT_PUBLIC_BOOKING_SCRIPT_URL;

import { useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Info, Copy, CheckCircle, CloudUpload, X,
  MessageCircle, ArrowRight, Shield,
} from "lucide-react";
import { type Mentor, formatPrice } from "@/lib/mentors";
import { whatsappLink } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  package: string;
  notes: string;
  screenshot: File | null;
}

const initial: FormState = {
  fullName: "",
  email: "",
  phone: "",
  package: "",
  notes: "",
  screenshot: null,
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-white/40 hover:text-brand-gold transition-colors cursor-pointer p-1"
      aria-label={`Copy ${text}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={copied ? "check" : "copy"}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {copied ? (
            <CheckCircle size={16} className="text-brand-gold" />
          ) : (
            <Copy size={16} />
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

export default function BookingClient({ mentor }: { mentor: Mentor }) {
  const [form, setForm] = useState<FormState>(initial);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const lastSubmitRef = useRef<number>(0);
  const waMsg = `Hi! I've completed the payment for a session with ${mentor.name} on PZ Academy. Here is my payment screenshot.`;

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleFile(file: File | null) {
    if (!file) return;
    const valid = ["image/jpeg", "image/png", "application/pdf"];
    if (!valid.includes(file.type) || file.size > 5 * 1024 * 1024) return;
    setForm((prev) => ({ ...prev, screenshot: file }));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0] ?? null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    // Rate limiting: prevent submissions within 30 seconds
    const now = Date.now();
    if (now - lastSubmitRef.current < 30_000) {
      alert("Please wait a moment before submitting again.");
      return;
    }

    setLoading(true);

    try {
      if (BOOKING_SCRIPT_URL) {
        let screenshotBase64 = "";
        let screenshotName = "";
        if (form.screenshot) {
          screenshotName = form.screenshot.name;
          screenshotBase64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              resolve(result.split(",")[1] ?? "");
            };
            reader.readAsDataURL(form.screenshot!);
          });
        }

        await fetch(BOOKING_SCRIPT_URL, {
          method: "POST",
          body: JSON.stringify({
            name:             form.fullName,
            email:            form.email,
            phone:            form.phone,
            mentorName:       mentor.name,
            packageName:      form.package,
            goals:            form.notes,
            paymentRef:       screenshotName,
            screenshotBase64: screenshotBase64,
            screenshotName:   screenshotName,
          }),
        });
      }
    } catch {
      // Still redirect — don't block user on network error
    }

    setLoading(false);
    // Update submission timestamp
    lastSubmitRef.current = Date.now();
    router.push("/thank-you");
  }

  const selectedPackage = mentor.packages.find((p) => p.name === form.package);

  return (
    <div className="min-h-screen bg-[#F0FAF4] pt-20">
      {/* Page Header */}
      <section className="bg-brand-green section-padding !py-14 relative overflow-hidden">
        <div className="absolute inset-0 hero-bg-pattern opacity-60" aria-hidden="true" />
        <div className="container-max px-6 md:px-8 relative z-10">
          {/* Mentor mini-card */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-4 mb-6"
          >
            <div className="w-14 h-14 rounded-full border-2 border-brand-gold overflow-hidden flex-shrink-0">
              <Image
                src={mentor.photo}
                alt={mentor.name}
                width={56}
                height={56}
                className="w-full h-full object-cover object-top"
              />
            </div>
            <div>
              <p className="font-poppins text-xs text-brand-gold uppercase tracking-widest mb-0.5">
                Session with
              </p>
              <p className="font-montserrat font-bold text-white text-lg leading-tight">
                {mentor.name}
              </p>
              <p className="font-poppins text-xs text-white/60">{mentor.expertise}</p>
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-montserrat font-black text-3xl md:text-4xl text-white tracking-tight"
          >
            Book Your Session
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="font-poppins text-white/60 text-sm mt-2"
          >
            Complete payment first, then submit the form below.
          </motion.p>
        </div>
      </section>

      {/* Body */}
      <div className="container-max px-6 md:px-8 py-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* LEFT: Payment Instructions */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="lg:col-span-5"
          >
            <div className="bg-brand-green rounded-2xl p-7 shadow-gold-md relative overflow-hidden">
              {/* Decorative blob */}
              <div
                className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-5 -translate-y-1/2 translate-x-1/2"
                style={{ background: "radial-gradient(circle, #C9A84C, transparent)" }}
                aria-hidden="true"
              />

              <div className="flex items-start gap-3 mb-5 relative z-10">
                <div className="w-10 h-10 rounded-full bg-brand-gold/20 flex items-center justify-center flex-shrink-0">
                  <Info size={20} className="text-brand-gold" strokeWidth={1.8} />
                </div>
                <div>
                  <h2 className="font-montserrat font-bold text-lg text-white">Payment Details</h2>
                  <p className="font-poppins text-xs text-white/60 mt-0.5">
                    Transfer first, then upload screenshot below
                  </p>
                </div>
              </div>

              <p className="font-poppins text-sm text-white/70 mb-6 relative z-10 leading-relaxed">
                Transfer the session fee to any account below. Screenshot the confirmation, then
                complete the booking form.
              </p>

              <div className="space-y-4 relative z-10">
                {/* Bank */}
                <div className="bg-black/25 border border-white/10 hover:border-brand-gold/40 p-4 rounded-xl transition-colors group">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-poppins text-xs text-white/50 uppercase tracking-wider mb-1">
                        Bank Transfer
                      </p>
                      <p className="font-poppins text-sm text-white font-medium">
                        Habib Bank Limited (HBL)
                      </p>
                      <p className="font-montserrat font-bold text-brand-gold tracking-widest text-base mt-1">
                        0042 7991 3829 03
                      </p>
                      <p className="font-poppins text-xs text-white/40 mt-1">
                        Account Title: PZ Academy
                      </p>
                    </div>
                    <CopyButton text="0042799138290 3" />
                  </div>
                </div>

                {/* EasyPaisa / JazzCash */}
                <div className="bg-black/25 border border-white/10 hover:border-brand-gold/40 p-4 rounded-xl transition-colors group">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-poppins text-xs text-white/50 uppercase tracking-wider mb-1">
                        EasyPaisa / JazzCash
                      </p>
                      <p className="font-poppins text-sm text-white font-medium">
                        PZ Academy Admin
                      </p>
                      <p className="font-montserrat font-bold text-brand-gold tracking-widest text-base mt-1">
                        0370 0199 429
                      </p>
                    </div>
                    <CopyButton text="03700199429" />
                  </div>
                </div>
              </div>

              {/* Selected package price */}
              {selectedPackage && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-5 relative z-10 flex items-center justify-between bg-brand-gold/10 border border-brand-gold/30 rounded-xl px-4 py-3"
                >
                  <div>
                    <p className="font-poppins text-xs text-white/60 mb-0.5">Amount to Pay</p>
                    <p className="font-montserrat font-black text-brand-gold text-xl">
                      {formatPrice(selectedPackage.price)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-poppins text-xs text-white/60 mb-0.5">Package</p>
                    <p className="font-poppins text-sm text-white font-medium">
                      {selectedPackage.name}
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Security note */}
              <div className="mt-5 relative z-10 flex items-start gap-2">
                <Shield size={14} className="text-brand-gold/60 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                <p className="font-poppins text-xs text-white/40 leading-relaxed">
                  All bookings are manually verified by our team. We never store payment credentials.
                </p>
              </div>
            </div>

            {/* Back link */}
            <div className="mt-5">
              <Link
                href={`/mentors/${mentor.slug}`}
                className="inline-flex items-center gap-2 font-poppins text-sm text-gray-500 hover:text-brand-green transition-colors group"
              >
                <ArrowRight size={14} className="rotate-180 group-hover:-translate-x-1 transition-transform" />
                Back to {mentor.name}&apos;s profile
              </Link>
            </div>
          </motion.div>

          {/* RIGHT: Booking Form */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="lg:col-span-7"
          >
            <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
              <h2 className="font-montserrat font-bold text-xl text-brand-black mb-7">
                Your Booking Details
              </h2>

              <form onSubmit={handleSubmit} className="space-y-7" noValidate>
                {/* Name + Email */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
                  <div>
                    <label htmlFor="fullName" className="block font-poppins text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Full Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="fullName" name="fullName" type="text" required
                      value={form.fullName} onChange={handleChange}
                      placeholder="Your full name" className="input-underline"
                    />
                  </div>
                  <div>
                    <label htmlFor="email" className="block font-poppins text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Email Address <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="email" name="email" type="email" required
                      value={form.email} onChange={handleChange}
                      placeholder="you@example.com" className="input-underline"
                    />
                  </div>
                </div>

                {/* Phone + Package */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
                  <div>
                    <label htmlFor="phone" className="block font-poppins text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Phone / WhatsApp <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="phone" name="phone" type="tel" required
                      value={form.phone} onChange={handleChange}
                      placeholder="+92 300 0000000" className="input-underline"
                    />
                  </div>
                  <div>
                    <label htmlFor="package" className="block font-poppins text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Session Package <span className="text-red-400">*</span>
                    </label>
                    <select
                      id="package" name="package" required
                      value={form.package} onChange={handleChange}
                      className={cn("input-underline appearance-none", !form.package && "text-gray-400")}
                    >
                      <option value="" disabled>Select a package</option>
                      {mentor.packages.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name} – {formatPrice(p.price)}
                          {p.savings ? ` (Save ${formatPrice(p.savings)})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Screenshot Upload */}
                <div>
                  <label className="block font-poppins text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Payment Screenshot <span className="text-red-400">*</span>
                  </label>

                  {form.screenshot ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex items-center justify-between bg-brand-green/5 border border-brand-gold/30 rounded-xl px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircle size={18} className="text-brand-gold" strokeWidth={1.5} />
                        <div>
                          <p className="font-poppins text-sm text-gray-800 font-medium">
                            {form.screenshot.name}
                          </p>
                          <p className="font-poppins text-xs text-gray-400">
                            {(form.screenshot.size / 1024).toFixed(0)} KB
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, screenshot: null }))}
                        className="text-gray-400 hover:text-red-400 transition-colors cursor-pointer p-1"
                        aria-label="Remove file"
                      >
                        <X size={16} />
                      </button>
                    </motion.div>
                  ) : (
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={handleDrop}
                      onClick={() => fileRef.current?.click()}
                      className={cn(
                        "border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center bg-gray-50/50 cursor-pointer transition-all duration-200 group",
                        dragOver
                          ? "border-brand-gold bg-brand-gold/5"
                          : "border-gray-200 hover:border-brand-gold/50 hover:bg-gray-50"
                      )}
                      role="button"
                      tabIndex={0}
                      aria-label="Upload payment screenshot"
                      onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
                    >
                      <motion.div
                        animate={dragOver ? { scale: 1.15 } : { scale: 1 }}
                        className="w-14 h-14 rounded-full bg-brand-green/8 flex items-center justify-center mb-3 group-hover:bg-brand-green/12 transition-colors"
                        style={{ background: "rgba(26,77,46,0.08)" }}
                      >
                        <CloudUpload size={28} className="text-brand-gold" strokeWidth={1.5} />
                      </motion.div>
                      <p className="font-poppins text-sm text-gray-700 font-medium text-center">
                        Drag & drop your screenshot here
                      </p>
                      <p className="font-poppins text-xs text-gray-400 mt-1">
                        or <span className="text-brand-green underline">click to browse</span>
                      </p>
                      <p className="font-poppins text-xs text-gray-300 mt-2">
                        PNG, JPG or PDF · Max 5MB
                      </p>
                    </div>
                  )}

                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                    aria-hidden="true"
                  />
                </div>

                {/* WhatsApp alt */}
                <div>
                  <p className="font-poppins text-xs text-gray-400 mb-2">
                    Alternatively, send your screenshot via WhatsApp:
                  </p>
                  <a
                    href={whatsappLink(waMsg)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-whatsapp w-full justify-center"
                  >
                    <MessageCircle size={16} />
                    Share Screenshot via WhatsApp
                  </a>
                </div>

                {/* Notes */}
                <div>
                  <label htmlFor="notes" className="block font-poppins text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Additional Notes (Optional)
                  </label>
                  <textarea
                    id="notes" name="notes" rows={3}
                    value={form.notes} onChange={handleChange}
                    placeholder="Any specific topics you'd like to cover, preferred time slot, or message to the mentor..."
                    className="input-underline resize-none"
                  />
                </div>

                {/* Submit */}
                <motion.button
                  type="submit"
                  disabled={loading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="btn-primary w-full justify-center text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-4 h-4 border-2 border-brand-green/30 border-t-brand-green rounded-full"
                      />
                      Processing...
                    </>
                  ) : (
                    <>
                      Confirm Booking
                      <ArrowRight size={15} />
                    </>
                  )}
                </motion.button>

                <p className="text-center font-poppins text-xs text-gray-400">
                  Your booking will be reviewed within 24 hours. A confirmation email will be sent.
                </p>
              </form>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
