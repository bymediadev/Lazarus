import type { LiveObjection } from "../lib/liveObjections";
import type { MeetingPlatformId } from "../lib/meetingPlatforms";
import type { LiveTriageResult } from "../lib/liveTriage";
import type { LiveTranscriptTurn } from "../types";

const PLATFORM_LABEL: Record<MeetingPlatformId, string> = {
  zoom: "Zoom",
  meet: "Google Meet",
  teams: "Microsoft Teams",
};

interface Props {
  active: boolean;
  platform: MeetingPlatformId | null;
  turns: LiveTranscriptTurn[];
  objections: LiveObjection[];
  triage: LiveTriageResult | null;
  triageLoading: boolean;
  triageError: string | null;
  onRefresh: () => void;
}

function tierClass(tier: string): string {
  if (tier === "CRITICAL" || tier === "HIGH") return "live-triage-tier-hot";
  if (tier === "MODERATE") return "live-triage-tier-warm";
  return "live-triage-tier-cool";
}

export default function LiveTriageBrief({
  active,
  platform,
  turns,
  objections,
  triage,
  triageLoading,
  triageError,
  onRefresh,
}: Props) {
  const open = objections.filter((o) => o.status === "open");
  const platformLabel = platform ? PLATFORM_LABEL[platform] : "Live call";

  if (!active) {
    return (
      <div className="empty-state">
        <span>AWAITING INPUT</span>
        <span>
          Start a Live Meeting (Zoom, Meet, or Teams) for a live triage brief — or paste a transcript
          and run full analysis
        </span>
      </div>
    );
  }

  return (
    <div className="live-triage-brief">
      <header className="live-triage-header">
        <div>
          <p className="live-triage-eyebrow">Live triage · {platformLabel}</p>
          <h2 className="live-triage-title">Recovery Brief (in-call)</h2>
        </div>
        <span className="live-triage-live-dot">● LIVE</span>
      </header>

      <p className="live-triage-sub">
        Rolling judgment while the call is open. Same pipe for Zoom, Meet, and Teams (platform stream
        or mic/paste). Full DRI autopsy still runs when you end the session.
      </p>

      <div className="live-triage-stats">
        <div className="live-triage-stat">
          <span className="live-triage-stat-label">Turns</span>
          <strong>{turns.length}</strong>
        </div>
        <div className="live-triage-stat">
          <span className="live-triage-stat-label">Open objections</span>
          <strong>{open.length}</strong>
        </div>
        <div className="live-triage-stat">
          <span className="live-triage-stat-label">Risk</span>
          <strong className={triage ? tierClass(triage.risk_tier) : undefined}>
            {triage?.risk_tier ?? "—"}
          </strong>
        </div>
        <div className="live-triage-stat">
          <span className="live-triage-stat-label">Momentum</span>
          <strong>{triage?.momentum ?? "—"}</strong>
        </div>
      </div>

      <div className="live-triage-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={onRefresh}
          disabled={triageLoading || turns.length === 0}
        >
          {triageLoading ? "Updating triage…" : "Refresh live triage"}
        </button>
        {triage?.updated_at && (
          <span className="live-triage-stamp">
            Updated {new Date(triage.updated_at).toLocaleTimeString()} · confidence{" "}
            {triage.confidence}
          </span>
        )}
      </div>

      {triageError && <div className="error-banner">{triageError}</div>}

      {triage ? (
        <>
          <p className="live-triage-headline">{triage.headline}</p>

          {triage.top_blockers.length > 0 && (
            <section className="live-triage-section">
              <h3>Top blockers now</h3>
              <ul>
                {triage.top_blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </section>
          )}

          {triage.next_moves.length > 0 && (
            <section className="live-triage-section">
              <h3>Try in this call</h3>
              <ul>
                {triage.next_moves.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <p className="live-triage-waiting">
          {turns.length === 0
            ? "No dialogue yet. Click Start live session, then paste a buyer line (e.g. Buyer: Legal needs a DPA) — Zoom RTMS does not fill the brief by itself until a Lazarus session is live."
            : "Dialogue received — click Refresh live triage (or wait a few seconds) to populate risk and blockers."}
        </p>
      )}

      {open.length > 0 && (
        <section className="live-triage-section">
          <h3>Open objections</h3>
          <ul>
            {open.map((o) => (
              <li key={o.id}>{o.text}</li>
            ))}
          </ul>
        </section>
      )}

      {turns.length > 0 && (
        <details className="live-triage-transcript">
          <summary>Rolling transcript ({turns.length})</summary>
          <pre>
            {turns
              .slice(-12)
              .map((t) => `${t.timestamp ? `[${t.timestamp}] ` : ""}${t.speaker}: ${t.dialogue}`)
              .join("\n")}
          </pre>
        </details>
      )}
    </div>
  );
}
