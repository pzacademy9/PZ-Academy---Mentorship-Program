import type { Metadata } from "next";
import Link from "next/link";
import { getSessions, type Session } from "@/lib/gas";

export const metadata: Metadata = {
  title: "Feedback Dashboard · PZ Academy",
};

interface Props {
  searchParams: { key?: string };
}

export default async function SessionsPage({ searchParams }: Props) {
  const key = searchParams.key ?? "";
  const expectedKey = process.env.GAS_VIEWER_KEY ?? "";

  if (!expectedKey || key !== expectedKey) {
    return <Unauthorized />;
  }

  let sessions: Session[] = [];
  let error = "";
  try {
    sessions = await getSessions(key);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load sessions.";
  }

  const totalResponses = sessions.reduce((a, s) => a + s.responseCount, 0);
  const ratedSessions = sessions.filter((s) => s.avgRating != null);
  const overallAvg =
    ratedSessions.length
      ? (ratedSessions.reduce((a, s) => a + s.avgRating!, 0) / ratedSessions.length).toFixed(1)
      : "—";

  return (
    <div style={{ background: "#F8F6F1", minHeight: "100vh" }}>
      <DashHeader title="Feedback Dashboard" badge="Viewer" />

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 32px" }}>
        {/* Stats row */}
        <div
          className="grid grid-cols-1 sm:grid-cols-3"
          style={{ gap: 20, marginBottom: 32 }}
        >
          <StatCard value={String(sessions.length)} label="Sessions" icon="📅" />
          <StatCard value={String(totalResponses)} label="Total Responses" icon="💬" />
          <StatCard value={overallAvg} label="Avg Rating" icon="⭐" />
        </div>

        {error && (
          <div
            style={{
              background: "#FEE2E2",
              border: "1px solid #FECACA",
              borderRadius: 8,
              padding: "14px 20px",
              color: "#DC2626",
              marginBottom: 24,
              fontFamily: "var(--font-poppins)",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {/* Sessions table */}
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            border: "1px solid #E5E1D8",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "20px 24px",
              borderBottom: "1px solid #E5E1D8",
            }}
          >
            <h2
              style={{
                fontFamily: "var(--font-montserrat)",
                fontWeight: 700,
                fontSize: 18,
                color: "#0D0D0D",
              }}
            >
              All Sessions
            </h2>
          </div>

          {!error && sessions.length === 0 ? (
            <Empty
              title="No sessions yet"
              sub="Sessions created by admins will appear here."
            />
          ) : (
            <div>
              {sessions.map((session) => (
                <SessionRow key={session.id} session={session} viewerKey={key} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function SessionRow({ session, viewerKey }: { session: Session; viewerKey: string }) {
  const closed = session.status.toLowerCase() === "closed";
  return (
    <Link
      href={`/sessions/${session.id}?key=${viewerKey}`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 24px",
        borderBottom: "1px solid #E5E1D8",
        textDecoration: "none",
        transition: "background 0.15s",
      }}
      className="hover:bg-stone-50"
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <p
            style={{
              fontFamily: "var(--font-poppins)",
              fontWeight: 500,
              color: "#0D0D0D",
              fontSize: 15,
              margin: 0,
            }}
          >
            {session.name}
          </p>
          <StatusChip closed={closed} />
        </div>
        <p
          style={{
            fontFamily: "var(--font-poppins)",
            color: "#6B7280",
            fontSize: 13,
            margin: 0,
          }}
        >
          {session.speaker}
          {session.date ? ` · ${session.date}` : ""}
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 32, flexShrink: 0, paddingLeft: 16 }}>
        <div style={{ textAlign: "right" }}>
          <p
            style={{
              fontFamily: "var(--font-poppins)",
              fontWeight: 600,
              color: "#0D0D0D",
              fontSize: 18,
              margin: 0,
              lineHeight: 1,
            }}
          >
            {session.responseCount}
          </p>
          <p
            style={{
              fontFamily: "var(--font-poppins)",
              color: "#9CA3AF",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              margin: "3px 0 0",
            }}
          >
            responses
          </p>
        </div>
        <div style={{ textAlign: "right", minWidth: 44 }}>
          <p
            style={{
              fontFamily: "var(--font-poppins)",
              fontWeight: 700,
              color: "#1A4D2E",
              fontSize: 18,
              margin: 0,
              lineHeight: 1,
            }}
          >
            {session.avgRating != null ? session.avgRating : "—"}
          </p>
          <p
            style={{
              fontFamily: "var(--font-poppins)",
              color: "#9CA3AF",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              margin: "3px 0 0",
            }}
          >
            avg
          </p>
        </div>
        <span style={{ color: "#C9A84C", fontSize: 22, fontWeight: 300 }}>›</span>
      </div>
    </Link>
  );
}

function DashHeader({ title, badge }: { title: string; badge: string }) {
  return (
    <header style={{ background: "#1A4D2E", padding: "24px 32px 28px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p
            style={{
              color: "rgba(255,255,255,0.55)",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              fontFamily: "var(--font-montserrat)",
              margin: "0 0 6px",
            }}
          >
            PZ Academy
          </p>
          <h1
            style={{
              color: "#fff",
              fontSize: 28,
              fontWeight: 800,
              fontFamily: "var(--font-montserrat)",
              margin: 0,
            }}
          >
            {title}
          </h1>
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
          }}
        >
          {badge}
        </span>
      </div>
    </header>
  );
}

function StatCard({ value, label, icon }: { value: string; label: string; icon: string }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #E5E1D8",
        borderRadius: 12,
        padding: "20px 24px",
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div style={{ fontSize: 28 }}>{icon}</div>
      <div>
        <p
          style={{
            fontFamily: "var(--font-montserrat)",
            fontWeight: 800,
            fontSize: 30,
            color: "#0D0D0D",
            lineHeight: 1,
            margin: 0,
          }}
        >
          {value}
        </p>
        <p
          style={{
            fontFamily: "var(--font-poppins)",
            color: "#6B7280",
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginTop: 4,
          }}
        >
          {label}
        </p>
      </div>
    </div>
  );
}

function StatusChip({ closed }: { closed: boolean }) {
  return (
    <span
      style={{
        padding: "2px 10px",
        borderRadius: 20,
        fontSize: 10,
        fontFamily: "var(--font-poppins)",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        background: closed ? "rgba(220,38,38,0.08)" : "rgba(26,77,46,0.08)",
        color: closed ? "#DC2626" : "#1A4D2E",
        border: `1px solid ${closed ? "rgba(220,38,38,0.2)" : "rgba(26,77,46,0.2)"}`,
        flexShrink: 0,
      }}
    >
      {closed ? "Closed" : "Active"}
    </span>
  );
}

function Empty({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ padding: "64px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
      <p
        style={{
          fontFamily: "var(--font-montserrat)",
          fontWeight: 600,
          color: "#0D0D0D",
          marginBottom: 4,
        }}
      >
        {title}
      </p>
      <p
        style={{
          fontFamily: "var(--font-poppins)",
          color: "#6B7280",
          fontSize: 14,
        }}
      >
        {sub}
      </p>
    </div>
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
