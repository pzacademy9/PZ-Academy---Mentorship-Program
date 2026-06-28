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
  AlertCircle,
  Square,
  RotateCcw,
  Send,
  Award,
} from "lucide-react";
import type { PublicSession } from "@/lib/gas";

const LOGO_URL  = "https://pharmacozyme.com/wp-content/uploads/2026/04/PZ-Academy-logo.png";
const DARK_BG   = "#0A2214";
const CARD_BG   = "rgba(10, 32, 20, 0.92)";
const GOLD      = "#C9A84C";
const GOLD_LIGHT= "#F3E5AB";

/** Email shape validator */
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

/** Web Audio API sound synthesizer for instant zero-latency premium audio feedback */
const playSound = (type: "pop" | "star" | "success") => {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") ctx.resume();

    if (type === "pop" || type === "star") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      const freq = type === "star" ? 587.33 : 440;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.4, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } else if (type === "success") {
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.07);
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.07);
        gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + i * 0.07 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.07 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.07);
        osc.stop(ctx.currentTime + i * 0.07 + 0.3);
      });
    }
  } catch {
    // Ignore audio context blocks silently
  }
};

interface Props {
  session: PublicSession;
}

type StarAnswers  = Record<number, number>;
type VideoAnswers = Record<number, string>;

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 30 : -30,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.28, ease: "easeOut" as const },
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 30 : -30,
    opacity: 0,
    transition: { duration: 0.2, ease: "easeIn" as const },
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
  const [website,      setWebsite]      = useState("");
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
      playSound("pop");
      setDirection(1);
      setStep((s) => s + 1);
    }
  };

  const prev = () => {
    if (step > 0) {
      playSound("pop");
      setDirection(-1);
      setStep((s) => s - 1);
    }
  };

  const setStar = (index: number, v: number) => {
    playSound("star");
    setStarAnswers((prev) => ({ ...prev, [index]: v }));
    setDirection(1);
    setTimeout(() => setStep((s) => s + 1), 350);
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
      playSound("success");
      setDirection(1);
      setStep(THANKYOU_STEP);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const isLastBeforeSubmit = step === COMMENTS_STEP;
  const progressPercent    = Math.round((Math.min(step, COMMENTS_STEP) / COMMENTS_STEP) * 100);

  return (
    <div
      style={{
        background:    DARK_BG,
        backgroundImage:"radial-gradient(circle at 50% 0%, #154228 0%, #0A2214 80%)",
        minHeight:     "100vh",
        display:       "flex",
        flexDirection: "column",
        overflowX:     "hidden",
        fontFamily:    "var(--font-poppins)",
        position:      "relative",
        color:         "#fff",
      }}
    >
      {/* Top Header & Logo */}
      <header
        style={{
          padding:        "20px 16px 0",
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          gap:            12,
          zIndex:         10,
        }}
      >
        <img
          src={LOGO_URL}
          alt="PZ Academy Logo"
          style={{ height: 42, width: "auto", objectFit: "contain" }}
        />

        {!done && (
          <div
            style={{
              width:          "100%",
              maxWidth:       440,
              display:        "flex",
              alignItems:     "center",
              gap:            10,
              background:     "rgba(255,255,255,0.06)",
              padding:        "6px 14px",
              borderRadius:   20,
              border:         "1px solid rgba(201, 168, 76, 0.25)",
            }}
          >
            <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.1)", borderRadius: 3, overflow: "hidden" }}>
              <motion.div
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.3 }}
                style={{ height: "100%", background: `linear-gradient(90deg, ${GOLD} 0%, ${GOLD_LIGHT} 100%)` }}
              />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: GOLD_LIGHT, fontFamily: "var(--font-montserrat)" }}>
              {progressPercent}%
            </span>
          </div>
        )}
      </header>

      {/* Form Card Body */}
      <main
        style={{
          flex:           1,
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          justifyContent: "center",
          padding:        "20px 16px 100px",
          maxWidth:       460,
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
            <div
              style={{
                width:                "100%",
                background:           CARD_BG,
                backdropFilter:       "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                borderRadius:         24,
                border:               "1.5px solid rgba(201, 168, 76, 0.35)",
                boxShadow:            "0 20px 50px rgba(0,0,0,0.5)",
                padding:              "28px 20px",
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
                  value={starAnswers[qi]}
                  onSelect={(v) => setStar(qi, v)}
                />
              )}
              {isVideo && (
                <VideoStep
                  question={session.questions[qi].text}
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

      {/* Floating Control Footer */}
      {!done && (
        <footer
          style={{
            position:       "fixed",
            bottom:         0,
            left:           0,
            right:          0,
            padding:        "16px 20px 20px",
            background:     "linear-gradient(to top, rgba(10, 34, 20, 0.98) 70%, transparent)",
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            gap:            8,
            zIndex:         20,
          }}
        >
          {error && (
            <div style={{ color: "#FCA5A5", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 440 }}>
            {step > 0 && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
                onClick={prev}
                aria-label="Previous"
                style={{
                  flex:           "0 0 48px",
                  height:         48,
                  borderRadius:   24,
                  border:         "1px solid rgba(255,255,255,0.2)",
                  background:     "rgba(255,255,255,0.08)",
                  color:          "#fff",
                  cursor:         "pointer",
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                }}
              >
                <ChevronLeft size={20} />
              </motion.button>
            )}

            {!isRating && (
              <motion.button
                whileHover={canNext() && !loading ? { scale: 1.03 } : {}}
                whileTap={canNext() && !loading ? { scale: 0.95 } : {}}
                onClick={isLastBeforeSubmit ? submit : next}
                disabled={!canNext() || loading}
                style={{
                  flex:           1,
                  height:         48,
                  borderRadius:   24,
                  border:         "none",
                  background:     canNext() && !loading
                    ? `linear-gradient(135deg, ${GOLD} 0%, ${GOLD_LIGHT} 100%)`
                    : "rgba(255,255,255,0.1)",
                  color:          canNext() && !loading ? DARK_BG : "rgba(255,255,255,0.3)",
                  fontFamily:     "var(--font-montserrat)",
                  fontWeight:     800,
                  fontSize:       14,
                  cursor:         canNext() && !loading ? "pointer" : "not-allowed",
                  boxShadow:      canNext() && !loading ? `0 6px 20px rgba(201,168,76,0.3)` : "none",
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  gap:            6,
                }}
              >
                {loading ? (
                  <span>Submitting…</span>
                ) : isLastBeforeSubmit ? (
                  <>
                    <span>Submit Review</span>
                    <Send size={16} />
                  </>
                ) : step === 0 ? (
                  <>
                    <span>Start Review ✨</span>
                    <ChevronRight size={16} />
                  </>
                ) : (
                  <>
                    <span>Continue</span>
                    <ChevronRight size={16} />
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
      `}</style>
    </div>
  );
}

// ── Step components ────────────────────────────────────────────────────────────

function IntroStep({ session }: { session: PublicSession }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div style={{ textAlign: "center" }}>
      {/* Cover Image Banner (Instant display without stuck loading screens) */}
      {session.coverUrl && !imgError && (
        <div style={{ width: "100%", height: 160, borderRadius: 16, overflow: "hidden", marginBottom: 20, background: "#000" }}>
          <img
            src={session.coverUrl}
            alt={session.name}
            loading="eager"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      )}

      <h1 style={{ fontFamily: "var(--font-montserrat)", fontWeight: 800, fontSize: 22, color: "#fff", marginBottom: 6 }}>
        {session.name}
      </h1>

      {session.speaker && (
        <p style={{ color: GOLD, fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
          Speaker · {session.speaker}
        </p>
      )}

      <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 14, lineHeight: 1.5, margin: "0 auto", maxWidth: 320 }}>
        Share your quick feedback to help us improve future sessions!
      </p>
    </div>
  );
}

function NameStep({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <h2 style={stepHeadingStyle}>Your Name</h2>
      <div style={{ position: "relative" }}>
        <User size={18} color={GOLD} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)" }} />
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && value.trim() && e.currentTarget.blur()}
          placeholder="Enter your name"
          className="fb-input"
          style={{ ...inputStyle, paddingLeft: 44 }}
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
      <h2 style={stepHeadingStyle}>Your Email</h2>
      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginBottom: 16 }}>
        Used solely to verify your submission.
      </p>
      <input
        type="text"
        value={honeypot}
        onChange={(e) => onHoneypot(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
      />
      <div style={{ position: "relative" }}>
        <Mail size={18} color={GOLD} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)" }} />
        <input
          autoFocus
          type="email"
          inputMode="email"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="you@example.com"
          className="fb-input"
          style={{ ...inputStyle, paddingLeft: 44, borderColor: invalid ? "#FCA5A5" : (inputStyle.border as string) }}
        />
      </div>
    </div>
  );
}

function RatingStep({
  question, value, onSelect,
}: {
  question: string; value: number | undefined; onSelect: (v: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? value ?? 0;
  const labels  = ["", "Poor", "Fair", "Good", "Great", "Excellent!"];

  return (
    <div style={{ textAlign: "center" }}>
      <h2 style={{ fontFamily: "var(--font-montserrat)", fontWeight: 700, fontSize: 18, color: "#fff", marginBottom: 24, lineHeight: 1.4 }}>
        {question}
      </h2>

      {/* Tactile Star Buttons for Mobile Touch and PC Mouse */}
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = n <= display;
          return (
            <motion.button
              key={n}
              whileHover={{ scale: 1.2, rotate: 4 }}
              whileTap={{ scale: 1.25, rotate: -4 }}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect(n)}
              aria-label={`${n} stars`}
              style={{
                width:          48,
                height:         48,
                borderRadius:   14,
                background:     active ? "rgba(201, 168, 76, 0.2)" : "rgba(255,255,255,0.06)",
                border:         active ? "1.5px solid #C9A84C" : "1px solid rgba(255,255,255,0.15)",
                cursor:         "pointer",
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                color:          active ? GOLD : "rgba(255,255,255,0.3)",
                boxShadow:      active ? "0 0 18px rgba(201, 168, 76, 0.3)" : "none",
                padding:        0,
                touchAction:    "manipulation",
              }}
            >
              <Star size={26} fill={active ? GOLD : "transparent"} />
            </motion.button>
          );
        })}
      </div>

      <div style={{ minHeight: 24, color: GOLD_LIGHT, fontWeight: 700, fontSize: 13, fontFamily: "var(--font-montserrat)" }}>
        {labels[display]}
      </div>
    </div>
  );
}

type VState = "idle" | "recording" | "previewing" | "uploading" | "done";

function VideoStep({
  question, value, onChange, sessionId, sessionName, participantName,
}: {
  question: string; value: string; onChange: (url: string) => void;
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
        videoRef.current.play();
      }

      chunksRef.current = [];
      const mimeType =
        MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus") ? "video/webm;codecs=vp8,opus" : "video/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const recorded = new Blob(chunksRef.current, { type: "video/webm" });
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
      setErrMsg("Camera access denied.");
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setBlob(file);
    setObjectUrl(url);
    setVState("previewing");
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src       = url;
      videoRef.current.controls  = true;
    }
  };

  const doUpload = async () => {
    if (!blob) return;
    setVState("uploading");
    try {
      const formData = new FormData();
      formData.append("video",           blob, "feedback.webm");
      formData.append("sessionId",       sessionId);
      formData.append("sessionName",     sessionName);
      formData.append("participantName", participantName);

      const res  = await fetch("/api/upload-video", { method: "POST", body: formData });
      const json: { ok: boolean; data?: { url: string } } = await res.json();
      if (!json.ok || !json.data?.url) throw new Error();

      onChange(json.data.url);
      setVState("done");
    } catch {
      setErrMsg("Upload failed.");
      setVState("previewing");
    }
  };

  const reset = () => {
    setVState("idle");
    onChange("");
  };

  return (
    <div>
      <h2 style={{ fontFamily: "var(--font-montserrat)", fontWeight: 700, fontSize: 18, color: "#fff", marginBottom: 16 }}>
        {question}
      </h2>

      <video
        ref={videoRef}
        playsInline
        style={{
          width: "100%", borderRadius: 12, background: "#000",
          display: vState === "recording" || vState === "previewing" ? "block" : "none",
          marginBottom: 16, maxHeight: 220, objectFit: "cover",
        }}
      />

      {vState === "idle" && (
        <div style={{ display: "flex", gap: 10 }}>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.95 }} onClick={startRecording} style={btnOptionStyle}>
            <Camera size={20} color={GOLD} /> <span>Record Clip</span>
          </motion.button>
          <motion.label whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.95 }} style={{ ...btnOptionStyle, cursor: "pointer" }}>
            <UploadCloud size={20} color={GOLD} /> <span>Upload Video</span>
            <input type="file" accept="video/*" style={{ display: "none" }} onChange={handleFileSelect} />
          </motion.label>
        </div>
      )}

      {vState === "recording" && (
        <div style={{ textAlign: "center" }}>
          <p style={{ color: GOLD, fontSize: 13, marginBottom: 10 }}>{countdown}s remaining</p>
          <button onClick={stopRecording} style={{ background: "#EF4444", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 20 }}>
            Stop Recording
          </button>
        </div>
      )}

      {vState === "previewing" && (
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={doUpload} style={btnPrimarySmall}>Use Video</button>
          <button onClick={reset} style={btnGhostSmall}>Re-record</button>
        </div>
      )}

      {vState === "done" && (
        <div style={{ textAlign: "center", color: GOLD }}>
          ✓ Video attached! <button onClick={reset} style={{ background: "none", border: "none", color: "#fff", textDecoration: "underline", marginLeft: 8 }}>Change</button>
        </div>
      )}
      {errMsg && <p style={{ color: "#FCA5A5", fontSize: 13, marginTop: 8 }}>{errMsg}</p>}
    </div>
  );
}

function CommentsStep({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <h2 style={stepHeadingStyle}>Any Comments?</h2>
      <div style={{ position: "relative" }}>
        <MessageSquare size={18} color={GOLD} style={{ position: "absolute", left: 16, top: 16 }} />
        <textarea
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Optional comments..."
          rows={4}
          className="fb-input"
          style={{ ...inputStyle, paddingLeft: 44, resize: "vertical" }}
        />
      </div>
    </div>
  );
}

function ThankyouStep({ name }: { name: string }) {
  return (
    <div style={{ textAlign: "center", padding: "12px 0" }}>
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(201,168,76,0.2)", border: "2px solid #C9A84C", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: GOLD }}>
        <Award size={36} />
      </motion.div>
      <h1 style={{ fontFamily: "var(--font-montserrat)", fontWeight: 800, fontSize: 26, color: "#fff", marginBottom: 8 }}>
        Thank You{name ? `, ${name.split(" ")[0]}` : ""}!
      </h1>
      <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 14 }}>
        Your review has been saved.
      </p>
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const stepHeadingStyle: React.CSSProperties = {
  fontFamily: "var(--font-montserrat)",
  fontWeight: 800,
  fontSize:   20,
  color:      "#fff",
  marginBottom: 16,
};

const inputStyle: React.CSSProperties = {
  width:        "100%",
  background:   "rgba(255,255,255,0.08)",
  border:       "1.5px solid rgba(201,168,76,0.3)",
  borderRadius: 14,
  padding:      "14px 16px",
  color:        "#fff",
  fontSize:     15,
  fontFamily:   "var(--font-poppins)",
  outline:      "none",
  boxSizing:    "border-box",
};

const btnOptionStyle: React.CSSProperties = {
  flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "16px", borderRadius: 14, border: "1.5px solid rgba(201,168,76,0.3)", background: "rgba(255,255,255,0.05)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600,
};

const btnPrimarySmall: React.CSSProperties = {
  flex: 1, padding: "12px", borderRadius: 12, border: "none", background: GOLD, color: DARK_BG, fontWeight: 700, cursor: "pointer",
};

const btnGhostSmall: React.CSSProperties = {
  flex: 1, padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.2)", background: "none", color: "#fff", cursor: "pointer",
};
