import type { Metadata } from "next";
import Link from "next/link";
import { getSessionDetail, type SessionDetail, type PerQuestion, type SessionResponse } from "@/lib/gas";

export const metadata: Metadata = {
  title: "Session Detail · PZ Academy",
};

interface Props {
  params: { id: string };
  searchParams: { key?: string };
}

export default async function SessionDetailPage({ params, searchParams }: Props) {
  const key = searchParams.key ?? "";
  const expectedKey = process.env.GAS_VIEWER_KEY ?? "";

  if (!expectedKey || key !== expectedKey) {
    return <Unauthorized />;
  }

  let detail: SessionDetail | null = null;
  let error = "";
  try {
    detail = await getSessionDetail(key, params.id);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load session.";
  }

  return (
    <div style={{ background: "#F8F6F1", minHeight: "100vh" }}>
      {/* Header */}
      <header style={{ background: "#1A4D2E", padding: "20px 32px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Link
            href={`/sessions?key=${key}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: "rgba(255,255,255,0.65)",
              fontFamily: "var(--font-poppins)",
              fontSize: 13,
              textDecoration: "none",
              marginBottom: 12,
            }}
            className="hover:text-white transition-colors"
          >
            ← All sessions
          </Link>
          {detail && (
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <StatusChip closed={detail.status.toLowerCase() === "closed"} />
                  {detail.date && (
                    <span
                      style={{
                        color: "rgba(255,255,255,0.55)",
                        fontFamily: "var(--font-poppins)",
                        fontSize: 13,
                      }}
                    >
                      {detail.date}
                    </span>
                  )}
                </div>
                <h1
                  style={{
                    color: "#fff",
                    fontFamily: "var(--font-montserrat)",
                    fontWeight: 800,
                    fontSize: "clamp(22px,4vw,32px)",
                    margin: "0 0 4px",
                  }}
                >
                  {detail.name}
                </h1>
                <p
                  style={{
                    color: "rgba(255,255,255,0.6)",
                    fontFamily: "var(--font-poppins)",
                    fontSize: 14,
                    margin: 0,
                  }}
                >
                  Speaker · {detail.speaker}
                </p>
              </div>
              <span
                style={{
                  background: "rgba(201,168,76,0.15)",
                  color: "#C9A84C",
                  border: "1px solid rgba(201,168,76,0.3)",
                  borderRadius: 20,
                  padding: "6px 16px",
                  fontSize: 12,
                  fontFamily: "var(--font-poppins)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  flexShrink: 0,
                }}
              >
                Viewer
              </span>
            </div>
          )}
          {!detail && !error && (
            <h1 style={{ color: "#fff", fontFamily: "var(--font-montserrat)", fontWeight: 800, fontSize: 28, margin: 0 }}>
              Session Detail
            </h1>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 32px" }}>
        {error && (
          <div
            style={{
              background: "#FEE2E2",
              border: "1px solid #FECACA",
              borderRadius: 8,
              padding: "16px 20px",
              color: "#DC2626",
              fontFamily: "var(--font-poppins)",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {detail && (
          <>
            {/* Big stats */}
            <div
              className="grid grid-cols-1 sm:grid-cols-3"
              style={{ gap: 20, marginBottom: 32 }}
            >
              <BigStat value={String(detail.responseCount)} label="Responses" icon="💬" />
              <BigStat
                value={detail.avgRating != null ? String(detail.avgRating) : "—"}
                label="Overall Avg"
                suffix={detail.avgRating != null ? "/5" : undefined}
                icon="⭐"
              />
              <BigStat value={String(detail.perQuestion.length)} label="Rated Questions" icon="✅" />
            </div>

            {/* Per-question averages */}
            <div
              style={{
                background: "#fff",
                borderRadius: 12,
                border: "1px solid #E5E1D8",
                padding: "24px",
                marginBottom: 24,
              }}
            >
              <h3
                style={{
                  fontFamily: "var(--font-montserrat)",
                  fontWeight: 700,
                  fontSize: 16,
                  color: "#0D0D0D",
                  margin: "0 0 20px",
                }}
              >
                Per-question averages
              </h3>
              {detail.perQuestion.length === 0 ? (
                <p style={{ fontFamily: "var(--font-poppins)", color: "#9CA3AF", fontSize: 14 }}>
                  No ratings yet.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  {detail.perQuestion.map((q, i) => (
                    <QuestionBar key={i} q={q} />
                  ))}
                </div>
              )}
            </div>

            {/* Responses */}
            <div
              style={{
                background: "#fff",
                borderRadius: 12,
                border: "1px solid #E5E1D8",
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "20px 24px", borderBottom: "1px solid #E5E1D8" }}>
                <h3
                  style={{
                    fontFamily: "var(--font-montserrat)",
                    fontWeight: 700,
                    fontSize: 16,
                    color: "#0D0D0D",
                    margin: 0,
                  }}
                >
                  Responses
                </h3>
              </div>
              {detail.responses.length === 0 ? (
                <div style={{ padding: "48px 24px", textAlign: "center" }}>
                  <p style={{ fontFamily: "var(--font-poppins)", color: "#9CA3AF", fontSize: 14 }}>
                    No responses yet.
                  </p>
                </div>
              ) : (
                <div>
                  {detail.responses.map((r, i) => (
                    <ResponseCard key={i} r={r} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function QuestionBar({ q }: { q: PerQuestion }) {
  const pct = q.avg != null ? (q.avg / 5) * 100 : 0;
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 6,
          gap: 12,
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-poppins)",
            fontSize: 14,
            color: "#374151",
            margin: 0,
            flex: 1,
          }}
        >
          {q.question}
        </p>
        <span
          style={{
            fontFamily: "var(--font-montserrat)",
            fontWeight: 700,
            color: "#1A4D2E",
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          {q.avg != null ? q.avg : "—"}
        </span>
      </div>
      <div
        style={{
          height: 8,
          background: "#F3F4F6",
          borderRadius: 4,
          overflow: "hidden",
          marginBottom: 4,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "#1A4D2E",
            borderRadius: 4,
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <p
        style={{
          fontFamily: "var(--font-poppins)",
          color: "#9CA3AF",
          fontSize: 12,
          margin: 0,
        }}
      >
        {q.count} {q.count === 1 ? "rating" : "ratings"}
      </p>
    </div>
  );
}

function ResponseCard({ r }: { r: SessionResponse }) {
  const avgStars =
    r.stars.length
      ? (r.stars.reduce((a, b) => a + b, 0) / r.stars.length).toFixed(1)
      : null;
  return (
    <div
      style={{
        padding: "16px 24px",
        borderBottom: "1px solid #E5E1D8",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: r.comments ? 10 : 0,
        }}
      >
        <div>
          <p
            style={{
              fontFamily: "var(--font-poppins)",
              fontWeight: 600,
              color: "#0D0D0D",
              fontSize: 14,
              margin: "0 0 2px",
            }}
          >
            {r.name}
          </p>
          {r.email && (
            <p
              style={{
                fontFamily: "var(--font-poppins)",
                color: "#9CA3AF",
                fontSize: 12,
                margin: 0,
              }}
            >
              {r.email}
            </p>
          )}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {avgStars && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end", marginBottom: 2 }}>
              <span style={{ color: "#C9A84C", fontSize: 14 }}>{"★".repeat(Math.round(Number(avgStars)))}</span>
              <span style={{ fontFamily: "var(--font-poppins)", color: "#6B7280", fontSize: 12 }}>
                avg {avgStars}
              </span>
            </div>
          )}
          <p
            style={{
              fontFamily: "var(--font-poppins)",
              color: "#9CA3AF",
              fontSize: 11,
              margin: 0,
            }}
          >
            {r.submittedOn}
          </p>
        </div>
      </div>
      {r.comments && (
        <p
          style={{
            fontFamily: "var(--font-poppins)",
            color: "#6B7280",
            fontSize: 13,
            background: "#F8F6F1",
            borderRadius: 8,
            padding: "10px 14px",
            margin: 0,
            lineHeight: 1.6,
          }}
        >
          {r.comments}
        </p>
      )}
    </div>
  );
}

function BigStat({
  value,
  label,
  icon,
  suffix,
}: {
  value: string;
  label: string;
  icon: string;
  suffix?: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #E5E1D8",
        borderRadius: 12,
        padding: "24px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <p
        style={{
          fontFamily: "var(--font-montserrat)",
          fontWeight: 800,
          fontSize: 36,
          color: "#0D0D0D",
          lineHeight: 1,
          margin: "0 0 4px",
        }}
      >
        {value}
        {suffix && (
          <span
            style={{
              fontSize: 18,
              color: "#9CA3AF",
              fontWeight: 600,
            }}
          >
            {suffix}
          </span>
        )}
      </p>
      <p
        style={{
          fontFamily: "var(--font-poppins)",
          color: "#6B7280",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          margin: 0,
        }}
      >
        {label}
      </p>
    </div>
  );
}

function StatusChip({ closed }: { closed: boolean }) {
  return (
    <span
      style={{
        padding: "3px 12px",
        borderRadius: 20,
        fontSize: 11,
        fontFamily: "var(--font-poppins)",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        background: closed ? "rgba(220,38,38,0.12)" : "rgba(201,168,76,0.15)",
        color: closed ? "#DC2626" : "#C9A84C",
        border: `1px solid ${closed ? "rgba(220,38,38,0.25)" : "rgba(201,168,76,0.3)"}`,
      }}
    >
      {closed ? "Closed" : "Active"}
    </span>
  );
}

function Unauthorized() {
  return (
    <div
      style={{
        background: "#1A4D2E",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 20 }}>🔒</div>
        <h1
          style={{
            fontFamily: "var(--font-montserrat)",
            color: "#fff",
            fontSize: 24,
            fontWeight: 800,
            marginBottom: 8,
          }}
        >
          Access Denied
        </h1>
        <p
          style={{
            fontFamily: "var(--font-poppins)",
            color: "rgba(255,255,255,0.6)",
            fontSize: 15,
          }}
        >
          This viewer link is not valid.
        </p>
      </div>
    </div>
  );
}
