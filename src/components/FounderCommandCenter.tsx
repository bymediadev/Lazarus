import { useCallback, useEffect, useState } from "react";
import {
  copyText,
  fetchFounderIssues,
  fetchFounderOverview,
  fetchFounderSystem,
  founderDeleteDeal,
  founderLookup,
  founderPasswordReset,
  founderSaveNote,
  founderTestDigest,
} from "../lib/founderApi";

type Tab = "overview" | "issues" | "lookup" | "system";

type Props = {
  opsEmail: string | null;
  onOpenProduct: () => void;
};

export default function FounderCommandCenter({ opsEmail, onOpenProduct }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [overview, setOverview] = useState<Awaited<
    ReturnType<typeof fetchFounderOverview>
  > | null>(null);
  const [issues, setIssues] = useState<Awaited<ReturnType<typeof fetchFounderIssues>>["issues"]>(
    []
  );
  const [system, setSystem] = useState<Awaited<ReturnType<typeof fetchFounderSystem>> | null>(
    null
  );

  const [lookupEmail, setLookupEmail] = useState("");
  const [lookup, setLookup] = useState<Awaited<ReturnType<typeof founderLookup>> | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, iss, sys] = await Promise.all([
        fetchFounderOverview(),
        fetchFounderIssues(),
        fetchFounderSystem(),
      ]);
      setOverview(ov);
      setIssues(iss.issues);
      setSystem(sys);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ops data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const statusClass = (s: string | undefined) => {
    if (s === "critical") return "ops-status ops-status-critical";
    if (s === "warning") return "ops-status ops-status-warning";
    return "ops-status ops-status-ok";
  };

  const onCopy = async (packet: string) => {
    try {
      await copyText(packet);
      setNotice("Diagnosis packet copied — paste into Cursor.");
    } catch {
      setNotice("Could not copy — select the packet manually.");
    }
  };

  const runLookup = async () => {
    setError(null);
    setNotice(null);
    try {
      const data = await founderLookup(lookupEmail.trim());
      setLookup(data);
      setNoteDraft(data.note ?? "");
      setTab("lookup");
    } catch (err) {
      setLookup(null);
      setError(err instanceof Error ? err.message : "Lookup failed");
    }
  };

  const maxPeak = Math.max(1, ...(overview?.peak_hours.map((p) => p.count) ?? [1]));

  return (
    <div className="ops-console">
      <header className="ops-header">
        <div>
          <p className="ops-kicker">Ops Command Center</p>
          <h1>Lazarus status &amp; hang-ups</h1>
          <p className="ops-sub">
            Signed in as {opsEmail ?? "ops"} — diagnose here, fix in Cursor.
          </p>
        </div>
        <div className="ops-header-actions">
          <button type="button" className="btn-secondary" onClick={() => void refresh()}>
            Refresh
          </button>
          <button type="button" className="btn-secondary" onClick={onOpenProduct}>
            Open product console
          </button>
        </div>
      </header>

      <nav className="ops-tabs" aria-label="Ops sections">
        {(
          [
            ["overview", "Overview"],
            ["issues", "Issues"],
            ["lookup", "Lookup"],
            ["system", "System"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "ops-tab active" : "ops-tab"}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {notice && <p className="ops-notice">{notice}</p>}
      {error && <p className="ops-error">{error}</p>}
      {loading && !overview && <p className="ops-sub">Loading…</p>}

      {tab === "overview" && overview && (
        <section className="ops-section">
          <div className={statusClass(overview.status)}>
            <strong>{overview.status.toUpperCase()}</strong>
            <span>
              System {overview.system_status} · checked {new Date(overview.checked_at).toLocaleString()}
            </span>
          </div>

          <div className="ops-stat-grid">
            <div className="ops-stat">
              <span>Analyses 24h</span>
              <strong>{overview.stats.analyses_24h}</strong>
            </div>
            <div className="ops-stat">
              <span>Analyses 7d</span>
              <strong>{overview.stats.analyses_7d}</strong>
            </div>
            <div className="ops-stat">
              <span>Errors 24h</span>
              <strong>{overview.stats.errors_24h}</strong>
            </div>
            <div className="ops-stat">
              <span>API events 24h</span>
              <strong>{overview.stats.events_24h}</strong>
            </div>
            <div className="ops-stat">
              <span>Avg latency</span>
              <strong>
                {overview.stats.avg_latency_ms != null
                  ? `${overview.stats.avg_latency_ms}ms`
                  : "—"}
              </strong>
            </div>
            <div className="ops-stat">
              <span>p95 latency</span>
              <strong>
                {overview.stats.p95_latency_ms != null
                  ? `${overview.stats.p95_latency_ms}ms`
                  : "—"}
              </strong>
            </div>
          </div>

          <h2>Peak hours (UTC, last 24h API events)</h2>
          <div className="ops-peak" aria-hidden={false}>
            {overview.peak_hours.map((p) => (
              <div key={p.hour} className="ops-peak-bar-wrap" title={`${p.hour}:00 — ${p.count}`}>
                <div
                  className="ops-peak-bar"
                  style={{ height: `${Math.max(4, (p.count / maxPeak) * 64)}px` }}
                />
                <span>{p.hour}</span>
              </div>
            ))}
          </div>

          <h2>Open hang-ups</h2>
          {overview.hangups.length === 0 ? (
            <p className="ops-sub">No recent failures in the last 24 hours.</p>
          ) : (
            <ul className="ops-list">
              {overview.hangups.map((h) => (
                <li key={h.id}>
                  <div>
                    <strong>
                      {h.method} {h.route}
                    </strong>{" "}
                    <span className="ops-badge">{h.status_code}</span>{" "}
                    <span className="ops-badge">{h.category}</span>
                    <p className="ops-sub">
                      {new Date(h.created_at).toLocaleString()}
                      {h.user_email ? ` · ${h.user_email}` : ""} · {h.likely_fix}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className="ops-sub">
            Deploy {overview.deploy.git_sha ?? "unknown"} · boot{" "}
            {new Date(overview.deploy.boot_time).toLocaleString()}
            {overview.last_alert
              ? ` · last alert ${overview.last_alert.severity} @ ${new Date(overview.last_alert.last_sent_at).toLocaleString()}`
              : ""}
          </p>
        </section>
      )}

      {tab === "issues" && (
        <section className="ops-section">
          <h2>Issues feed</h2>
          {issues.length === 0 ? (
            <p className="ops-sub">No failed API events in the last 7 days (or telemetry table not migrated yet).</p>
          ) : (
            <ul className="ops-list">
              {issues.map((issue) => (
                <li key={issue.id}>
                  <div className="ops-issue-row">
                    <div>
                      <strong>
                        {issue.method} {issue.route}
                      </strong>{" "}
                      <span className="ops-badge">{issue.status_code}</span>{" "}
                      <span className="ops-badge">{issue.category}</span>
                      <p className="ops-sub">
                        {new Date(issue.created_at).toLocaleString()}
                        {issue.user_email ? ` · ${issue.user_email}` : ""}
                        {issue.error_code ? ` · ${issue.error_code}` : ""}
                      </p>
                      <p className="ops-fix">{issue.likely_fix}</p>
                    </div>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => void onCopy(issue.diagnosis_packet)}
                    >
                      Copy diagnosis packet
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "lookup" && (
        <section className="ops-section">
          <h2>Lookup (when someone contacts you)</h2>
          <div className="ops-lookup-row">
            <input
              type="email"
              value={lookupEmail}
              onChange={(e) => setLookupEmail(e.target.value)}
              placeholder="user@company.com"
              aria-label="User email"
            />
            <button type="button" className="btn-primary" onClick={() => void runLookup()}>
              Look up
            </button>
          </div>

          {lookup && (
            <div className="ops-lookup-result">
              <p>
                <strong>{lookup.user.email}</strong> · created{" "}
                {new Date(lookup.user.created_at).toLocaleString()}
                {lookup.user.login_provider ? ` · ${lookup.user.login_provider}` : ""}
              </p>

              <label className="ops-note-label">
                Ops note
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  rows={3}
                />
              </label>
              <div className="ops-lookup-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={async () => {
                    try {
                      await founderSaveNote(lookup.user.id, noteDraft);
                      setNotice("Ops note saved.");
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Note failed");
                    }
                  }}
                >
                  Save note
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={async () => {
                    try {
                      const r = await founderPasswordReset(lookup.user.id);
                      setNotice(`Password reset triggered for ${r.email}.`);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Reset failed");
                    }
                  }}
                >
                  Send password reset
                </button>
              </div>

              <h3>Recent failures</h3>
              {lookup.issues.length === 0 ? (
                <p className="ops-sub">No recent API failures for this user.</p>
              ) : (
                <ul className="ops-list">
                  {lookup.issues.map((issue) => (
                    <li key={issue.id}>
                      <div className="ops-issue-row">
                        <div>
                          <strong>
                            {issue.route} · {issue.status_code}
                          </strong>
                          <p className="ops-fix">{issue.likely_fix}</p>
                        </div>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => void onCopy(issue.diagnosis_packet)}
                        >
                          Copy packet
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <h3>Recent analyses</h3>
              {lookup.deals.length === 0 ? (
                <p className="ops-sub">No saved analyses.</p>
              ) : (
                <ul className="ops-list">
                  {lookup.deals.map((deal) => (
                    <li key={deal.id}>
                      <div className="ops-issue-row">
                        <div>
                          <strong>{deal.client_name}</strong> · {deal.deal_status}
                          <p className="ops-sub">
                            {new Date(deal.created_at).toLocaleString()} · {deal.stall_cause}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={async () => {
                            if (
                              !confirm(
                                `Delete analysis for ${deal.client_name}? This cannot be undone.`
                              )
                            ) {
                              return;
                            }
                            try {
                              await founderDeleteDeal(lookup.user.id, deal.id);
                              setNotice("Analysis deleted.");
                              await runLookup();
                            } catch (err) {
                              setError(err instanceof Error ? err.message : "Delete failed");
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      {tab === "system" && system && (
        <section className="ops-section">
          <div className={statusClass(system.status)}>
            <strong>{system.status.toUpperCase()}</strong>
            <span>Checked {new Date(system.checked_at).toLocaleString()}</span>
          </div>
          <p className="ops-sub">
            Deploy {system.deploy.git_sha ?? "unknown"} · process boot{" "}
            {new Date(system.deploy.boot_time).toLocaleString()}
          </p>

          <ul className="ops-list">
            {system.integrations.map((i) => (
              <li key={i.id}>
                <strong>
                  {i.label} — {i.ok ? "OK" : "ISSUE"}
                </strong>
                <p className="ops-sub">{i.meaning}</p>
              </li>
            ))}
          </ul>

          {system.last_purge && (
            <p className="ops-sub">
              Last retention purge: {new Date(system.last_purge.created_at).toLocaleString()} ·{" "}
              {system.last_purge.rows_affected} rows · {system.last_purge.retention_days}d window
            </p>
          )}

          <div className="ops-lookup-actions">
            <button type="button" className="btn-secondary" onClick={() => void refresh()}>
              Recheck
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={async () => {
                try {
                  const r = await founderTestDigest("afternoon");
                  setNotice(
                    r.sent
                      ? `Test digest sent (${r.severity}).`
                      : `Digest not sent: ${r.detail}`
                  );
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Test digest failed");
                }
              }}
            >
              Send test digest email
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
