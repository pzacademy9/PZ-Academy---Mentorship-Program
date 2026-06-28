"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star,
  CheckCircle2,
  User,
  Mail,
  MessageSquare,
  Video,
  UploadCloud,
  Camera,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  AlertCircle,
  ShieldCheck,
  Play,
  Square,
  RotateCcw,
  Send,
} from "lucide-react";
import type { PublicSession } from "@/lib/gas";

// Brand colors
const GREEN     = "#1A4D2E";
const GREEN_RGB = "26,77,46";
const GOLD      = "#C9A84C";

/** Email shape validator */
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

interface Props {
  session: PublicSession;
}

type StarAnswers  = Record<number, number>;
type VideoAnswers = Record<number, string>;

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 32 : -32,
    opacity: 0,
    scale: 0.97,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.38,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 32 : -32,
    opacity: 0,
    scale: 0.97,
    transition: {
      duration: 0.28,
      ease: [0.7, 0, 0.84, 0] as const,
    },
  }),
};

export default function FeedbackClient({ session }: Props) {
  const N             = session.questions.length;
  const COMMENTS_STEP = 3 + N;
  const THANKYOU_STEP = COMMENTS_STEP + 1;
  const TOTAL_VISIBLE = COMMENTS_STEP + 1;

  const [step,         setStep]         = useState(0);
  const [direction,    setDirection]    = useState(1);
  const [name,         setName]         = useState("");
  const [email,        setEmail]        = useState("");
  const [website,      setWebsite]      = useState(""); // honeypot
  const [starAnswers,  setStarAnswers]  = useState<StarAnswers>({});
  const [videoAnswers, setVideoAnswers] = useState<VideoAnswers>({});
  const [comments,     setComments]     = useState("");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");

  const done = step === THANKYOU_STEP;

  const qi       = step >= 3 && step < COMMENTS_STEP ? step - 3 : -1;
  const isRating = qi >= 0 && session.questions[qi]?.type === "stars";
  const isVideo  = qi >= 0 && session.questions[qi]?.type === "video";

  const canNext = useCallback((): boolean => {
    if (step === 1) return name.trim().length > 0;
    if (step === 2) return emailOk(email);
    if (isRating)   return starAnswers[qi] != null;
    if (isVideo)    return true;
    return true;
  }, [step, name, email, starAnswers, isRating, isVideo, qi]);

  const next = () => {
    if (step < THANKYOU_STEP - 1) {
      setDirection(1);
      setStep((s) => s + 1);
    }
  };

  const prev = () => {
    if (step > 0) {
      setDirection(-1);
      setStep((s) => s - 1);
    }
  };

  const setStar = (index: number, v: number) => {
    setStarAnswers((prev) => ({ ...prev, [index]: v }));
    setDirection(1);
    setTimeout(() => setStep((s) => s + 1), 380);
  };

  const setVideoAnswer = (index: number, url: string) => {
    setVideoAnswers((prev) => ({ ...prev, [index]: url }));
  };

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      const payload = {
        id:       session.id,
        name:     name.trim(),
        email:    email.trim(),
        website,
        answers:  session.questions.map((q, i) => ({
          question: q.text,
          answer:   q.type === "video"
            ? (videoAnswers[i] ?? "")
            : (starAnswers[i] ?? 0),
        })),
        comments: comments.trim(),
      };
      const res = await fetch("/api/feedback", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const json: { ok: boolean; error?: string } = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Submission failed.");
      setDirection(1);
      setStep(THANKYOU_STEP);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const isLastBeforeSubmit = step === COMMENTS_STEP;
  const progressPercent    = Math.round((Math.min(step, COMMENTS_STEP) / COMMENTS_STEP) * 100);

  return (
    <div
      style={{
        background:    step === 0 && session.coverUrl ? "transparent" : GREEN,
        transition:    "background 0.5s ease-out",
        minHeight:     "100vh",
        display:       "flex",
        flexDirection: "column",
        overflowX:     "hidden",
        fontFamily:    "var(--font-poppins)",
        position:      "relative",
      }}
    >
      {/* Dynamic Ambient Background Lights */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-10%",
            right: "-10%",
            width: "50vw",
            height: "50vw",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(201,168,76,0.12) 0%, rgba(201,168,76,0) 70%)",
            filter: "blur(60px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-10%",
            left: "-10%",
            width: "60vw",
            height: "60vw",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(46,125,82,0.25) 0%, rgba(46,125,82,0) 70%)",
            filter: "blur(70px)",
          }}
        />
      </div>

      {/* Ambient cover background for step 0 when cover present */}
      {step === 0 && session.coverUrl && (
        <div
          aria-hidden="true"
          style={{
            position:           "fixed",
            inset:              0,
            zIndex:             0,
            backgroundImage:    `url(${session.coverUrl})`,
            backgroundSize:     "cover",
            backgroundPosition: "center 20%",
            filter:             "blur(32px) saturate(1.2) brightness(0.85)",
            transform:          "scale(1.12)",
            pointerEvents:      "none",
            transition:         "opacity 0.6s ease",
          }}
        />
      )}

      {/* Floating Header & Progress Bar */}
      {!done && (
        <header
          style={{
            position:       "fixed",
            top:            20,
            left:           "50%",
            transform:      "translateX(-50%)",
            width:          "calc(100% - 48px)",
            maxWidth:       520,
            zIndex:         20,
            background:     "rgba(255, 255, 255, 0.07)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border:         "1px solid rgba(255, 255, 255, 0.14)",
            borderRadius:   18,
            padding:        "12px 20px",
            boxShadow:      "0 12px 32px rgba(0, 0, 0, 0.2)",
            display:        "flex",
            flexDirection:  "column",
            gap:            8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span
              style={{
                fontSize:      11,
                fontWeight:    700,
                color:         "rgba(255,255,255,0.7)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                fontFamily:    "var(--font-montserrat)",
                display:       "flex",
                alignItems:    "center",
                gap:           6,
              }}
            >
              <Sparkles size={13} color={GOLD} />
              {step === 0 ? "Introduction" : step === COMMENTS_STEP ? "Final Step" : `Step ${step} of ${COMMENTS_STEP}`}
            </span>
            <span
              style={{
                fontSize:     11,
                fontWeight:   800,
                color:        GOLD,
                fontFamily:   "var(--font-montserrat)",
                background:   "rgba(201, 168, 76, 0.15)",
                padding:      "2px 8px",
                borderRadius: 10,
                border:       "1px solid rgba(201, 168, 76, 0.25)",
              }}
            >
              {progressPercent}%
            </span>
          </div>

          {/* Gliding Progress Track */}
          <div
            style={{
              width:        "100%",
              height:       5,
              background:   "rgba(255,255,255,0.12)",
              borderRadius: 3,
              overflow:     "hidden",
              position:     "relative",
            }}
          >
            <motion.div
              initial={false}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              style={{
                height:       "100%",
                background:   `linear-gradient(90deg, ${GOLD} 0%, #E8C97A 100%)`,
                borderRadius: 3,
                boxShadow:    `0 0 10px ${GOLD}`,
              }}
            />
          </div>
        </header>
      )}

      {/* Main Form Body Container */}
      <main
        style={{
          flex:           1,
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          justifyContent: "center",
          padding:        "110px 24px 120px",
          maxWidth:       520,
          margin:         "0 auto",
          width:          "100%",
          position:       "relative",
          zIndex:         1,
        }}
      >
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            style={{ width: "100%" }}
          >
            {/* Frosted Glass Shell */}
            <div
              style={{
                width:                "100%",
                background:           "rgba(255, 255, 255, 0.06)",
                backdropFilter:       "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                borderRadius:         28,
                border:               "1px solid rgba(255, 255, 255, 0.14)",
                boxShadow:            "0 30px 60px -12px rgba(0, 0, 0, 0.35), 0 0 40px rgba(201, 168, 76, 0.06)",
                padding:              step === 0 && session.coverUrl ? 0 : "36px 32px",
                overflow:             "hidden",
                position:             "relative",
              }}
            >
              {step === 0 && <IntroStep session={session} />}
              {step === 1 && <NameStep value={name} onChange={setName} />}
              {step === 2 && (
                <EmailStep
                  value={email}
                  onChange={setEmail}
                  honeypot={website}
                  onHoneypot={setWebsite}
                />
              )}
              {isRating && (
                <RatingStep
                  question={session.questions[qi].text}
                  qNum={qi + 1}
                  total={N}
                  value={starAnswers[qi]}
                  onSelect={(v) => setStar(qi, v)}
                />
              )}
              {isVideo && (
                <VideoStep
                  question={session.questions[qi].text}
                  qNum={qi + 1}
                  total={N}
                  value={videoAnswers[qi] ?? ""}
                  onChange={(url) => setVideoAnswer(qi, url)}
                  sessionId={session.id}
                  sessionName={session.name}
                  participantName={name}
                />
              )}
              {step === COMMENTS_STEP && (
                <CommentsStep value={comments} onChange={setComments} />
              )}
              {done && <ThankyouStep name={name} />}
            </div>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Floating Control Dock */}
      {!done && (
        <footer
          style={{
            position:       "fixed",
            bottom:         0,
            left:           0,
            right:          0,
            padding:        "20px 24px 28px",
            background:     `linear-gradient(to top, rgba(${GREEN_RGB},0.98) 65%, transparent)`,
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            gap:            12,
            zIndex:         20,
          }}
        >
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                display:      "flex",
                alignItems:   "center",
                gap:          8,
                background:   "rgba(239, 68, 68, 0.15)",
                border:       "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: 12,
                padding:      "8px 16px",
                color:        "#FCA5A5",
                fontSize:     13,
                maxWidth:     440,
                textAlign:    "center",
              }}
            >
              <AlertCircle size={16} shrink-0="true" />
              <span>{error}</span>
            </motion.div>
          )}

          <div style={{ display: "flex", gap: 12, width: "100%", maxWidth: 460 }}>
            {step > 0 && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={prev}
                aria-label="Previous step"
                style={{
                  flex:           "0 0 52px",
                  height:         52,
                  borderRadius:   26,
                  border:         "1px solid rgba(255,255,255,0.18)",
                  background:     "rgba(255,255,255,0.06)",
                  color:          "#fff",
                  cursor:         "pointer",
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  transition:     "background 0.2s, border-color 0.2s",
                }}
              >
                <ChevronLeft size={22} />
              </motion.button>
            )}

            {!isRating && (
              <motion.button
                whileHover={canNext() && !loading ? { scale: 1.02 } : {}}
                whileTap={canNext() && !loading ? { scale: 0.98 } : {}}
                onClick={isLastBeforeSubmit ? submit : next}
                disabled={!canNext() || loading}
                style={{
                  flex:           1,
                  height:         52,
                  borderRadius:   26,
                  border:         "none",
                  background:     canNext() && !loading
                    ? `linear-gradient(135deg, ${GOLD} 0%, #E8C97A 100%)`
                    : "rgba(255,255,255,0.08)",
                  color:          canNext() && !loading ? GREEN : "rgba(255,255,255,0.35)",
                  fontFamily:     "var(--font-montserrat)",
                  fontWeight:     700,
                  fontSize:       15,
                  cursor:         canNext() && !loading ? "pointer" : "not-allowed",
                  boxShadow:      canNext() && !loading ? `0 8px 24px rgba(201,168,76,0.3)` : "none",
                  letterSpacing:  "0.04em",
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  gap:            8,
                  transition:     "all 0.25s ease",
                }}
              >
                {loading ? (
                  <>
                    <span className="fb-spinner-dark" aria-hidden="true" />
                    <span>Submitting…</span>
                  </>
                ) : isLastBeforeSubmit ? (
                  <>
                    <span>Submit Feedback</span>
                    <Send size={18} />
                  </>
                ) : step === 0 ? (
                  <>
                    <span>Get Started</span>
                    <ChevronRight size={18} />
                  </>
                ) : (
                  <>
                    <span>Continue</span>
                    <ChevronRight size={18} />
                  </>
                )}
              </motion.button>
            )}
          </div>
        </footer>
      )}

      <style jsx global>{`
        .fb-input:focus-visible {
          outline: none;
          border-color: #C9A84C !important;
          box-shadow: 0 0 0 3px rgba(201, 168, 76, 0.3) !important;
        }
        .fb-spinner-dark {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(26,77,46,0.3);
          border-top-color: #1A4D2E;
          border-radius: 50%;
          display: inline-block;
          animation: fb-spin 0.7s linear infinite;
        }
        @keyframes fb-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ── Step components ────────────────────────────────────────────────────────────

function IntroStep({ session }: { session: PublicSession }) {
  const [heroLoaded, setHeroLoaded] = useState(false);

  if (!session.coverUrl) {
    return (
      <div style={{ textAlign: "center" }}>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", bounce: 0.5, duration: 0.6 }}
          style={{
            width:          72,
            height:         72,
            borderRadius:   "50%",
            background:     "rgba(201,168,76,0.15)",
            border:         "1.5px solid rgba(201,168,76,0.4)",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            margin:         "0 auto 24px",
            color:          GOLD,
            boxShadow:      "0 0 24px rgba(201,168,76,0.2)",
          }}
        >
          <Sparkles size={32} />
        </motion.div>
        <h1
          style={{
            fontFamily:   "var(--font-montserrat)",
            fontWeight:   800,
            fontSize:     "clamp(24px, 5vw, 30px)",
            color:        "#fff",
            lineHeight:   1.25,
            marginBottom: 10,
            letterSpacing:"-0.01em",
          }}
        >
          {session.name}
        </h1>
        {session.speaker && (
          <div
            style={{
              display:       "inline-block",
              padding:       "4px 14px",
              borderRadius:  12,
              background:    "rgba(255,255,255,0.08)",
              border:        "1px solid rgba(255,255,255,0.15)",
              color:         "rgba(255,255,255,0.75)",
              fontSize:      12,
              fontWeight:    600,
              marginBottom:  20,
              fontFamily:    "var(--font-poppins)",
            }}
          >
            Speaker · {session.speaker}
          </div>
        )}
        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 15, lineHeight: 1.65, maxWidth: 360, margin: "0 auto" }}>
          We&apos;d love to hear your thoughts! Your quick feedback helps us make every PZ Academy mentorship session exceptional.
        </p>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Integrated Hero image strip */}
      <div style={{ position: "relative", height: 160, overflow: "hidden" }}>
        {!heroLoaded && (
          <div
            aria-hidden="true"
            style={{
              position:       "absolute",
              inset:          0,
              background:     "linear-gradient(90deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.06) 100%)",
              backgroundSize: "200% 100%",
              animation:      "coverShimmer 1.4s ease-in-out infinite",
            }}
          />
        )}
        <img
          src={session.coverUrl}
          alt={session.name}
          onLoad={() => setHeroLoaded(true)}
          style={{
            width:          "100%",
            height:         "100%",
            objectFit:      "cover",
            objectPosition: "center 20%",
            display:        "block",
            opacity:        heroLoaded ? 1 : 0,
            transition:     "opacity 0.4s ease-out",
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position:   "absolute",
            bottom:     0,
            left:       0,
            right:      0,
            height:     60,
            background: "linear-gradient(to bottom, transparent 0%, rgba(20, 50, 30, 0.95) 100%)",
          }}
        />
      </div>

      <div style={{ padding: "24px 28px 32px", textAlign: "center" }}>
        <h1
          style={{
            fontFamily:    "var(--font-montserrat)",
            fontWeight:    800,
            fontSize:      "clamp(20px, 4.5vw, 24px)",
            color:         "#fff",
            lineHeight:    1.3,
            marginBottom:  8,
            letterSpacing: "-0.01em",
          }}
        >
          {session.name}
        </h1>
        {session.speaker && (
          <p
            style={{
              color:        GOLD,
              fontSize:     13,
              fontWeight:   600,
              marginBottom: 16,
              fontFamily:   "var(--font-poppins)",
            }}
          >
            Speaker · {session.speaker}
          </p>
        )}
        <p
          style={{
            color:      "rgba(255,255,255,0.75)",
            fontSize:   14,
            lineHeight: 1.65,
            maxWidth:   340,
            margin:     "0 auto",
          }}
        >
          Got a minute to share how it went? Your insights help shape our future sessions.
        </p>
      </div>

      <style jsx>{`
        @keyframes coverShimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

function NameStep({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={stepLabelStyle}>Step 1 of 2</label>
      <h2 style={stepHeadingStyle}>What&apos;s your name?</h2>
      <div style={{ position: "relative" }}>
        <User
          size={20}
          color="rgba(255,255,255,0.4)"
          style={{ position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)" }}
        />
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && value.trim() && e.currentTarget.blur()}
          placeholder="Enter your full name"
          autoComplete="name"
          className="fb-input"
          style={{ ...inputStyle, paddingLeft: 48 }}
        />
      </div>
    </div>
  );
}

function EmailStep({
  value, onChange, honeypot, onHoneypot,
}: {
  value: string; onChange: (v: string) => void;
  honeypot: string; onHoneypot: (v: string) => void;
}) {
  const invalid = value.trim().length > 0 && !emailOk(value);
  return (
    <div>
      <label style={stepLabelStyle}>Step 2 of 2</label>
      <h2 style={stepHeadingStyle}>And your email address?</h2>
      <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginBottom: 22, lineHeight: 1.6 }}>
        Used solely to prevent duplicate submissions. We respect your privacy and never spam.
      </p>
      {/* Honeypot */}
      <input
        type="text"
        value={honeypot}
        onChange={(e) => onHoneypot(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        autoComplete="off"
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
      />
      <div style={{ position: "relative" }}>
        <Mail
          size={20}
          color="rgba(255,255,255,0.4)"
          style={{ position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)" }}
        />
        <input
          autoFocus
          type="email"
          inputMode="email"
          autoComplete="email"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="you@example.com"
          aria-invalid={invalid}
          className="fb-input"
          style={{
            ...inputStyle,
            paddingLeft: 48,
            borderColor: invalid ? "rgba(252,165,165,0.6)" : (inputStyle.border as string),
          }}
        />
      </div>
      {invalid && (
        <p style={{ color: "#FCA5A5", fontSize: 13, marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <AlertCircle size={14} /> Please enter a valid email address.
        </p>
      )}
      <div
        style={{
          display:    "flex",
          alignItems: "center",
          gap:        6,
          marginTop:  20,
          color:      "rgba(255,255,255,0.4)",
          fontSize:   12,
        }}
      >
        <ShieldCheck size={14} color={GOLD} />
        <span>Secure & verified response</span>
      </div>
    </div>
  );
}

function RatingStep({
  question, qNum, total, value, onSelect,
}: {
  question: string; qNum: number; total: number;
  value: number | undefined; onSelect: (v: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? value ?? 0;
  const labels  = ["", "Poor", "Fair", "Good", "Great", "Excellent!"];

  return (
    <div style={{ textAlign: "center" }}>
      <label style={{ ...stepLabelStyle, display: "block", marginBottom: 8 }}>
        Question {qNum} of {total}
      </label>
      <h2
        style={{
          fontFamily:   "var(--font-montserrat)",
          fontWeight:   700,
          fontSize:     "clamp(18px, 4.5vw, 23px)",
          color:        "#fff",
          lineHeight:   1.38,
          margin:       "0 auto 36px",
          maxWidth:     380,
        }}
      >
        {question}
      </h2>

      {/* Dynamic Star Buttons */}
      <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 20 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = n <= display;
          return (
            <motion.button
              key={n}
              whileHover={{ scale: 1.28, rotate: 6 }}
              whileTap={{ scale: 0.88 }}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect(n)}
              aria-label={`${n} star${n !== 1 ? "s" : ""} — ${labels[n]}`}
              className="fb-star"
              style={{
                width:          54,
                height:         54,
                borderRadius:   16,
                background:     active ? "rgba(201, 168, 76, 0.15)" : "rgba(255,255,255,0.05)",
                border:         active ? "1.5px solid rgba(201, 168, 76, 0.5)" : "1px solid rgba(255,255,255,0.12)",
                cursor:         "pointer",
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                color:          active ? GOLD : "rgba(255,255,255,0.25)",
                boxShadow:      active ? "0 0 20px rgba(201, 168, 76, 0.25)" : "none",
                transition:     "background 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s",
                padding:        0,
              }}
            >
              <Star
                size={28}
                fill={active ? GOLD : "transparent"}
                strokeWidth={active ? 1.5 : 1.5}
              />
            </motion.button>
          );
        })}
      </div>

      {/* Animated Label Pill */}
      <div style={{ minHeight: 28 }}>
        <AnimatePresence mode="wait">
          {display > 0 && (
            <motion.span
              key={display}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              style={{
                display:       "inline-block",
                padding:       "4px 16px",
                borderRadius:  20,
                background:    "rgba(201, 168, 76, 0.18)",
                border:        "1px solid rgba(201, 168, 76, 0.35)",
                color:         GOLD,
                fontFamily:    "var(--font-montserrat)",
                fontWeight:    700,
                fontSize:      13,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {labels[display]}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

type VState = "idle" | "recording" | "previewing" | "uploading" | "done";

function VideoStep({
  question, qNum, total, value, onChange, sessionId, sessionName, participantName,
}: {
  question: string; qNum: number; total: number;
  value: string; onChange: (url: string) => void;
  sessionId: string; sessionName: string; participantName: string;
}) {
  const [vState,    setVState]    = useState<VState>(value ? "done" : "idle");
  const [countdown, setCountdown] = useState(30);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [blob,      setBlob]      = useState<Blob | null>(null);
  const [errMsg,    setErrMsg]    = useState("");

  const videoRef    = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const chunksRef   = useRef<BlobPart[]>([]);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current)  clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (objectUrl)         URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = async () => {
    setErrMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted     = true;
        videoRef.current.controls  = false;
        videoRef.current.play();
      }

      chunksRef.current = [];
      const mimeType =
        MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus") ? "video/webm;codecs=vp8,opus" :
        MediaRecorder.isTypeSupported("video/webm")                  ? "video/webm" :
                                                                       "video/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const recorded = new Blob(chunksRef.current, { type: mimeType.split(";")[0] });
        const url      = URL.createObjectURL(recorded);
        setBlob(recorded);
        setObjectUrl(url);
        setVState("previewing");
        stream.getTracks().forEach((t) => t.stop());
        if (videoRef.current) {
          videoRef.current.srcObject = null;
          videoRef.current.src       = url;
          videoRef.current.muted     = false;
          videoRef.current.controls  = true;
        }
      };

      recorderRef.current = recorder;
      recorder.start(100);
      setVState("recording");
      setCountdown(30);

      let remaining = 30;
      timerRef.current = setInterval(() => {
        remaining -= 1;
        setCountdown(remaining);
        if (remaining <= 0) stopRecording();
      }, 1000);
    } catch {
      setErrMsg("Camera access was denied. Try uploading a video file instead.");
    }
  };

  const stopRecording = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setErrMsg("File is too large (max 20 MB). Try recording a short clip instead.");
      return;
    }
    const url = URL.createObjectURL(file);
    setBlob(file);
    setObjectUrl(url);
    setVState("previewing");
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src       = url;
      videoRef.current.muted     = false;
      videoRef.current.controls  = true;
    }
  };

  const doUpload = async () => {
    if (!blob) return;
    setVState("uploading");
    setErrMsg("");
    try {
      const ext      = blob.type.includes("mp4") ? "mp4" : "webm";
      const formData = new FormData();
      formData.append("video",           blob, `feedback.${ext}`);
      formData.append("sessionId",       sessionId);
      formData.append("sessionName",     sessionName);
      formData.append("participantName", participantName);

      const res  = await fetch("/api/upload-video", { method: "POST", body: formData });
      const json: { ok: boolean; data?: { url: string }; error?: string } = await res.json();
      if (!json.ok || !json.data?.url) throw new Error(json.error ?? "Upload failed.");

      onChange(json.data.url);
      setVState("done");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Upload failed. Please try again.");
      setVState("previewing");
    }
  };

  const reset = () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setObjectUrl(null);
    setBlob(null);
    setVState("idle");
    setErrMsg("");
    onChange("");
    if (videoRef.current) {
      videoRef.current.src       = "";
      videoRef.current.srcObject = null;
      videoRef.current.controls  = false;
    }
  };

  return (
    <div>
      <label style={{ ...stepLabelStyle, display: "block" }}>Question {qNum} of {total}</label>
      <h2 style={{ ...stepHeadingStyle, marginBottom: 16 }}>{question}</h2>

      {/* Studio Video Frame */}
      <video
        ref={videoRef}
        playsInline
        style={{
          width:        "100%",
          borderRadius: 16,
          background:   "#000",
          border:       "1px solid rgba(255,255,255,0.2)",
          display:      vState === "recording" || vState === "previewing" ? "block" : "none",
          marginBottom: 20,
          maxHeight:    260,
          objectFit:    "cover",
          boxShadow:    "0 12px 30px rgba(0,0,0,0.4)",
        }}
      />

      {/* IDLE state */}
      {vState === "idle" && (
        <>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13.5, marginBottom: 24, lineHeight: 1.6 }}>
            Share a short video response (up to 30s). <span style={{ opacity: 0.7 }}>Optional — tap Continue to skip.</span>
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={startRecording}
              style={videoOptionBtnStyle}
            >
              <div style={iconBadgeStyle}>
                <Camera size={22} color={GOLD} />
              </div>
              <span style={{ fontWeight: 700, color: "#fff", fontSize: 14 }}>Record Video</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Camera & Mic</span>
            </motion.button>

            <motion.label
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              style={{ ...videoOptionBtnStyle, cursor: "pointer" }}
            >
              <div style={iconBadgeStyle}>
                <UploadCloud size={22} color={GOLD} />
              </div>
              <span style={{ fontWeight: 700, color: "#fff", fontSize: 14 }}>Upload Clip</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>MP4 or WebM</span>
              <input
                type="file"
                accept="video/*"
                style={{ display: "none" }}
                onChange={handleFileSelect}
              />
            </motion.label>
          </div>
          {errMsg && <p style={errStyle}>{errMsg}</p>}
        </>
      )}

      {/* RECORDING state */}
      {vState === "recording" && (
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              display:       "inline-flex",
              alignItems:    "center",
              gap:           8,
              background:    "rgba(239,68,68,0.15)",
              border:        "1px solid rgba(239,68,68,0.3)",
              borderRadius:  20,
              padding:       "6px 16px",
              color:         countdown <= 5 ? "#FCA5A5" : "#fff",
              fontSize:      13,
              fontWeight:    600,
              marginBottom:  16,
            }}
          >
            <span className="rec-dot" />
            <span>0:{countdown < 10 ? `0${countdown}` : countdown} remaining</span>
          </div>
          <div>
            <button onClick={stopRecording} style={stopBtnStyle}>
              <Square size={16} fill="currentColor" /> Stop Recording
            </button>
          </div>
        </div>
      )}

      {/* PREVIEWING state */}
      {vState === "previewing" && (
        <>
          <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
            <button onClick={doUpload} style={primarySmallBtn}>
              <CheckCircle2 size={16} /> Use This Video
            </button>
            <button onClick={reset} style={ghostSmallBtn}>
              <RotateCcw size={16} /> Re-record
            </button>
          </div>
          {errMsg && <p style={errStyle}>{errMsg}</p>}
        </>
      )}

      {/* UPLOADING state */}
      {vState === "uploading" && (
        <div
          style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            gap:            12,
            background:     "rgba(255,255,255,0.06)",
            borderRadius:   14,
            padding:        "18px",
          }}
        >
          <span className="fb-spinner-gold" aria-hidden="true" />
          <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, margin: 0, fontWeight: 500 }}>
            Uploading & processing video…
          </p>
        </div>
      )}

      {/* DONE state */}
      {vState === "done" && (
        <div style={{ textAlign: "center", padding: "12px 0" }}>
          <div
            style={{
              display:       "inline-flex",
              alignItems:    "center",
              gap:           8,
              background:    "rgba(201,168,76,0.15)",
              border:        "1px solid rgba(201,168,76,0.3)",
              borderRadius:  20,
              padding:       "8px 18px",
              color:         GOLD,
              fontSize:      14,
              fontWeight:    600,
              marginBottom:  16,
            }}
          >
            <CheckCircle2 size={18} /> Video Attached Successfully
          </div>
          <div>
            <button onClick={reset} style={{ ...ghostSmallBtn, maxWidth: 200, margin: "0 auto" }}>
              Change / Re-record
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .rec-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #ef4444;
          display: inline-block;
          animation: rec-pulse 1s infinite;
        }
        @keyframes rec-pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.2); }
          100% { opacity: 1; transform: scale(1); }
        }
        .fb-spinner-gold {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(201,168,76,0.25);
          border-top-color: #c9a84c;
          border-radius: 50%;
          display: inline-block;
          animation: fb-spin 0.7s linear infinite;
        }
      `}</style>
    </div>
  );
}

function CommentsStep({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <h2 style={{ ...stepHeadingStyle, marginBottom: 8 }}>Any final thoughts?</h2>
      <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
        Optional — share takeaways, suggestions, or highlights from the session.
      </p>
      <div style={{ position: "relative" }}>
        <MessageSquare
          size={20}
          color="rgba(255,255,255,0.35)"
          style={{ position: "absolute", left: 18, top: 18 }}
        />
        <textarea
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Write your comments here..."
          rows={5}
          className="fb-input"
          style={{ ...inputStyle, paddingLeft: 48, resize: "vertical", minHeight: 130, lineHeight: 1.6 }}
        />
      </div>
    </div>
  );
}

function ThankyouStep({ name }: { name: string }) {
  const firstName = name ? name.split(" ")[0] : "";
  return (
    <div style={{ textAlign: "center", padding: "12px 0" }}>
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.1, duration: 0.6, type: "spring", bounce: 0.5 }}
        style={{
          width:          88,
          height:         88,
          borderRadius:   "50%",
          background:     "rgba(201, 168, 76, 0.15)",
          border:         "2px solid #C9A84C",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          margin:         "0 auto 28px",
          color:          GOLD,
          boxShadow:      "0 0 30px rgba(201, 168, 76, 0.3)",
        }}
      >
        <CheckCircle2 size={46} />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        style={{
          fontFamily:   "var(--font-montserrat)",
          fontWeight:   800,
          fontSize:     "clamp(26px, 6vw, 34px)",
          color:        "#fff",
          marginBottom: 12,
          letterSpacing:"-0.01em",
        }}
      >
        Thank You{firstName ? `, ${firstName}` : ""}!
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        style={{ color: "rgba(255,255,255,0.7)", fontSize: 15, lineHeight: 1.7, maxWidth: 360, margin: "0 auto" }}
      >
        Your feedback has been submitted successfully. We appreciate your time and dedication to making PZ Academy sessions better.
      </motion.p>
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const stepLabelStyle: React.CSSProperties = {
  color:         GOLD,
  fontSize:      11,
  fontWeight:    700,
  textTransform: "uppercase",
  letterSpacing: "0.15em",
  fontFamily:    "var(--font-montserrat)",
  marginBottom:  12,
};

const stepHeadingStyle: React.CSSProperties = {
  fontFamily:    "var(--font-montserrat)",
  fontWeight:    800,
  fontSize:      "clamp(22px, 5vw, 27px)",
  color:         "#fff",
  marginBottom:  24,
  letterSpacing: "-0.01em",
};

const inputStyle: React.CSSProperties = {
  width:        "100%",
  background:   "rgba(255,255,255,0.06)",
  border:       "1px solid rgba(255,255,255,0.16)",
  borderRadius: 16,
  padding:      "16px 20px",
  color:        "#fff",
  fontSize:     15,
  fontFamily:   "var(--font-poppins)",
  outline:      "none",
  boxSizing:    "border-box",
  transition:   "all 0.2s ease",
};

const videoOptionBtnStyle: React.CSSProperties = {
  display:        "flex",
  flexDirection:  "column",
  alignItems:     "center",
  justifyContent: "center",
  gap:            6,
  padding:        "24px 16px",
  borderRadius:   18,
  border:         "1px solid rgba(255,255,255,0.14)",
  background:     "rgba(255,255,255,0.05)",
  color:          "#fff",
  fontFamily:     "var(--font-poppins)",
  transition:     "all 0.2s ease",
};

const iconBadgeStyle: React.CSSProperties = {
  width:          44,
  height:         44,
  borderRadius:   12,
  background:     "rgba(201,168,76,0.12)",
  border:         "1px solid rgba(201,168,76,0.25)",
  display:        "flex",
  alignItems:     "center",
  justifyContent: "center",
  marginBottom:   4,
};

const stopBtnStyle: React.CSSProperties = {
  display:        "inline-flex",
  alignItems:     "center",
  gap:            8,
  background:     "rgba(239,68,68,0.18)",
  border:         "1px solid rgba(239,68,68,0.4)",
  borderRadius:   24,
  color:          "#FCA5A5",
  padding:        "12px 28px",
  fontSize:       14,
  fontWeight:     600,
  cursor:         "pointer",
  fontFamily:     "var(--font-poppins)",
};

const primarySmallBtn: React.CSSProperties = {
  flex:           1,
  display:        "inline-flex",
  alignItems:     "center",
  justifyContent: "center",
  gap:            8,
  padding:        "14px 18px",
  borderRadius:   14,
  border:         "none",
  background:     `linear-gradient(135deg, ${GOLD} 0%, #E8C97A 100%)`,
  color:          GREEN,
  fontWeight:     700,
  fontSize:       14,
  cursor:         "pointer",
  fontFamily:     "var(--font-montserrat)",
  boxShadow:      "0 4px 16px rgba(201,168,76,0.25)",
};

const ghostSmallBtn: React.CSSProperties = {
  flex:           1,
  display:        "inline-flex",
  alignItems:     "center",
  justifyContent: "center",
  gap:            8,
  padding:        "14px 18px",
  borderRadius:   14,
  border:         "1px solid rgba(255,255,255,0.2)",
  background:     "rgba(255,255,255,0.05)",
  color:          "rgba(255,255,255,0.8)",
  fontSize:       14,
  cursor:         "pointer",
  fontFamily:     "var(--font-poppins)",
};

const errStyle: React.CSSProperties = {
  color:     "#FCA5A5",
  fontSize:  13,
  marginTop: 12,
};
