import { useCallback, useEffect, useState } from "react";
import { apiAuthHeaders } from "../lib/api";
import {
  copyText,
  fetchFounderApis,
  fetchFounderCrashes,
  fetchFounderIssues,
  fetchFounderOverview,
  fetchFounderSystem,
  founderDeleteDeal,
  founderLookup,
  founderPasswordReset,
  founderRestoreSnapshot,
  founderSaveNote,
  founderSetKillSwitch,
  founderSetSpendCap,
  founderTestDigest,
  fetchFounderContactInquiries,
  type ContactInquiry,
  type FounderApisInventory,
  type VendorDashboard,
} from "../lib/founderApi";
import { isFounderUnlimitedEmail } from "../lib/guestUsage";
import { trustPackUrl } from "../lib/trustPack";

type Tab = "overview" | "apis" | "issues" | "lookup" | "system" | "controls";

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
  const [apis, setApis] = useState<FounderApisInventory | null>(null);
  const [crashes, setCrashes] = useState<
    Awaited<ReturnType<typeof fetchFounderCrashes>>["crashes"]
  >([]);
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookup, setLookup] = useState<Awaited<ReturnType<typeof founderLookup>> | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [capDraft, setCapDraft] = useState("");
  const [pauseDraft, setPauseDraft] = useState("");
  const [inquiries, setInquiries] = useState<ContactInquiry[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, iss, sys, inv, crash, inbox] = await Promise.all([
        fetchFounderOverview(),
        fetchFounderIssues(),
        fetchFounderSystem(),
        fetchFounderApis().catch(() => null),
        fetchFounderCrashes().catch(() => ({ crashes: [] })),
        fetchFounderContactInquiries().catch(() => ({ inquiries: [] as ContactInquiry[] })),
      ]);
      setOverview(ov);
      setIssues(iss.issues);
      setSystem(sys);
      setApis(inv);
      setCrashes(crash.crashes);
      setInquiries(inbox.inquiries);
      setCapDraft(sys.spend.global_daily_cap != null ? String(sys.spend.global_daily_cap) : "");
      setPauseDraft(sys.runtime.pause_message);
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

  const providerStatusClass = (s: string) => {
    if (s === "out" || s === "exhausted" || s === "critical") return "ops-status ops-status-critical";
    if (s === "degraded" || s === "pay_soon" || s === "watch" || s === "warning")
      return "ops-status ops-status-warning";
    if (s === "not_configured" || s === "unknown" || s === "info") return "ops-status";
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
  const maxDayTotal = Math.max(1, ...(apis?.usage.series.map((d) => d.total) ?? [1]));
  const showBattlecard = isFounderUnlimitedEmail(opsEmail);

  const openSecurityBattlecard = async () => {
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(trustPackUrl("battlecard"), { headers: apiAuthHeaders() });
      if (!res.ok) {
        throw new Error(
          res.status === 403
            ? "Security Battlecard is limited to the founder account."
            : `Failed to open battlecard (${res.status})`
        );
      }
      const html = await res.text();
      const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open Security Battlecard");
    }
  };

  return (
    <div className="ops-console">
      <header className="ops-header">
        <div>
          <p className="ops-kicker">Ops Command Center</p>
          <h1>Founder Ops Command Center</h1>
          <p className="ops-sub">
            Signed in as {opsEmail ?? "ops"} — under-the-hood view of the live database,
            API health, hang-ups, and user accounts. Diagnose here, fix in Cursor.
          </p>
        </div>
        <div className="ops-header-actions">
          {showBattlecard && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void openSecurityBattlecard()}
              title="Open founder Security Battlecard (SEC-002)"
            >
              Security Battlecard
            </button>
          )}
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
            ["controls", "Controls"],
            ["apis", "APIs & usage"],
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

      {(system?.vendor_dashboards ?? apis?.vendor_dashboards)?.length ? (
        <VendorConsoles dashboards={system?.vendor_dashboards ?? apis?.vendor_dashboards ?? []} />
      ) : null}

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

          {apis && (
            <p className="ops-sub ops-apis-headline">
              <button type="button" className="ops-inline-link" onClick={() => setTab("apis")}>
                APIs &amp; usage
              </button>
              : {apis.headline}
            </p>
          )}

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

      {tab === "apis" && !apis && !loading && (
        <section className="ops-section">
          <p className="ops-error">Could not load APIs inventory. Restart the API and click Refresh.</p>
        </section>
      )}

      {tab === "apis" && apis && (
        <section className="ops-section">
          <div className={statusClass(apis.status)}>
            <strong>{apis.status.toUpperCase()}</strong>
            <span>Checked {new Date(apis.checked_at).toLocaleString()}</span>
          </div>
          <p className="ops-sub">{apis.headline}</p>

          <h2>What&apos;s out</h2>
          {apis.outages.length === 0 ? (
            <p className="ops-sub">Nothing out or degraded right now.</p>
          ) : (
            <ul className="ops-list">
              {apis.outages.map((o) => (
                <li key={o.id}>
                  <strong>
                    {o.label} — {o.status.toUpperCase()}
                  </strong>
                  <p className="ops-sub">{o.meaning}</p>
                  <p className="ops-fix">{o.billing.detail}</p>
                </li>
              ))}
            </ul>
          )}

          <h2>Need to pay / at the end of usage?</h2>
          {apis.billing_alerts.length === 0 ? (
            <p className="ops-sub">No billing or quota alerts. Usage looks fine.</p>
          ) : (
            <ul className="ops-list">
              {apis.billing_alerts.map((a) => (
                <li key={a.id}>
                  <div
                    className={providerStatusClass(
                      a.severity === "critical" ? "out" : a.severity === "warning" ? "degraded" : "info"
                    )}
                  >
                    <strong>{a.severity.toUpperCase()}</strong>
                    <span>{a.title}</span>
                  </div>
                  <p className="ops-sub">{a.detail}</p>
                  <p className="ops-fix">{a.action}</p>
                </li>
              ))}
            </ul>
          )}

          <h2>Error mix — changed vs prior week?</h2>
          <p className="ops-sub">
            {apis.category_changed
              ? "Yes — categorization shifted (AI / Auth / CRM / Quota / Network)."
              : "No material change in failure categories vs the prior 7 days."}
          </p>
          <div className="ops-stat-grid">
            {apis.category_shift.map((c) => (
              <div key={c.category} className={`ops-stat${c.changed ? " ops-stat-changed" : ""}`}>
                <span>{c.category}</span>
                <strong>
                  {c.current_7d}
                  <span className="ops-delta">
                    {" "}
                    ({c.delta > 0 ? "+" : ""}
                    {c.delta})
                  </span>
                </strong>
                <span className="ops-stat-foot">prior {c.prior_7d}</span>
              </div>
            ))}
          </div>

          <h2>Usage (7d)</h2>
          <div className="ops-stat-grid">
            <div className="ops-stat">
              <span>Analyses</span>
              <strong>{apis.usage.analyses_7d}</strong>
              <span className="ops-stat-foot">prior {apis.usage.analyses_prior_7d}</span>
            </div>
            <div className="ops-stat">
              <span>API events</span>
              <strong>{apis.usage.events_7d}</strong>
            </div>
            <div className="ops-stat">
              <span>Errors</span>
              <strong>{apis.usage.errors_7d}</strong>
            </div>
            <div className="ops-stat">
              <span>Quota errors</span>
              <strong>{apis.usage.quota_errors_7d}</strong>
              <span className="ops-stat-foot">prior {apis.usage.quota_errors_prior_7d}</span>
            </div>
          </div>
          {apis.usage.series.length > 0 && (
            <div className="ops-peak ops-usage-bars">
              {apis.usage.series.map((d) => (
                <div
                  key={d.day}
                  className="ops-peak-bar-wrap"
                  title={`${d.day}: ${d.total} events, ${d.errors} errors, ${d.quota_errors} quota`}
                >
                  <div
                    className="ops-peak-bar"
                    style={{ height: `${Math.max(4, (d.total / maxDayTotal) * 64)}px` }}
                  />
                  <span>{d.day.slice(5)}</span>
                </div>
              ))}
            </div>
          )}

          <h2>Every provider (consolidated)</h2>
          <ul className="ops-list">
            {apis.providers.map((p) => (
              <li key={p.id}>
                <div className="ops-issue-row">
                  <div>
                    <strong>
                      {p.label}{" "}
                      <span className="ops-badge">{p.status}</span>{" "}
                      <span className="ops-badge">{p.category}</span>{" "}
                      <span className="ops-badge">bill:{p.billing.level}</span>
                    </strong>
                    <p className="ops-sub">{p.meaning}</p>
                    <p className="ops-fix">
                      {p.billing.detail}
                      {p.billing.metric_label != null && p.billing.metric_value != null
                        ? ` · ${p.billing.metric_label}=${p.billing.metric_value}`
                        : ""}
                      {p.error_count_7d > 0 ? ` · ${p.error_count_7d} related errors (7d)` : ""}
                      {p.last_error_at
                        ? ` · last fail ${new Date(p.last_error_at).toLocaleString()}`
                        : ""}
                      {p.dashboard_url ? (
                        <>
                          {" "}
                          ·{" "}
                          <a href={p.dashboard_url} target="_blank" rel="noopener noreferrer">
                            Open dashboard
                          </a>
                        </>
                      ) : null}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="ops-lookup-actions">
            <button type="button" className="btn-secondary" onClick={() => void refresh()}>
              Reprobe APIs
            </button>
          </div>
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

          <h2>Browser crashes</h2>
          {crashes.length === 0 ? (
            <p className="ops-sub">No client crashes reported in the last 7 days.</p>
          ) : (
            <ul className="ops-list">
              {crashes.map((crash) => (
                <li key={crash.id}>
                  <div className="ops-issue-row">
                    <div>
                      <strong>{crash.message}</strong>
                      <p className="ops-sub">
                        {new Date(crash.created_at).toLocaleString()}
                        {crash.user_email ? ` · ${crash.user_email}` : ""}
                        {crash.page_url ? ` · ${crash.page_url}` : ""}
                        {crash.release_sha ? ` · ${crash.release_sha}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => void onCopy(crash.diagnosis_packet)}
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
          <div className="ops-inbox">
            <h3>Website contact form</h3>
            {inquiries.length === 0 ? (
              <p className="ops-sub">No inbound notes yet. New submissions land here even without Resend.</p>
            ) : (
              <ul className="ops-list">
                {inquiries.map((note) => (
                  <li key={note.id}>
                    <div className="ops-issue-row">
                      <div>
                        <strong>
                          {note.topic} · {note.email}
                        </strong>
                        <p className="ops-sub">
                          {note.name ? `${note.name} · ` : ""}
                          {new Date(note.created_at).toLocaleString()}
                        </p>
                        <p className="ops-sub">{note.message}</p>
                      </div>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setLookupEmail(note.email)}
                      >
                        Use this email
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
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

              {lookup.billing && (
                <div className="ops-billing-snapshot">
                  <h3>Billing</h3>
                  <p>
                    {lookup.billing.plan_label} · {lookup.billing.status} ·{" "}
                    {lookup.billing.analyses_remaining_label}
                  </p>
                  {lookup.billing.period_end && (
                    <p className="ops-sub">
                      Period ends {new Date(lookup.billing.period_end).toLocaleDateString()}
                    </p>
                  )}
                  {lookup.billing.stripe_customer_id && (
                    <p className="ops-sub">Stripe customer {lookup.billing.stripe_customer_id}</p>
                  )}
                  {lookup.billing.invoices[0] && (
                    <p className="ops-sub">
                      Last invoice {new Date(lookup.billing.invoices[0].created).toLocaleDateString()}{" "}
                      · {lookup.billing.invoices[0].status}
                    </p>
                  )}
                </div>
              )}

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

      {tab === "controls" && system && (
        <section className="ops-section">
          <div className={statusClass(system.runtime.analyses_paused ? "critical" : system.status)}>
            <strong>{system.runtime.analyses_paused ? "PAUSED" : "LIVE"}</strong>
            <span>
              {system.runtime.analyses_paused
                ? system.runtime.pause_message
                : "Analyses are running. Founder/ops accounts still work if you pause."}
            </span>
          </div>

          <h2>Kill switch</h2>
          <p className="ops-sub">
            Turns off post-mortem, live triage, and live objections for everyone except founder/ops.
            Use this instead of waiting on a deploy.
          </p>
          <label className="ops-note-label">
            Pause message
            <input
              type="text"
              value={pauseDraft}
              onChange={(e) => setPauseDraft(e.target.value)}
              maxLength={280}
            />
          </label>
          <div className="ops-lookup-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={async () => {
                if (
                  !confirm(
                    "Pause analyses for everyone except founder/ops? They will see your pause message."
                  )
                ) {
                  return;
                }
                try {
                  await founderSetKillSwitch(true, pauseDraft);
                  setNotice("Analyses paused for non-ops users.");
                  await refresh();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Kill switch failed");
                }
              }}
            >
              Pause analyses
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={async () => {
                try {
                  await founderSetKillSwitch(false, pauseDraft);
                  setNotice("Analyses resumed.");
                  await refresh();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Resume failed");
                }
              }}
            >
              Resume analyses
            </button>
          </div>

          <h2>Spend fuses</h2>
          <p className="ops-sub">
            Product caps — not Google&apos;s dollar budget. Guest {system.spend.guest_cap} per
            browser · IP daily {system.spend.guest_daily_limit} · analyses today{" "}
            {system.spend.analyses_today}
            {system.spend.global_daily_cap != null
              ? ` · global daily cap ${system.spend.global_daily_cap}`
              : " · no extra global daily cap"}
            .
          </p>
          <label className="ops-note-label">
            Global daily analysis cap (empty = off)
            <input
              type="number"
              min={1}
              value={capDraft}
              onChange={(e) => setCapDraft(e.target.value)}
              placeholder="e.g. 40"
            />
          </label>
          <div className="ops-lookup-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={async () => {
                try {
                  const n = capDraft.trim() === "" ? null : Number(capDraft);
                  await founderSetSpendCap(n);
                  setNotice(
                    n == null ? "Global daily cap cleared." : `Global daily cap set to ${n}.`
                  );
                  await refresh();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Spend cap failed");
                }
              }}
            >
              Save daily cap
            </button>
          </div>

          <h2>LLM credit / quota</h2>
          <p className="ops-sub">
            Model {system.spend.gemini_model}. {system.spend.llm_fails_at_zero} Dollar caps live in
            the vendor consoles above — this page does not set Google or AssemblyAI budgets.
          </p>
          {apis && (
            <p className="ops-fix">
              Gemini {apis.providers.find((p) => p.id === "gemini")?.status ?? "unknown"} · quota
              errors 7d {apis.usage.quota_errors_7d} · {apis.providers.find((p) => p.id === "gemini")?.billing.detail}
            </p>
          )}

          <h2>Hotfix path</h2>
          <p className="ops-sub">
            SHA {system.deploy.git_sha ?? "unknown"}
            {system.deploy.git_branch ? ` · ${system.deploy.git_branch}` : ""}
            {system.deploy.render_service ? ` · ${system.deploy.render_service}` : ""} · boot{" "}
            {new Date(system.deploy.boot_time).toLocaleString()}
          </p>
          <p className="ops-fix">{system.deploy.hotfix}</p>

          <h2>Database restore drill</h2>
          {system.restore.last_snapshot ? (
            <p className="ops-sub">
              Last snapshot {new Date(system.restore.last_snapshot.created_at).toLocaleString()} ·{" "}
              {Object.entries(system.restore.last_snapshot.counts)
                .map(([k, v]) => `${k}=${v ?? "—"}`)
                .join(" · ")}
            </p>
          ) : (
            <p className="ops-sub">No snapshot yet. Take one before you touch Backups.</p>
          )}
          <ol className="ops-runbook">
            {system.restore.runbook.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="ops-lookup-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={async () => {
                try {
                  const r = await founderRestoreSnapshot();
                  setNotice(
                    `Snapshot saved (${r.snapshot.counts.call_post_mortems ?? 0} analyses).`
                  );
                  await refresh();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Snapshot failed");
                }
              }}
            >
              Snapshot counts now
            </button>
          </div>
        </section>
      )}

      {tab === "system" && system && (
        <section className="ops-section">
          <div className={statusClass(system.status)}>
            <strong>{system.status.toUpperCase()}</strong>
            <span>Checked {new Date(system.checked_at).toLocaleString()}</span>
          </div>
          <p className="ops-sub">
            Deploy {system.deploy.git_sha ?? "unknown"}
            {system.deploy.git_branch ? ` · ${system.deploy.git_branch}` : ""} · process boot{" "}
            {new Date(system.deploy.boot_time).toLocaleString()}
          </p>
          <p className="ops-fix">{system.deploy.hotfix}</p>

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

function VendorConsoles({ dashboards }: { dashboards: VendorDashboard[] }) {
  if (dashboards.length === 0) return null;
  return (
    <section className="ops-vendor-strip" aria-label="Vendor dashboards">
      <h2 className="ops-vendor-heading">Vendor consoles</h2>
      <div className="ops-vendor-grid">
        {dashboards.map((d) => (
          <article key={d.id} className="ops-vendor-card">
            <a className="ops-vendor-link" href={d.href} target="_blank" rel="noopener noreferrer">
              {d.label}
            </a>
            <p className="ops-sub">{d.why}</p>
            {d.extra && d.extra.length > 0 ? (
              <p className="ops-vendor-extra">
                {d.extra.map((e, i) => (
                  <span key={e.href}>
                    {i > 0 ? " · " : null}
                    <a href={e.href} target="_blank" rel="noopener noreferrer">
                      {e.label}
                    </a>
                  </span>
                ))}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
