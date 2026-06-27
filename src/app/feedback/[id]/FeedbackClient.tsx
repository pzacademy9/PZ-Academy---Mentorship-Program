"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { PublicSession } from "@/lib/gas";

// Step layout:
//   0              → Intro
//   1              → Name
//   2              → Email
//   3 … 3+N-1      → Per-question step (RatingStep for stars, VideoStep for video)
//   3+N            → Comments
//   3+N+1          → Thank-you (after submit)

interface Props {
  session: PublicSession;
}

type StarAnswers  = Record<number, number>; // questionIndex → star 1–5
type VideoAnswers = Record<number, string>; // questionIndex → URL string (optional)

export default function FeedbackClient({ session }: Props) {
  const N            = session.questions.length;
  const COMMENTS_STEP = 3 + N;
  const THANKYOU_STEP = COMMENTS_STEP + 1;
  const TOTAL_VISIBLE = COMMENTS_STEP + 1; // progress dots

  const [step,         setStep]         = useState(0);
  const [name,         setName]         = useState("");
  const [email,        setEmail]        = useState("");
  const [website,      setWebsite]      = useState(""); // honeypot
  const [starAnswers,  setStarAnswers]  = useState<StarAnswers>({});
  const [videoAnswers, setVideoAnswers] = useState<VideoAnswers>({});
  const [comments,     setComments]     = useState("");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");

  const done = step === THANKYOU_STEP;

  // Which kind of step are we on?
  const qi        = step >= 3 && step < COMMENTS_STEP ? step - 3 : -1;
  const isRating  = qi >= 0 && session.questions[qi]?.type === "stars";
  const isVideo   = qi >= 0 && session.questions[qi]?.type === "video";

  const canNext = useCallback((): boolean => {
    if (step === 1) return name.trim().length > 0;
    if (step === 2) return email.trim().length > 0;
    if (isRating)   return starAnswers[qi] != null;
    if (isVideo)    return true; // video URL is optional
    return true;
  }, [step, name, email, starAnswers, isRating, isVideo, qi]);

  const next = () => { if (step < THANKYOU_STEP - 1) setStep((s) => s + 1); };
  const prev = () => { if (step > 0) setStep((s) => s - 1); };

  const setStar = (index: number, v: number) => {
    setStarAnswers((prev) => ({ ...prev, [index]: v }));
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
      setStep(THANKYOU_STEP);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const isLastBeforeSubmit = step === COMMENTS_STEP;

  return (
    <div
      style={{
        background:    "#0F3D22",
        minHeight:     "100vh",
        display:       "flex",
        flexDirection: "column",
        overflowX:     "hidden",
        fontFamily:    "var(--font-poppins)",
      }}
    >
      {/* Progress dots */}
      {!done && (
        <div
          style={{
            position:   "fixed",
            top:        0,
            left:       0,
            right:      0,
            padding:    "18px 24px 14px",
            display:    "flex",
            justifyContent: "center",
            gap:        6,
            zIndex:     10,
            background: "linear-gradient(to bottom, rgba(15,61,34,0.95) 60%, transparent)",
          }}
        >
          {Array.from({ length: TOTAL_VISIBLE }).map((_, i) => (
            <div
              key={i}
              style={{
                width:        i === step ? 20 : 6,
                height:       6,
                borderRadius: 3,
                background:   i < step
                  ? "rgba(201,168,76,0.6)"
                  : i === step
                  ? "#C9A84C"
                  : "rgba(255,255,255,0.2)",
                transition:   "all 0.25s ease",
              }}
            />
          ))}
        </div>
      )}

      {/* Step content */}
      <div
        style={{
          flex:          1,
          display:       "flex",
          flexDirection: "column",
          alignItems:    "center",
          justifyContent:"center",
          padding:       "80px 24px 100px",
          maxWidth:      480,
          margin:        "0 auto",
          width:         "100%",
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
              />
            )}
            {step === COMMENTS_STEP && (
              <CommentsStep value={comments} onChange={setComments} />
            )}
            {done && <ThankyouStep name={name} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom nav — hidden during star-rating steps (auto-advance) */}
      {!done && (
        <div
          style={{
            position:       "fixed",
            bottom:         0,
            left:           0,
            right:          0,
            padding:        "16px 24px 28px",
            background:     "linear-gradient(to top, rgba(15,61,34,1) 60%, transparent)",
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            gap:            10,
          }}
        >
          {error && (
            <p style={{ color: "#FCA5A5", fontSize: 13, textAlign: "center", maxWidth: 400 }}>
              {error}
            </p>
          )}
          <div style={{ display: "flex", gap: 12, width: "100%", maxWidth: 400 }}>
            {step > 0 && (
              <button
                onClick={prev}
                style={{
                  flex:       "0 0 48px",
                  height:     52,
                  borderRadius: 26,
                  border:     "1px solid rgba(255,255,255,0.15)",
                  background: "transparent",
                  color:      "rgba(255,255,255,0.7)",
                  cursor:     "pointer",
                  fontSize:   20,
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
                  flex:         1,
                  height:       52,
                  borderRadius: 26,
                  border:       "none",
                  background:   canNext() && !loading ? "#C9A84C" : "rgba(255,255,255,0.1)",
                  color:        canNext() && !loading ? "#0F3D22" : "rgba(255,255,255,0.3)",
                  fontFamily:   "var(--font-montserrat)",
                  fontWeight:   700,
                  fontSize:     15,
                  cursor:       canNext() && !loading ? "pointer" : "default",
                  transition:   "all 0.2s",
                  letterSpacing:"0.04em",
                }}
              >
                {loading
                  ? "Submitting…"
                  : isLastBeforeSubmit
                  ? "Submit Feedback"
                  : step === 0
                  ? "Get started"
                  : isVideo
                  ? "Continue"
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
          width:          64,
          height:         64,
          borderRadius:   "50%",
          background:     "rgba(201,168,76,0.15)",
          border:         "2px solid rgba(201,168,76,0.3)",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          margin:         "0 auto 24px",
          fontSize:       28,
        }}
      >
        💬
      </div>
      <h1
        style={{
          fontFamily:   "var(--font-montserrat)",
          fontWeight:   800,
          fontSize:     "clamp(24px, 6vw, 32px)",
          color:        "#fff",
          lineHeight:   1.2,
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
      <label style={stepLabelStyle}>Step 1 of 2</label>
      <h2 style={stepHeadingStyle}>What&apos;s your name?</h2>
      <input
        autoFocus
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && value.trim() && e.currentTarget.blur()}
        placeholder="Your name"
        style={inputStyle}
      />
    </div>
  );
}

function EmailStep({
  value, onChange, honeypot, onHoneypot,
}: {
  value: string; onChange: (v: string) => void;
  honeypot: string; onHoneypot: (v: string) => void;
}) {
  return (
    <div>
      <label style={stepLabelStyle}>Step 2 of 2</label>
      <h2 style={stepHeadingStyle}>And your email?</h2>
      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
        Used to prevent duplicate submissions. We don&apos;t send marketing email.
      </p>
      {/* Honeypot — hidden from real users, visible to bots */}
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
  question, qNum, total, value, onSelect,
}: {
  question: string; qNum: number; total: number;
  value: number | undefined; onSelect: (v: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? value ?? 0;
  const labels  = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

  return (
    <div style={{ textAlign: "center" }}>
      <label style={{ ...stepLabelStyle, display: "block", marginBottom: 8 }}>
        Question {qNum} of {total}
      </label>
      <h2
        style={{
          fontFamily:   "var(--font-montserrat)",
          fontWeight:   700,
          fontSize:     "clamp(18px, 4.5vw, 24px)",
          color:        "#fff",
          lineHeight:   1.35,
          margin:       "0 auto 40px",
          maxWidth:     360,
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
              width:      52,
              height:     52,
              fontSize:   42,
              lineHeight: 1,
              background: "none",
              border:     "none",
              cursor:     "pointer",
              color:      n <= display ? "#C9A84C" : "rgba(255,255,255,0.18)",
              transform:  n === display ? "scale(1.25)" : "scale(1)",
              transition: "color 0.12s, transform 0.12s",
              padding:    0,
              touchAction:"manipulation",
            }}
          >
            ★
          </button>
        ))}
      </div>
      <p
        style={{
          color:         display ? "#C9A84C" : "rgba(255,255,255,0.3)",
          fontFamily:    "var(--font-montserrat)",
          fontWeight:    600,
          fontSize:      14,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          minHeight:     20,
          transition:    "color 0.15s",
        }}
      >
        {labels[display]}
      </p>
    </div>
  );
}

type VState = "idle" | "recording" | "previewing" | "uploading" | "done";

function VideoStep({
  question, qNum, total, value, onChange, sessionId, sessionName,
}: {
  question: string; qNum: number; total: number;
  value: string; onChange: (url: string) => void;
  sessionId: string; sessionName: string;
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
      setErrMsg("Camera access was denied. Try uploading a file instead.");
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
      formData.append("video",       blob, `feedback.${ext}`);
      formData.append("sessionId",   sessionId);
      formData.append("sessionName", sessionName);

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

      {/* Video element — always in DOM so refs stay valid */}
      <video
        ref={videoRef}
        playsInline
        style={{
          width:       "100%",
          borderRadius: 12,
          background:  "#000",
          display:     vState === "recording" || vState === "previewing" ? "block" : "none",
          marginBottom: 16,
          maxHeight:   260,
          objectFit:   "cover",
        }}
      />

      {/* IDLE */}
      {vState === "idle" && (
        <>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginBottom: 24, lineHeight: 1.65 }}>
            Share a short video response (up to 30 seconds).{" "}
            <span style={{ opacity: 0.7 }}>Optional — tap Continue to skip.</span>
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={startRecording} style={videoOptionBtnStyle}>
              <span style={{ fontSize: 26 }}>🎥</span>
              <span>Record</span>
            </button>
            <label style={{ ...videoOptionBtnStyle, cursor: "pointer" }}>
              <span style={{ fontSize: 26 }}>📁</span>
              <span>Upload file</span>
              <input
                type="file"
                accept="video/*"
                style={{ display: "none" }}
                onChange={handleFileSelect}
              />
            </label>
          </div>
          {errMsg && <p style={errStyle}>{errMsg}</p>}
        </>
      )}

      {/* RECORDING */}
      {vState === "recording" && (
        <div style={{ textAlign: "center" }}>
          <p style={{ color: countdown <= 5 ? "#FCA5A5" : "rgba(255,255,255,0.6)", fontSize: 13, marginBottom: 14 }}>
            {countdown}s remaining
          </p>
          <button onClick={stopRecording} style={stopBtnStyle}>⏹ Stop recording</button>
        </div>
      )}

      {/* PREVIEWING */}
      {vState === "previewing" && (
        <>
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button onClick={doUpload} style={primarySmallBtn}>✓ Use this</button>
            <button onClick={reset}    style={ghostSmallBtn}>Re-record</button>
          </div>
          {errMsg && <p style={errStyle}>{errMsg}</p>}
        </>
      )}

      {/* UPLOADING */}
      {vState === "uploading" && (
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, marginTop: 8 }}>
          Uploading to Drive…
        </p>
      )}

      {/* DONE */}
      {vState === "done" && (
        <div>
          <p style={{ color: "rgba(201,168,76,0.9)", fontSize: 14, marginBottom: 12 }}>
            ✓ Video saved to Drive
          </p>
          <button onClick={reset} style={ghostSmallBtn}>Re-record / change</button>
        </div>
      )}
    </div>
  );
}

function CommentsStep({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <h2 style={{ ...stepHeadingStyle, marginBottom: 8 }}>Any final thoughts?</h2>
      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginBottom: 24 }}>
        Optional — share anything else on your mind.
      </p>
      <textarea
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Your comments…"
        rows={5}
        style={{ ...inputStyle, resize: "vertical", minHeight: 120, lineHeight: 1.6 }}
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
          width:          88,
          height:         88,
          borderRadius:   "50%",
          background:     "rgba(201,168,76,0.15)",
          border:         "2px solid #C9A84C",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          margin:         "0 auto 28px",
          fontSize:       40,
        }}
      >
        🎉
      </motion.div>
      <h1
        style={{
          fontFamily:   "var(--font-montserrat)",
          fontWeight:   800,
          fontSize:     "clamp(26px, 6vw, 36px)",
          color:        "#fff",
          marginBottom: 12,
        }}
      >
        Thank you{name ? `, ${name.split(" ")[0]}` : ""}!
      </h1>
      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 16, lineHeight: 1.65, maxWidth: 320, margin: "0 auto" }}>
        Your feedback has been recorded. We&apos;ll use it to make every PZ Academy session better.
      </p>
    </motion.div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const stepLabelStyle: React.CSSProperties = {
  color:         "rgba(255,255,255,0.45)",
  fontSize:      11,
  textTransform: "uppercase",
  letterSpacing: "0.15em",
  fontFamily:    "var(--font-montserrat)",
  marginBottom:  14,
};

const stepHeadingStyle: React.CSSProperties = {
  fontFamily:   "var(--font-montserrat)",
  fontWeight:   800,
  fontSize:     "clamp(22px, 5vw, 28px)",
  color:        "#fff",
  marginBottom: 28,
};

const inputStyle: React.CSSProperties = {
  width:       "100%",
  background:  "rgba(255,255,255,0.07)",
  border:      "1px solid rgba(255,255,255,0.15)",
  borderRadius:12,
  padding:     "16px 18px",
  color:       "#fff",
  fontSize:    16,
  fontFamily:  "var(--font-poppins)",
  outline:     "none",
  boxSizing:   "border-box",
};

const videoOptionBtnStyle: React.CSSProperties = {
  flex:           1,
  display:        "flex",
  flexDirection:  "column",
  alignItems:     "center",
  justifyContent: "center",
  gap:            8,
  padding:        "22px 12px",
  borderRadius:   12,
  border:         "1px solid rgba(255,255,255,0.15)",
  background:     "rgba(255,255,255,0.05)",
  color:          "#fff",
  fontSize:       14,
  cursor:         "pointer",
  fontFamily:     "var(--font-poppins)",
};

const stopBtnStyle: React.CSSProperties = {
  background:   "rgba(239,68,68,0.15)",
  border:       "1px solid rgba(239,68,68,0.35)",
  borderRadius: 24,
  color:        "#FCA5A5",
  padding:      "12px 28px",
  fontSize:     14,
  cursor:       "pointer",
  fontFamily:   "var(--font-poppins)",
};

const primarySmallBtn: React.CSSProperties = {
  flex:         1,
  padding:      "12px 16px",
  borderRadius: 10,
  border:       "none",
  background:   "#C9A84C",
  color:        "#0F3D22",
  fontWeight:   700,
  fontSize:     14,
  cursor:       "pointer",
  fontFamily:   "var(--font-montserrat)",
};

const ghostSmallBtn: React.CSSProperties = {
  flex:         1,
  padding:      "12px 16px",
  borderRadius: 10,
  border:       "1px solid rgba(255,255,255,0.2)",
  background:   "transparent",
  color:        "rgba(255,255,255,0.65)",
  fontSize:     14,
  cursor:       "pointer",
  fontFamily:   "var(--font-poppins)",
};

const errStyle: React.CSSProperties = {
  color:     "#FCA5A5",
  fontSize:  13,
  marginTop: 10,
};
