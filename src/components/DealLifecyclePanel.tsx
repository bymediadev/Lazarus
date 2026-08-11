import { useCallback, useEffect, useState } from "react";
import {
  fetchMyDeal,
  fetchMyDeals,
  type DealThread,
  type MeDealsResponse,
} from "../lib/meDealsApi";

type Props = {
  open: boolean;
  onClose: () => void;
  onOpenRun: (payload: {
    analysis: Record<string, unknown>;
    hubspotDealId?: string | null;
    salesforceOppId?: string | null;
  }) => void;
};

function phaseClass(phase: string): string {
  if (phase === "closed_won" || phase === "unstuck" || phase === "active") {
    return "deal-life-pill deal-life-pill-good";
  }
  if (phase === "stalled_high_risk" || phase === "closed_lost_unlikely") {
    return "deal-life-pill deal-life-pill-bad";
  }
  if (phase.startsWith("stalled") || phase.startsWith("closed_lost")) {
    return "deal-life-pill deal-life-pill-warn";
  }
  return "deal-life-pill";
}

function improveClass(dir: string | undefined): string {
  if (dir === "improved") return "deal-life-delta deal-life-delta-up";
  if (dir === "worsened") return "deal-life-delta deal-life-delta-down";
  return "deal-life-delta";
}

export default function DealLifecyclePanel({ open, onClose, onOpenRun }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MeDealsResponse | null>(null);
  const [selected, setSelected] = useState<DealThread | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchMyDeals();
      setData(next);
      setSelected((prev) => {
        if (!prev) return next.threads[0] ?? null;
        return next.threads.find((t) => t.thread_key === prev.thread_key) ?? next.threads[0] ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load saved deals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  if (!open) return null;

  const openRun = async (runId: string, thread: DealThread) => {
    setOpeningId(runId);
    setError(null);
    try {
      const detail = await fetchMyDeal(runId);
      const hubspot =
        detail.crm?.provider === "hubspot"
          ? detail.crm.external_deal_id
          : thread.crm.provider === "hubspot"
            ? thread.crm.external_deal_id
            : null;
      const salesforce =
        detail.crm?.provider === "salesforce"
          ? detail.crm.external_deal_id
          : thread.crm.provider === "salesforce"
            ? thread.crm.external_deal_id
            : null;
      onOpenRun({
        analysis: detail.analysis,
        hubspotDealId: hubspot,
        salesforceOppId: salesforce,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open run");
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <div className="deal-life-overlay" role="dialog" aria-modal="true" aria-label="Deal lifecycle">
      <button type="button" className="guide-backdrop" aria-label="Close deals" onClick={onClose} />
      <aside className="deal-life-panel">
        <header className="deal-life-header">
          <div>
            <p className="deal-life-kicker">On your account</p>
            <h2>Deals &amp; lifecycle</h2>
            <p>
              Past runs, CRM hooks, and whether each deal is stalled or getting unstuck — without
              opening the CRM.
            </p>
          </div>
          <div className="deal-life-header-actions">
            <button type="button" className="btn-secondary" onClick={() => void refresh()}>
              Refresh
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        {error && <p className="deal-life-error">{error}</p>}
        {loading && !data && <p className="deal-life-muted">Loading saved runs…</p>}

        {data && (
          <>
            <div className="deal-life-summary">
              <div>
                <span>Deals</span>
                <strong>{data.summary.deal_threads}</strong>
              </div>
              <div>
                <span>Runs</span>
                <strong>{data.summary.total_runs}</strong>
              </div>
              <div>
                <span>CRM linked</span>
                <strong>{data.summary.crm_linked}</strong>
              </div>
              <div>
                <span>Stalled</span>
                <strong>{data.summary.stalled}</strong>
              </div>
              <div>
                <span>Unstuck / active</span>
                <strong>{data.summary.unstuck_or_active}</strong>
              </div>
              <div>
                <span>Improved</span>
                <strong>{data.summary.improved}</strong>
              </div>
            </div>

            {data.threads.length === 0 ? (
              <p className="deal-life-muted">
                No saved runs yet. Sign in, run an analysis, and it lands here with CRM linkage when
                you connect HubSpot or Salesforce.
              </p>
            ) : (
              <div className="deal-life-body">
                <ul className="deal-life-list" aria-label="Saved deals">
                  {data.threads.map((thread) => (
                    <li key={thread.thread_key}>
                      <button
                        type="button"
                        className={
                          selected?.thread_key === thread.thread_key
                            ? "deal-life-list-item active"
                            : "deal-life-list-item"
                        }
                        onClick={() => setSelected(thread)}
                      >
                        <span className="deal-life-list-title">{thread.client_name}</span>
                        <span className={phaseClass(thread.lifecycle_phase)}>
                          {thread.lifecycle_label}
                        </span>
                        <span className="deal-life-list-meta">
                          {thread.run_count} run{thread.run_count === 1 ? "" : "s"}
                          {thread.crm.linked
                            ? ` · ${thread.crm.provider} ${thread.crm.external_deal_id}`
                            : " · no CRM link"}
                        </span>
                        {thread.improvement && (
                          <span className={improveClass(thread.improvement.direction)}>
                            {thread.improvement.direction}: {thread.improvement.summary}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>

                {selected && (
                  <section className="deal-life-detail" aria-label="Deal timeline">
                    <h3>{selected.client_name}</h3>
                    <p className="deal-life-muted">{selected.headline}</p>

                    <div className="deal-life-detail-grid">
                      <div>
                        <span>Lifecycle</span>
                        <strong className={phaseClass(selected.lifecycle_phase)}>
                          {selected.lifecycle_label}
                        </strong>
                      </div>
                      <div>
                        <span>Viability</span>
                        <strong>
                          {selected.viability_score != null ? selected.viability_score : "—"}
                        </strong>
                      </div>
                      <div>
                        <span>Deal risk</span>
                        <strong>
                          {selected.deal_risk_index != null ? selected.deal_risk_index : "—"}
                          {selected.risk_tier ? ` · ${selected.risk_tier}` : ""}
                        </strong>
                      </div>
                      <div>
                        <span>Value</span>
                        <strong>
                          {selected.deal_value
                            ? `$${Number(selected.deal_value).toLocaleString()}`
                            : "—"}
                        </strong>
                      </div>
                    </div>

                    <h4>CRM</h4>
                    {selected.crm.linked ? (
                      <p className="deal-life-muted">
                        Linked to <strong>{selected.crm.provider}</strong> deal{" "}
                        <code>{selected.crm.external_deal_id}</code>
                        {selected.crm.last_inbound_at
                          ? ` · last inbound ${new Date(selected.crm.last_inbound_at).toLocaleString()}`
                          : ""}
                        {selected.crm.last_outbound_at
                          ? ` · last push ${new Date(selected.crm.last_outbound_at).toLocaleString()}`
                          : ""}
                        . Track stall vs unstuck here; open CRM only when you need to edit the
                        record.
                      </p>
                    ) : (
                      <p className="deal-life-muted">
                        Not linked yet. Connect HubSpot/Salesforce on the deal profile before a run
                        to hook this timeline to the CRM record.
                      </p>
                    )}

                    {selected.account_id && (
                      <p className="deal-life-muted">Account / domain: {selected.account_id}</p>
                    )}
                    {selected.core_blocker && (
                      <p className="deal-life-blocker">
                        <strong>Core blocker:</strong> {selected.core_blocker}
                      </p>
                    )}

                    {selected.improvement && (
                      <p className={improveClass(selected.improvement.direction)}>
                        Since first run: {selected.improvement.summary}
                      </p>
                    )}

                    <h4>Timeline</h4>
                    <ol className="deal-life-timeline">
                      {selected.timeline.map((run, idx) => (
                        <li key={run.id}>
                          <div className="deal-life-timeline-card">
                            <div className="deal-life-timeline-top">
                              <span className="deal-life-timeline-when">
                                {new Date(run.created_at).toLocaleString()}
                                {idx === 0 ? " · latest" : ""}
                              </span>
                              <span className={phaseClass(run.lifecycle_phase)}>
                                {run.lifecycle_label}
                              </span>
                            </div>
                            <p className="deal-life-timeline-status">{run.deal_status}</p>
                            <p className="deal-life-muted">
                              Viability {run.viability_score ?? "—"}
                              {run.deal_risk_index != null ? ` · risk ${run.deal_risk_index}` : ""}
                              {run.trajectory_type ? ` · ${run.trajectory_type}` : ""}
                            </p>
                            {run.since_previous && (
                              <p className={improveClass(run.since_previous.direction)}>
                                vs prior run: {run.since_previous.summary}
                              </p>
                            )}
                            <button
                              type="button"
                              className="btn-primary"
                              disabled={openingId === run.id}
                              onClick={() => void openRun(run.id, selected)}
                            >
                              {openingId === run.id ? "Opening…" : "Open this run"}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
