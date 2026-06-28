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
  Square,
  RotateCcw,
  Send,
  GraduationCap,
  Award,
  HeartHandshake,
} from "lucide-react";
import type { PublicSession } from "@/lib/gas";

// Brand color palette
const DARK_BG   = "#0A2214";
const CARD_BG   = "rgba(10, 32, 20, 0.88)";
const GOLD      = "#C9A84C";
const GOLD_LIGHT= "#F3E5AB";

/** Email shape validator */
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

interface Props {
  session: PublicSession;
}

type StarAnswers  = Record<number, number>;
type VideoAnswers = Record<number, string>;

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 40 : -40,
    opacity: 0,
    scale: 0.96,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.35,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 40 : -40,
    opacity: 0,
    scale: 0.96,
    transition: {
      duration: 0.25,
      ease: [0.7, 0, 0.84, 0] as const,
    },
  }),
};

export default function FeedbackClient({ session }: Props) {
  const N             = session.questions.length;
  const COMMENTS_STEP = 3 + N;
  const THANKYOU_STEP = COMMENTS_STEP + 1;

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
    setTimeout(() => setStep((s) => s + 1), 420);
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

  // Dynamic Impact Level Badges
  const getImpactBadge = () => {
    if (step === 0) return "🌟 YOUR VOICE MATTERS";
    if (step === 1) return "👤 STEP 1: YOUR NAME";
    if (step === 2) return "✉️ STEP 2: VERIFICATION";
    if (isRating || isVideo) return `🔥 IMPACT MILESTONE ${qi + 1} OF ${N}`;
    if (step === COMMENTS_STEP) return "💡 FINAL INSIGHTS";
    return "🎉 COMPLETED";
  };

  return (
    <div
      style={{
        background:    DARK_BG,
        backgroundImage:"radial-gradient(circle at 50% 0%, #154228 0%, #0A2214 75%)",
        minHeight:     "100vh",
        display:       "flex",
        flexDirection: "column",
        overflowX:     "hidden",
        fontFamily:    "var(--font-poppins)",
        position:      "relative",
        color:         "#fff",
      }}
    >
      {/* Background Ambient Glow Orbs */}
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
            top: "-15%",
            left: "50%",
            transform: "translateX(-50%)",
            width: "80vw",
            maxWidth: 800,
            height: "400px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(201,168,76,0.15) 0%, rgba(201,168,76,0) 70%)",
            filter: "blur(70px)",
          }}
        />
      </div>

      {/* Floating Header & Gamified Impact Dock */}
      {!done && (
        <header
          style={{
            position:       "fixed",
            top:            16,
            left:           "50%",
            transform:      "translateX(-50%)",
            width:          "calc(100% - 32px)",
            maxWidth:       500,
            zIndex:         30,
            background:     "rgba(8, 26, 16, 0.92)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border:         "1px solid rgba(201, 168, 76, 0.3)",
            borderRadius:   20,
            padding:        "12px 18px",
            boxShadow:      "0 12px 30px rgba(0, 0, 0, 0.4)",
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
                color:         GOLD_LIGHT,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontFamily:    "var(--font-montserrat)",
                display:       "flex",
                alignItems:    "center",
                gap:           6,
              }}
            >
              <Sparkles size={14} color={GOLD} />
              {getImpactBadge()}
            </span>
            <span
              style={{
                fontSize:     11,
                fontWeight:   800,
                color:        DARK_BG,
                fontFamily:   "var(--font-montserrat)",
                background:   `linear-gradient(135deg, ${GOLD} 0%, ${GOLD_LIGHT} 100%)`,
                padding:      "2px 10px",
                borderRadius: 12,
                boxShadow:    "0 2px 8px rgba(201, 168, 76, 0.3)",
              }}
            >
              {progressPercent}%
            </span>
          </div>

          {/* Gliding Progress Track */}
          <div
            style={{
              width:        "100%",
              height:       6,
              background:   "rgba(255,255,255,0.1)",
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
                background:   `linear-gradient(90deg, ${GOLD} 0%, ${GOLD_LIGHT} 100%)`,
                borderRadius: 3,
                boxShadow:    `0 0 12px ${GOLD}`,
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
          padding:        "100px 16px 120px",
          maxWidth:       500,
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
            {/* High-Contrast Frosted Glass Shell */}
            <div
              style={{
                width:                "100%",
                background:           CARD_BG,
                backdropFilter:       "blur(28px)",
                WebkitBackdropFilter: "blur(28px)",
                borderRadius:         24,
                border:               "1px solid rgba(201, 168, 76, 0.35)",
                boxShadow:            "0 24px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(201, 168, 76, 0.08)",
                padding:              step === 0 && session.coverUrl ? "0 0 28px 0" : "32px 24px",
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
            padding:        "16px 20px 24px",
            background:     "linear-gradient(to top, rgba(8, 26, 16, 0.98) 70%, transparent)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            gap:            10,
            zIndex:         30,
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
                background:   "rgba(239, 68, 68, 0.2)",
                border:       "1px solid rgba(239, 68, 68, 0.4)",
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
                  border:         "1px solid rgba(255,255,255,0.2)",
                  background:     "rgba(255,255,255,0.08)",
                  color:          "#fff",
                  cursor:         "pointer",
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
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
                    ? `linear-gradient(135deg, ${GOLD} 0%, ${GOLD_LIGHT} 100%)`
                    : "rgba(255,255,255,0.1)",
                  color:          canNext() && !loading ? DARK_BG : "rgba(255,255,255,0.35)",
                  fontFamily:     "var(--font-montserrat)",
                  fontWeight:     800,
                  fontSize:       15,
                  cursor:         canNext() && !loading ? "pointer" : "not-allowed",
                  boxShadow:      canNext() && !loading ? `0 8px 24px rgba(201,168,76,0.35)` : "none",
                  letterSpacing:  "0.04em",
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  gap:            8,
                  transition:     "all 0.2s ease",
                }}
              >
                {loading ? (
                  <>
                    <span className="fb-spinner-dark" aria-hidden="true" />
                    <span>Submitting…</span>
                  </>
                ) : isLastBeforeSubmit ? (
                  <>
                    <span>Submit My Feedback</span>
                    <Send size={18} />
                  </>
                ) : step === 0 ? (
                  <>
                    <span>Share My Review ✨</span>
                    <ChevronRight size={18} />
                  </>
                ) : (
                  <>
                    <span>Next Milestone</span>
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
          box-shadow: 0 0 0 3px rgba(201, 168, 76, 0.35) !important;
        }
        .fb-spinner-dark {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(10,34,20,0.3);
          border-top-color: #0A2214;
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
  const [heroError,  setHeroError]  = useState(false);

  const showFallback = !session.coverUrl || heroError;

  return (
    <div style={{ textAlign: "center" }}>
      {/* Magazine-Grade Hero Card Banner */}
      {!showFallback ? (
        <div style={{ position: "relative", width: "100%", height: 200, overflow: "hidden", background: "#061A0F" }}>
          {!heroLoaded && (
            <div
              aria-hidden="true"
              style={{
                position:       "absolute",
                inset:          0,
                background:     "linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(201,168,76,0.15) 50%, rgba(255,255,255,0.05) 100%)",
                backgroundSize: "200% 100%",
                animation:      "coverShimmer 1.4s ease-in-out infinite",
              }}
            />
          )}
          <img
            src={session.coverUrl}
            alt={session.name}
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            onLoad={() => setHeroLoaded(true)}
            onError={() => setHeroError(true)}
            style={{
              width:          "100%",
              height:         "100%",
              objectFit:      "cover",
              objectPosition: "center 25%",
              display:        "block",
              opacity:        heroLoaded ? 1 : 0,
              transition:     "opacity 0.4s ease-out",
            }}
          />
          {/* Subtle gradient gradient overlay for high contrast text */}
          <div
            aria-hidden="true"
            style={{
              position:   "absolute",
              inset:      0,
              background: "linear-gradient(to bottom, rgba(10,34,20,0.2) 0%, rgba(10,32,20,0.95) 100%)",
            }}
          />
        </div>
      ) : (
        /* Styled Branded Fallback Header when image fails or missing */
        <div
          style={{
            padding:    "36px 20px 20px",
            background: "linear-gradient(135deg, rgba(201,168,76,0.15) 0%, rgba(46,125,82,0.15) 100%)",
            borderBottom: "1px solid rgba(201,168,76,0.2)",
          }}
        >
          <div
            style={{
              width:          64,
              height:         64,
              borderRadius:   "50%",
              background:     "rgba(201,168,76,0.2)",
              border:         "1.5px solid #C9A84C",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              margin:         "0 auto 16px",
              color:          GOLD,
              boxShadow:      "0 0 20px rgba(201,168,76,0.3)",
            }}
          >
            <GraduationCap size={32} />
          </div>
        </div>
      )}

      {/* Session Title & Speaker Info */}
      <div style={{ padding: showFallback ? "16px 24px 8px" : "20px 24px 8px" }}>
        <div
          style={{
            display:       "inline-flex",
            alignItems:    "center",
            gap:           6,
            padding:       "4px 14px",
            borderRadius:  20,
            background:    "rgba(201,168,76,0.15)",
            border:        "1px solid rgba(201,168,76,0.3)",
            color:         GOLD_LIGHT,
            fontSize:      11,
            fontWeight:    700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom:  12,
            fontFamily:    "var(--font-montserrat)",
          }}
        >
          <Award size={14} color={GOLD} /> PZ Academy Mentorship Session
        </div>

        <h1
          style={{
            fontFamily:    "var(--font-montserrat)",
            fontWeight:    800,
            fontSize:      "clamp(22px, 5vw, 28px)",
            color:         "#fff",
            lineHeight:    1.25,
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
              fontSize:     14,
              fontWeight:   600,
              marginBottom: 16,
              fontFamily:   "var(--font-poppins)",
            }}
          >
            Speaker · {session.speaker}
          </p>
        )}

        <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "16px 0 20px" }} />

        {/* Encouraging Value Proposition */}
        <div
          style={{
            background:   "rgba(255,255,255,0.04)",
            borderRadius: 16,
            padding:      "16px",
            border:       "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <p
            style={{
              color:      "rgba(255,255,255,0.85)",
              fontSize:   14,
              lineHeight: 1.65,
              margin:     0,
            }}
          >
            🤝 <strong>Your feedback directly shapes PZ Academy!</strong> Take 60 seconds to share your thoughts and help our mentors refine future masterclasses.
          </p>
        </div>
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
      <div
        style={{
          display:       "inline-flex",
          alignItems:    "center",
          gap:           6,
          color:         GOLD,
          fontSize:      12,
          fontWeight:    700,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom:  10,
          fontFamily:    "var(--font-montserrat)",
        }}
      >
        <HeartHandshake size={16} /> Welcome to the Reviewer Community
      </div>
      <h2 style={stepHeadingStyle}>What is your full name?</h2>
      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13.5, marginBottom: 20 }}>
        We add your verified review to our mentor recognition program.
      </p>
      <div style={{ position: "relative" }}>
        <User
          size={20}
          color={GOLD}
          style={{ position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)" }}
        />
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && value.trim() && e.currentTarget.blur()}
          placeholder="Enter your name"
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
      <div
        style={{
          display:       "inline-flex",
          alignItems:    "center",
          gap:           6,
          color:         GOLD,
          fontSize:      12,
          fontWeight:    700,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom:  10,
          fontFamily:    "var(--font-montserrat)",
        }}
      >
        <ShieldCheck size={16} /> Verified Feedback Guard
      </div>
      <h2 style={stepHeadingStyle}>What is your email address?</h2>
      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13.5, marginBottom: 20, lineHeight: 1.5 }}>
        Used solely to prevent duplicate reviews. We respect your privacy.
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
          color={GOLD}
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
            borderColor: invalid ? "rgba(252,165,165,0.8)" : (inputStyle.border as string),
          }}
        />
      </div>
      {invalid && (
        <p style={{ color: "#FCA5A5", fontSize: 13, marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <AlertCircle size={14} /> Please enter a valid email address.
        </p>
      )}
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
  
  const reactions = [
    { label: "", emoji: "" },
    { label: "Needs Improvement", emoji: "🙁" },
    { label: "Fair Experience", emoji: "😐" },
    { label: "Good Session", emoji: "🙂" },
    { label: "Great Masterclass!", emoji: "🌟" },
    { label: "Exceptional / Mindblowing!", emoji: "🔥" },
  ];

  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          display:       "inline-flex",
          alignItems:    "center",
          gap:           6,
          color:         GOLD,
          fontSize:      12,
          fontWeight:    700,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom:  12,
          fontFamily:    "var(--font-montserrat)",
        }}
      >
        <Sparkles size={14} /> Question {qNum} of {total}
      </div>

      <h2
        style={{
          fontFamily:   "var(--font-montserrat)",
          fontWeight:   800,
          fontSize:     "clamp(18px, 4.5vw, 23px)",
          color:        "#fff",
          lineHeight:   1.38,
          margin:       "0 auto 32px",
          maxWidth:     400,
        }}
      >
        {question}
      </h2>

      {/* Dynamic Star Buttons */}
      <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 24 }}>
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
              aria-label={`${n} star${n !== 1 ? "s" : ""} — ${reactions[n].label}`}
              className="fb-star"
              style={{
                width:          54,
                height:         54,
                borderRadius:   16,
                background:     active ? "rgba(201, 168, 76, 0.2)" : "rgba(255,255,255,0.06)",
                border:         active ? "1.5px solid #C9A84C" : "1px solid rgba(255,255,255,0.15)",
                cursor:         "pointer",
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                color:          active ? GOLD : "rgba(255,255,255,0.3)",
                boxShadow:      active ? "0 0 24px rgba(201, 168, 76, 0.35)" : "none",
                transition:     "all 0.15s ease",
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

      {/* Animated Reaction Badge Pill */}
      <div style={{ minHeight: 36 }}>
        <AnimatePresence mode="wait">
          {display > 0 && (
            <motion.div
              key={display}
              initial={{ opacity: 0, scale: 0.9, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -6 }}
              style={{
                display:       "inline-flex",
                alignItems:    "center",
                gap:           8,
                padding:       "6px 18px",
                borderRadius:  24,
                background:    "rgba(201, 168, 76, 0.2)",
                border:        "1.5px solid rgba(201, 168, 76, 0.4)",
                color:         GOLD_LIGHT,
                fontFamily:    "var(--font-montserrat)",
                fontWeight:    700,
                fontSize:      13,
                letterSpacing: "0.04em",
              }}
            >
              <span style={{ fontSize: 16 }}>{reactions[display].emoji}</span>
              <span>{reactions[display].label}</span>
            </motion.div>
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
      <div
        style={{
          display:       "inline-flex",
          alignItems:    "center",
          gap:           6,
          color:         GOLD,
          fontSize:      12,
          fontWeight:    700,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom:  12,
          fontFamily:    "var(--font-montserrat)",
        }}
      >
        <Video size={16} /> Question {qNum} of {total} (Optional Studio Clip)
      </div>
      <h2 style={{ ...stepHeadingStyle, marginBottom: 16 }}>{question}</h2>

      {/* Video Studio Element */}
      <video
        ref={videoRef}
        playsInline
        style={{
          width:        "100%",
          borderRadius: 16,
          background:   "#000",
          border:       "1.5px solid rgba(201,168,76,0.3)",
          display:      vState === "recording" || vState === "previewing" ? "block" : "none",
          marginBottom: 20,
          maxHeight:    260,
          objectFit:    "cover",
          boxShadow:    "0 12px 30px rgba(0,0,0,0.5)",
        }}
      />

      {vState === "idle" && (
        <>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 13.5, marginBottom: 24, lineHeight: 1.6 }}>
            Record a quick video shoutout for our mentors (up to 30s). <span style={{ opacity: 0.8, color: GOLD }}>Optional — tap Next Milestone to skip.</span>
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
              <span style={{ fontWeight: 700, color: "#fff", fontSize: 14 }}>Record Clip</span>
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
              <span style={{ fontWeight: 700, color: "#fff", fontSize: 14 }}>Upload Video</span>
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

      {vState === "recording" && (
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              display:       "inline-flex",
              alignItems:    "center",
              gap:           8,
              background:    "rgba(239,68,68,0.2)",
              border:        "1px solid rgba(239,68,68,0.4)",
              borderRadius:  20,
              padding:       "6px 16px",
              color:         "#fff",
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

      {vState === "previewing" && (
        <>
          <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
            <button onClick={doUpload} style={primarySmallBtn}>
              <CheckCircle2 size={16} /> Attach This Video
            </button>
            <button onClick={reset} style={ghostSmallBtn}>
              <RotateCcw size={16} /> Re-record
            </button>
          </div>
          {errMsg && <p style={errStyle}>{errMsg}</p>}
        </>
      )}

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
          <p style={{ color: "rgba(255,255,255,0.9)", fontSize: 14, margin: 0, fontWeight: 500 }}>
            Uploading your review video…
          </p>
        </div>
      )}

      {vState === "done" && (
        <div style={{ textAlign: "center", padding: "12px 0" }}>
          <div
            style={{
              display:       "inline-flex",
              alignItems:    "center",
              gap:           8,
              background:    "rgba(201,168,76,0.2)",
              border:        "1px solid rgba(201,168,76,0.4)",
              borderRadius:  20,
              padding:       "8px 18px",
              color:         GOLD_LIGHT,
              fontSize:      14,
              fontWeight:    600,
              marginBottom:  16,
            }}
          >
            <CheckCircle2 size={18} color={GOLD} /> Video Review Attached!
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
          border: 2px solid rgba(201,168,76,0.3);
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
      <div
        style={{
          display:       "inline-flex",
          alignItems:    "center",
          gap:           6,
          color:         GOLD,
          fontSize:      12,
          fontWeight:    700,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom:  10,
          fontFamily:    "var(--font-montserrat)",
        }}
      >
        <MessageSquare size={16} /> Final Touch
      </div>
      <h2 style={{ ...stepHeadingStyle, marginBottom: 8 }}>Any final feedback or suggestions?</h2>
      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13.5, marginBottom: 22, lineHeight: 1.6 }}>
        Optional — share takeaways or specific highlights you enjoyed!
      </p>
      <div style={{ position: "relative" }}>
        <MessageSquare
          size={20}
          color={GOLD}
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
    <div style={{ textAlign: "center", padding: "16px 0 8px" }}>
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.1, duration: 0.6, type: "spring", bounce: 0.5 }}
        style={{
          width:          88,
          height:         88,
          borderRadius:   "50%",
          background:     "rgba(201, 168, 76, 0.2)",
          border:         "2px solid #C9A84C",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          margin:         "0 auto 24px",
          color:          GOLD_LIGHT,
          boxShadow:      "0 0 35px rgba(201, 168, 76, 0.4)",
        }}
      >
        <Award size={46} color={GOLD} />
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
        You&apos;re Awesome{firstName ? `, ${firstName}` : ""}! 🎉
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        style={{ color: "rgba(255,255,255,0.8)", fontSize: 15, lineHeight: 1.7, maxWidth: 380, margin: "0 auto 24px" }}
      >
        Your review has been submitted successfully! Your feedback is immensely valuable in helping PZ Academy mentors deliver world-class training.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.45 }}
        style={{
          display:       "inline-flex",
          alignItems:    "center",
          gap:           8,
          padding:       "10px 20px",
          borderRadius:  20,
          background:    "rgba(255,255,255,0.06)",
          border:        "1px solid rgba(255,255,255,0.15)",
          color:         GOLD_LIGHT,
          fontSize:      13,
          fontWeight:    600,
        }}
      >
        <GraduationCap size={18} color={GOLD} /> Verified Reviewer Status Granted
      </motion.div>
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const stepHeadingStyle: React.CSSProperties = {
  fontFamily:    "var(--font-montserrat)",
  fontWeight:    800,
  fontSize:      "clamp(22px, 5vw, 27px)",
  color:         "#fff",
  marginBottom:  20,
  letterSpacing: "-0.01em",
};

const inputStyle: React.CSSProperties = {
  width:        "100%",
  background:   "rgba(255,255,255,0.08)",
  border:       "1.5px solid rgba(201,168,76,0.3)",
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
  padding:        "22px 16px",
  borderRadius:   18,
  border:         "1.5px solid rgba(201,168,76,0.3)",
  background:     "rgba(255,255,255,0.05)",
  color:          "#fff",
  fontFamily:     "var(--font-poppins)",
  transition:     "all 0.2s ease",
};

const iconBadgeStyle: React.CSSProperties = {
  width:          44,
  height:         44,
  borderRadius:   12,
  background:     "rgba(201,168,76,0.15)",
  border:         "1px solid rgba(201,168,76,0.3)",
  display:        "flex",
  alignItems:     "center",
  justifyContent: "center",
  marginBottom:   4,
};

const stopBtnStyle: React.CSSProperties = {
  display:        "inline-flex",
  alignItems:     "center",
  gap:            8,
  background:     "rgba(239,68,68,0.25)",
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
  background:     `linear-gradient(135deg, ${GOLD} 0%, ${GOLD_LIGHT} 100%)`,
  color:          DARK_BG,
  fontWeight:     800,
  fontSize:       14,
  cursor:         "pointer",
  fontFamily:     "var(--font-montserrat)",
  boxShadow:      "0 4px 16px rgba(201,168,76,0.3)",
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
  background:     "rgba(255,255,255,0.06)",
  color:          "rgba(255,255,255,0.85)",
  fontSize:       14,
  cursor:         "pointer",
  fontFamily:     "var(--font-poppins)",
};

const errStyle: React.CSSProperties = {
  color:     "#FCA5A5",
  fontSize:  13,
  marginTop: 12,
};
