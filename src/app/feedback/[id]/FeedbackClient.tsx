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
  Square,
  RotateCcw,
  Send,
  Award,
  ShieldCheck,
  Check,
} from "lucide-react";
import type { PublicSession } from "@/lib/gas";

const LOGO_URL  = "https://pharmacozyme.com/wp-content/uploads/2026/04/PZ-Academy-logo.png";
const DARK_BG   = "#0A2214";
const CARD_BG   = "rgba(10, 32, 20, 0.92)";
const GOLD      = "#C9A84C";
const GOLD_LIGHT= "#F3E5AB";

/** Email shape validator */
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

/** Web Audio API sound synthesizer for instant zero-latency audio feedback */
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
    // Ignore audio context blocks
  }
};

interface Props {
  session: PublicSession;
}

type StarAnswers  = Record<number, number>;
type VideoAnswers = Record<number, string>;
type VideoStates  = Record<number, "idle" | "recording" | "previewing" | "uploading" | "done">;

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 35 : -35,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.3, ease: "easeOut" as const },
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 35 : -35,
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
  const [videoStates,  setVideoStates]  = useState<VideoStates>({});
  const [comments,     setComments]     = useState("");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");

  const done = step === THANKYOU_STEP;

  const qi       = step >= 3 && step < COMMENTS_STEP ? step - 3 : -1;
  const isRating = qi >= 0 && session.questions[qi]?.type === "stars";
  const isVideo  = qi >= 0 && session.questions[qi]?.type === "video";

  const currentVideoState = qi >= 0 ? (videoStates[qi] ?? "idle") : "idle";

  const canNext = useCallback((): boolean => {
    if (step === 1) return name.trim().length > 0;
    if (step === 2) return emailOk(email);
    if (isRating)   return starAnswers[qi] != null;
    if (isVideo)    return currentVideoState !== "uploading";
    return true;
  }, [step, name, email, starAnswers, isRating, isVideo, qi, currentVideoState]);

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
    setTimeout(() => setStep((s) => s + 1), 380);
  };

  const setVideoAnswer = (index: number, url: string, state: "idle" | "recording" | "previewing" | "uploading" | "done") => {
    setVideoAnswers((prev) => ({ ...prev, [index]: url }));
    setVideoStates((prev) => ({ ...prev, [index]: state }));
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
      {/* Professional Brand Header */}
      <header
        style={{
          padding:        "18px 20px",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          maxWidth:       600,
          margin:         "0 auto",
          width:          "100%",
          zIndex:         20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src={LOGO_URL}
            alt="PZ Academy Logo"
            style={{ height: 38, width: "auto", objectFit: "contain" }}
          />
        </div>

        {!done && (
          <div
            style={{
              display:       "flex",
              alignItems:    "center",
              gap:           10,
              background:    "rgba(255,255,255,0.06)",
              padding:       "6px 14px",
              borderRadius:  20,
              border:        "1px solid rgba(201, 168, 76, 0.3)",
            }}
          >
            <div style={{ width: 60, height: 5, background: "rgba(255,255,255,0.12)", borderRadius: 3, overflow: "hidden" }}>
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
          padding:        "10px 16px 110px",
          maxWidth:       480,
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
                boxShadow:            "0 24px 60px rgba(0,0,0,0.5)",
                padding:              "28px 24px",
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
                  onChange={(url, st) => setVideoAnswer(qi, url, st)}
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
            padding:        "16px 20px 24px",
            background:     "linear-gradient(to top, rgba(10, 34, 20, 0.98) 75%, transparent)",
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            gap:            10,
            zIndex:         30,
          }}
        >
          {error && (
            <div style={{ color: "#FCA5A5", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 12, width: "100%", maxWidth: 440 }}>
            {step > 0 && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
                onClick={prev}
                aria-label="Previous step"
                style={{
                  flex:           "0 0 50px",
                  height:         50,
                  borderRadius:   25,
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
                whileTap={canNext() && !loading ? { scale: 0.95 } : {}}
                onClick={isLastBeforeSubmit ? submit : next}
                disabled={!canNext() || loading}
                style={{
                  flex:           1,
                  height:         50,
                  borderRadius:   25,
                  border:         "none",
                  background:     canNext() && !loading
                    ? `linear-gradient(135deg, ${GOLD} 0%, ${GOLD_LIGHT} 100%)`
                    : "rgba(255,255,255,0.1)",
                  color:          canNext() && !loading ? DARK_BG : "rgba(255,255,255,0.35)",
                  fontFamily:     "var(--font-montserrat)",
                  fontWeight:     800,
                  fontSize:       14,
                  cursor:         canNext() && !loading ? "pointer" : "not-allowed",
                  boxShadow:      canNext() && !loading ? `0 6px 20px rgba(201,168,76,0.35)` : "none",
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  gap:            8,
                }}
              >
                {loading ? (
                  <span>Submitting…</span>
                ) : isLastBeforeSubmit ? (
                  <>
                    <span>Submit Feedback</span>
                    <Send size={16} />
                  </>
                ) : step === 0 ? (
                  <>
                    <span>Share Feedback ✨</span>
                    <ChevronRight size={16} />
                  </>
                ) : isVideo && currentVideoState === "done" ? (
                  <>
                    <span>Continue with Video</span>
                    <ChevronRight size={16} />
                  </>
                ) : isVideo ? (
                  <>
                    <span>Skip Video & Continue</span>
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
      {/* Session Cover Image */}
      {session.coverUrl && !imgError && (
        <div style={{ width: "100%", height: 170, borderRadius: 16, overflow: "hidden", marginBottom: 20, background: "#000", border: "1px solid rgba(201,168,76,0.2)" }}>
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

      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 12, background: "rgba(201,168,76,0.15)", color: GOLD_LIGHT, fontSize: 11, fontWeight: 700, textTransform: "uppercase", marginBottom: 10, fontFamily: "var(--font-montserrat)" }}>
        <Award size={14} color={GOLD} /> PZ Academy Session
      </div>

      <h1 style={{ fontFamily: "var(--font-montserrat)", fontWeight: 800, fontSize: 24, color: "#fff", marginBottom: 6, letterSpacing: "-0.01em" }}>
        {session.name}
      </h1>

      {session.speaker && (
        <p style={{ color: GOLD, fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
          Speaker · {session.speaker}
        </p>
      )}

      <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 14, lineHeight: 1.5, margin: "0 auto", maxWidth: 340 }}>
        Your quick feedback helps us make every PZ Academy session better!
      </p>
    </div>
  );
}

function NameStep({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div style={badgeStyle}>Step 1 of 2</div>
      <h2 style={stepHeadingStyle}>What is your name?</h2>
      <div style={{ position: "relative" }}>
        <User size={18} color={GOLD} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)" }} />
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && value.trim() && e.currentTarget.blur()}
          placeholder="Enter your full name"
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
      <div style={badgeStyle}>Step 2 of 2</div>
      <h2 style={stepHeadingStyle}>And your email address?</h2>
      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginBottom: 16 }}>
        Used to prevent duplicate submissions.
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
      <div style={badgeStyle}>Question {qNum} of {total}</div>
      <h2 style={{ fontFamily: "var(--font-montserrat)", fontWeight: 700, fontSize: 19, color: "#fff", marginBottom: 24, lineHeight: 1.35 }}>
        {question}
      </h2>

      <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 18 }}>
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
                width:          50,
                height:         50,
                borderRadius:   15,
                background:     active ? "rgba(201, 168, 76, 0.2)" : "rgba(255,255,255,0.06)",
                border:         active ? "1.5px solid #C9A84C" : "1px solid rgba(255,255,255,0.15)",
                cursor:         "pointer",
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                color:          active ? GOLD : "rgba(255,255,255,0.3)",
                boxShadow:      active ? "0 0 20px rgba(201, 168, 76, 0.35)" : "none",
                padding:        0,
                touchAction:    "manipulation",
              }}
            >
              <Star size={26} fill={active ? GOLD : "transparent"} />
            </motion.button>
          );
        })}
      </div>

      <div style={{ minHeight: 24, color: GOLD_LIGHT, fontWeight: 700, fontSize: 14, fontFamily: "var(--font-montserrat)" }}>
        {labels[display]}
      </div>
    </div>
  );
}

type VState = "idle" | "recording" | "previewing" | "uploading" | "done";

function VideoStep({
  question, qNum, total, value, onChange, sessionId, sessionName, participantName,
}: {
  question: string; qNum: number; total: number;
  value: string; onChange: (url: string, state: VState) => void;
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

  const updateState = (st: VState, url: string = value) => {
    setVState(st);
    onChange(url, st);
  };

  /** Hardware-optimised camera stream auto-requesting 720p/1080p 30fps to avoid 4K file sizes */
  const startRecording = async () => {
    setErrMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width:     { ideal: 1280, max: 1920 },
          height:    { ideal: 720,  max: 1080 },
          frameRate: { ideal: 30,   max: 30 },
        },
        audio: true,
      });
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

      // 1.5 Mbps bitrate cap for compressed ~5MB 30-second clips
      const recorderOptions: MediaRecorderOptions = {
        mimeType,
        videoBitsPerSecond: 1500000,
      };

      const recorder = new MediaRecorder(stream, recorderOptions);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const recorded = new Blob(chunksRef.current, { type: mimeType.split(";")[0] });
        const url      = URL.createObjectURL(recorded);
        setBlob(recorded);
        setObjectUrl(url);
        updateState("previewing");
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
      updateState("recording");
      setCountdown(30);

      let remaining = 30;
      timerRef.current = setInterval(() => {
        remaining -= 1;
        setCountdown(remaining);
        if (remaining <= 0) stopRecording();
      }, 1000);
    } catch {
      setErrMsg("Camera access denied. You can upload a file instead.");
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setErrMsg("File is too large (max 25 MB). Try recording a short clip instead.");
      return;
    }
    const url = URL.createObjectURL(file);
    setBlob(file);
    setObjectUrl(url);
    updateState("previewing");
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src       = url;
      videoRef.current.controls  = true;
    }
  };

  const doUpload = async () => {
    if (!blob) return;
    updateState("uploading");
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

      playSound("success");
      updateState("done", json.data.url);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Upload failed. Please try again.");
      updateState("previewing");
    }
  };

  const reset = () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setObjectUrl(null);
    setBlob(null);
    setErrMsg("");
    updateState("idle", "");
    if (videoRef.current) {
      videoRef.current.src       = "";
      videoRef.current.srcObject = null;
      videoRef.current.controls  = false;
    }
  };

  return (
    <div>
      <div style={badgeStyle}>Question {qNum} of {total}</div>
      <h2 style={{ fontFamily: "var(--font-montserrat)", fontWeight: 700, fontSize: 18, color: "#fff", marginBottom: 12 }}>
        {question}
      </h2>
      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginBottom: 18 }}>
        Optional video response (up to 30s). Tap Continue to skip.
      </p>

      {/* Video Element Player */}
      <video
        ref={videoRef}
        playsInline
        style={{
          width:        "100%",
          borderRadius: 14,
          background:   "#000",
          border:       "1px solid rgba(201,168,76,0.3)",
          display:      vState === "recording" || vState === "previewing" ? "block" : "none",
          marginBottom: 16,
          maxHeight:    220,
          objectFit:    "cover",
        }}
      />

      {vState === "idle" && (
        <div style={{ display: "flex", gap: 10 }}>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.95 }} onClick={startRecording} style={btnOptionStyle}>
            <Camera size={20} color={GOLD} /> <span>Record Clip</span>
          </motion.button>
          <motion.label whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.95 }} style={{ ...btnOptionStyle, cursor: "pointer" }}>
            <UploadCloud size={20} color={GOLD} /> <span>Upload File</span>
            <input type="file" accept="video/*" style={{ display: "none" }} onChange={handleFileSelect} />
          </motion.label>
        </div>
      )}

      {vState === "recording" && (
        <div style={{ textAlign: "center" }}>
          <p style={{ color: GOLD, fontSize: 13, marginBottom: 12, fontWeight: 600 }}>⏺ Recording (1080p/720p 30fps): {countdown}s</p>
          <button onClick={stopRecording} style={{ background: "#EF4444", color: "#fff", border: "none", padding: "10px 24px", borderRadius: 20, cursor: "pointer", fontWeight: 700 }}>
            Stop Recording
          </button>
        </div>
      )}

      {vState === "previewing" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={doUpload} style={btnPrimarySmall}>
            <Check size={18} /> Upload & Attach Video
          </button>
          <button onClick={reset} style={btnGhostSmall}>Re-record / Cancel</button>
        </div>
      )}

      {vState === "uploading" && (
        <div style={{ textAlign: "center", padding: "16px 0", color: GOLD }}>
          Uploading & compressing video...
        </div>
      )}

      {vState === "done" && (
        <div style={{ textAlign: "center", background: "rgba(201,168,76,0.15)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 14, padding: "14px", color: GOLD_LIGHT }}>
          <div style={{ fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <CheckCircle2 size={18} color={GOLD} /> Video Attached Successfully!
          </div>
          <button onClick={reset} style={{ background: "none", border: "none", color: "#fff", textDecoration: "underline", cursor: "pointer", fontSize: 12, marginTop: 4 }}>
            Re-record or change video
          </button>
        </div>
      )}

      {errMsg && <p style={{ color: "#FCA5A5", fontSize: 13, marginTop: 10 }}>{errMsg}</p>}
    </div>
  );
}

function CommentsStep({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <h2 style={stepHeadingStyle}>Any Final Comments?</h2>
      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginBottom: 16 }}>Optional feedback or takeaways.</p>
      <div style={{ position: "relative" }}>
        <MessageSquare size={18} color={GOLD} style={{ position: "absolute", left: 16, top: 16 }} />
        <textarea
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Write your comments..."
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
    <div style={{ textAlign: "center", padding: "16px 0" }}>
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(201,168,76,0.2)", border: "2px solid #C9A84C", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: GOLD }}>
        <Award size={36} />
      </motion.div>
      <h1 style={{ fontFamily: "var(--font-montserrat)", fontWeight: 800, fontSize: 26, color: "#fff", marginBottom: 8 }}>
        Thank You{name ? `, ${name.split(" ")[0]}` : ""}!
      </h1>
      <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 14 }}>
        Your review has been submitted. We appreciate your feedback!
      </p>
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const badgeStyle: React.CSSProperties = {
  display:       "inline-block",
  padding:       "4px 10px",
  borderRadius:  10,
  background:    "rgba(201,168,76,0.15)",
  color:         GOLD_LIGHT,
  fontSize:      11,
  fontWeight:    700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom:  10,
  fontFamily:    "var(--font-montserrat)",
};

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
  width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px", borderRadius: 14, border: "none", background: GOLD, color: DARK_BG, fontWeight: 800, fontSize: 14, cursor: "pointer", boxShadow: "0 4px 14px rgba(201,168,76,0.3)",
};

const btnGhostSmall: React.CSSProperties = {
  width: "100%", padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.2)", background: "none", color: "rgba(255,255,255,0.8)", cursor: "pointer", fontSize: 13,
};
