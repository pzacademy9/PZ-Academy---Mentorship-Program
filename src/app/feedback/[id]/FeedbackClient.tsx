"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { PublicSession } from "@/lib/gas";

// Step indices:
//   0              → Intro
//   1              → Name
//   2              → Email
//   3 … 3+N-1      → Star rating for question[0..N-1]
//   3+N            → Comments
//   3+N+1          → Thank-you (after submit)

interface Props {
  session: PublicSession;
}

type Answers = Record<number, number>; // questionIndex → star (1–5)

export default function FeedbackClient({ session }: Props) {
  const N = session.questions.length;
  const COMMENTS_STEP = 3 + N;
  const THANKYOU_STEP = COMMENTS_STEP + 1;
  const TOTAL_VISIBLE = COMMENTS_STEP + 1; // dots shown (0 … COMMENTS_STEP)

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [answers, setAnswers] = useState<Answers>({});
  const [comments, setComments] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const done = step === THANKYOU_STEP;

  const canNext = useCallback((): boolean => {
    if (step === 1) return name.trim().length > 0;
    if (step === 2) return email.trim().length > 0;
    const qi = step - 3;
    if (qi >= 0 && qi < N) return answers[qi] != null;
    return true; // intro and comments always advance
  }, [step, name, email, answers, N]);

  const next = () => {
    if (step < THANKYOU_STEP - 1) setStep((s) => s + 1);
  };
  const prev = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const setStar = (qi: number, v: number) => {
    setAnswers((prev) => ({ ...prev, [qi]: v }));
    setTimeout(() => setStep((s) => s + 1), 380);
  };

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      const payload = {
        id: session.id,
        name: name.trim(),
        email: email.trim(),
        website,
        answers: session.questions.map((q, i) => ({
          question: q,
          answer: answers[i] ?? 0,
        })),
        comments: comments.trim(),
      };
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json: { ok: boolean; error?: string } = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Submission failed.");
      setStep(THANKYOU_STEP);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const isLastBeforeSubmit = step === COMMENTS_STEP;
  const isRating = step >= 3 && step < COMMENTS_STEP;
  const qi = isRating ? step - 3 : -1;

  return (
    <div
      style={{
        background: "#0F3D22",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        overflowX: "hidden",
        fontFamily: "var(--font-poppins)",
      }}
    >
      {/* Progress dots */}
      {!done && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            padding: "18px 24px 14px",
            display: "flex",
            justifyContent: "center",
            gap: 6,
            zIndex: 10,
            background: "linear-gradient(to bottom, rgba(15,61,34,0.95) 60%, transparent)",
          }}
        >
          {Array.from({ length: TOTAL_VISIBLE }).map((_, i) => (
            <div
              key={i}
              style={{
                width: i === step ? 20 : 6,
                height: 6,
                borderRadius: 3,
                background: i < step ? "rgba(201,168,76,0.6)" : i === step ? "#C9A84C" : "rgba(255,255,255,0.2)",
                transition: "all 0.25s ease",
              }}
            />
          ))}
        </div>
      )}

      {/* Step content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px 24px 100px",
          maxWidth: 480,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.28 }}
            style={{ width: "100%" }}
          >
            {step === 0 && <IntroStep session={session} />}
            {step === 1 && <NameStep value={name} onChange={setName} />}
            {step === 2 && (
              <EmailStep value={email} onChange={setEmail} honeypot={website} onHoneypot={setWebsite} />
            )}
            {isRating && (
              <RatingStep
                question={session.questions[qi]}
                qNum={qi + 1}
                total={N}
                value={answers[qi]}
                onSelect={(v) => setStar(qi, v)}
              />
            )}
            {step === COMMENTS_STEP && (
              <CommentsStep value={comments} onChange={setComments} />
            )}
            {done && <ThankyouStep name={name} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom nav */}
      {!done && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "16px 24px 28px",
            background: "linear-gradient(to top, rgba(15,61,34,1) 60%, transparent)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
          }}
        >
          {error && (
            <p
              style={{
                color: "#FCA5A5",
                fontSize: 13,
                textAlign: "center",
                maxWidth: 400,
              }}
            >
              {error}
            </p>
          )}
          <div style={{ display: "flex", gap: 12, width: "100%", maxWidth: 400 }}>
            {step > 0 && (
              <button
                onClick={prev}
                style={{
                  flex: "0 0 48px",
                  height: 52,
                  borderRadius: 26,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "transparent",
                  color: "rgba(255,255,255,0.7)",
                  cursor: "pointer",
                  fontSize: 20,
                }}
              >
                ‹
              </button>
            )}
            {!isRating && (
              <button
                onClick={isLastBeforeSubmit ? submit : next}
                disabled={!canNext() || loading}
                style={{
                  flex: 1,
                  height: 52,
                  borderRadius: 26,
                  border: "none",
                  background: canNext() && !loading ? "#C9A84C" : "rgba(255,255,255,0.1)",
                  color: canNext() && !loading ? "#0F3D22" : "rgba(255,255,255,0.3)",
                  fontFamily: "var(--font-montserrat)",
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: canNext() && !loading ? "pointer" : "default",
                  transition: "all 0.2s",
                  letterSpacing: "0.04em",
                }}
              >
                {loading
                  ? "Submitting…"
                  : isLastBeforeSubmit
                  ? "Submit Feedback"
                  : step === 0
                  ? "Get started"
                  : "Continue"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step components ────────────────────────────────────────────────────────────

function IntroStep({ session }: { session: PublicSession }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "rgba(201,168,76,0.15)",
          border: "2px solid rgba(201,168,76,0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 24px",
          fontSize: 28,
        }}
      >
        💬
      </div>
      <h1
        style={{
          fontFamily: "var(--font-montserrat)",
          fontWeight: 800,
          fontSize: "clamp(24px, 6vw, 32px)",
          color: "#fff",
          lineHeight: 1.2,
          marginBottom: 12,
        }}
      >
        {session.name}
      </h1>
      {session.speaker && (
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, marginBottom: 20 }}>
          Speaker · {session.speaker}
        </p>
      )}
      <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 16, lineHeight: 1.65, maxWidth: 340, margin: "0 auto" }}>
        Got a minute to share how it went? Your feedback helps us make every session better.
      </p>
    </div>
  );
}

function NameStep({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label
        style={{
          display: "block",
          color: "rgba(255,255,255,0.55)",
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          fontFamily: "var(--font-montserrat)",
          marginBottom: 16,
        }}
      >
        Step 1 of 2
      </label>
      <h2
        style={{
          fontFamily: "var(--font-montserrat)",
          fontWeight: 800,
          fontSize: "clamp(22px, 5vw, 28px)",
          color: "#fff",
          marginBottom: 28,
        }}
      >
        What's your name?
      </h2>
      <input
        autoFocus
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && value.trim() && (e.currentTarget.blur())}
        placeholder="Your name"
        style={inputStyle}
      />
    </div>
  );
}

function EmailStep({
  value,
  onChange,
  honeypot,
  onHoneypot,
}: {
  value: string;
  onChange: (v: string) => void;
  honeypot: string;
  onHoneypot: (v: string) => void;
}) {
  return (
    <div>
      <label style={stepLabelStyle}>Step 2 of 2</label>
      <h2 style={stepHeadingStyle}>And your email?</h2>
      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
        Used to prevent duplicate submissions. We don't send marketing email.
      </p>
      {/* Honeypot — hidden from real users via style, visible to bots */}
      <input
        type="text"
        value={honeypot}
        onChange={(e) => onHoneypot(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
      />
      <input
        autoFocus
        type="email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="you@example.com"
        style={inputStyle}
      />
    </div>
  );
}

function RatingStep({
  question,
  qNum,
  total,
  value,
  onSelect,
}: {
  question: string;
  qNum: number;
  total: number;
  value: number | undefined;
  onSelect: (v: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? value ?? 0;
  const labels = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

  return (
    <div style={{ textAlign: "center" }}>
      <label style={{ ...stepLabelStyle, display: "block", marginBottom: 8 }}>
        Question {qNum} of {total}
      </label>
      <h2
        style={{
          fontFamily: "var(--font-montserrat)",
          fontWeight: 700,
          fontSize: "clamp(18px, 4.5vw, 24px)",
          color: "#fff",
          lineHeight: 1.35,
          marginBottom: 40,
          maxWidth: 360,
          margin: "0 auto 40px",
        }}
      >
        {question}
      </h2>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onSelect(n)}
            aria-label={`${n} star${n !== 1 ? "s" : ""}`}
            style={{
              width: 52,
              height: 52,
              fontSize: 42,
              lineHeight: 1,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: n <= display ? "#C9A84C" : "rgba(255,255,255,0.18)",
              transform: n === display ? "scale(1.25)" : "scale(1)",
              transition: "color 0.12s, transform 0.12s",
              padding: 0,
              touchAction: "manipulation",
            }}
          >
            ★
          </button>
        ))}
      </div>
      <p
        style={{
          color: display ? "#C9A84C" : "rgba(255,255,255,0.3)",
          fontFamily: "var(--font-montserrat)",
          fontWeight: 600,
          fontSize: 14,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          minHeight: 20,
          transition: "color 0.15s",
        }}
      >
        {labels[display]}
      </p>
    </div>
  );
}

function CommentsStep({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <h2 style={{ ...stepHeadingStyle, marginBottom: 8 }}>Any final thoughts?</h2>
      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginBottom: 24 }}>Optional — share anything else on your mind.</p>
      <textarea
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Your comments…"
        rows={5}
        style={{
          ...inputStyle,
          resize: "vertical",
          minHeight: 120,
          lineHeight: 1.6,
        }}
      />
    </div>
  );
}

function ThankyouStep({ name }: { name: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, type: "spring", bounce: 0.4 }}
      style={{ textAlign: "center" }}
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.15, duration: 0.5, type: "spring", bounce: 0.5 }}
        style={{
          width: 88,
          height: 88,
          borderRadius: "50%",
          background: "rgba(201,168,76,0.15)",
          border: "2px solid #C9A84C",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 28px",
          fontSize: 40,
        }}
      >
        🎉
      </motion.div>
      <h1
        style={{
          fontFamily: "var(--font-montserrat)",
          fontWeight: 800,
          fontSize: "clamp(26px, 6vw, 36px)",
          color: "#fff",
          marginBottom: 12,
        }}
      >
        Thank you{name ? `, ${name.split(" ")[0]}` : ""}!
      </h1>
      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 16, lineHeight: 1.65, maxWidth: 320, margin: "0 auto" }}>
        Your feedback has been recorded. We'll use it to make every PZ Academy session better.
      </p>
    </motion.div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const stepLabelStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.45)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.15em",
  fontFamily: "var(--font-montserrat)",
  marginBottom: 14,
};

const stepHeadingStyle: React.CSSProperties = {
  fontFamily: "var(--font-montserrat)",
  fontWeight: 800,
  fontSize: "clamp(22px, 5vw, 28px)",
  color: "#fff",
  marginBottom: 28,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 12,
  padding: "16px 18px",
  color: "#fff",
  fontSize: 16,
  fontFamily: "var(--font-poppins)",
  outline: "none",
  boxSizing: "border-box",
};
