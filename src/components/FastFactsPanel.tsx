import { useState } from "react";
import { formatCompressedCrmNotes } from "../lib/crmNotes";
import { PostMortemResult, StakeholderSignal } from "../types";

interface Props {
  result: PostMortemResult;
  linkedHubSpotDealId?: string | null;
  linkedSalesforceOppId?: string | null;
  postMortemId?: string | null;
  onPushHubSpot?: (dealId: string, noteBody: string) => Promise<void>;
  onPushSalesforce?: (oppId: string, noteBody: string) => Promise<void>;
}

function coreBlocker(result: PostMortemResult): string {
  const eq = result.equilibrium_analysis;
  const init = result.force_initialization;
  const force = (result.causal_forces ?? []).find(
    (f) => f.type === "Constraint" || f.type === "Structural"
  );
  return (
    result.live_deal_triage?.core_blocker?.trim() ||
    eq?.equilibrium_breaker?.trim() ||
    init?.classification_rationale?.trim() ||
    force?.factor?.trim() ||
    init?.summary?.trim() ||
    result.executive_summary?.trim() ||
    "See full brief for blocker detail"
  );
}

function recoverableLine(status: string): string {
  if (/STRUCTURAL|FLAT|DEAD|LOST/i.test(status) && !/RECOVERABLE/i.test(status)) {
    return "Likely flat no for forecast — do not keep sandbagging without a force change.";
  }
  if (/RECOVERABLE|STALLED|DEFERRED/i.test(status)) {
    return "Recoverable with focused manager action — keep on forecast only if the plan is owned.";
  }
  if (/CLOSED WON|VELOCITY|MOVING|ACTIVE/i.test(status)) {
    return "Moving / healthier path — protect momentum and clear open blockers.";
  }
  return "Judge recoverable vs flat no from the blocker and ownership before the next forecast call.";
}

function detractors(result: PostMortemResult): StakeholderSignal[] {
  return (result.stakeholders ?? []).filter((s) =>
    /hidden detractor|absent decision maker|technical_veto/i.test(
      `${s.persona_type ?? ""} ${s.stance ?? ""} ${s.authority_level ?? ""}`
    )
  );
}

export default function FastFactsPanel({
  result,
  linkedHubSpotDealId,
  linkedSalesforceOppId,
  onPushHubSpot,
  onPushSalesforce,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [pushBusy, setPushBusy] = useState<"hubspot" | "salesforce" | null>(null);
  const [pushNotice, setPushNotice] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  const status = result.deal_classification?.status ?? "UNKNOWN";
  const blocker = coreBlocker(result);
  const vetoPeople = detractors(result);
  const plan = result.rescue_triage_plan;
  const saveSteps = [
    ...(result.immediate_remediation ?? []).slice(0, 2),
    ...(plan?.immediate_0_30_days ?? []).slice(0, 3),
  ].slice(0, 4);

  const noteBody = formatCompressedCrmNotes(result);

  const copyCrm = async () => {
    await navigator.clipboard.writeText(noteBody);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const push = async (provider: "hubspot" | "salesforce") => {
    setPushError(null);
    setPushNotice(null);
    setPushBusy(provider);
    try {
      if (provider === "hubspot") {
        if (!linkedHubSpotDealId || !onPushHubSpot) {
          throw new Error("Import a HubSpot deal first, then Push.");
        }
        await onPushHubSpot(linkedHubSpotDealId, noteBody);
        setPushNotice("Pushed recovery brief to HubSpot as a deal note.");
      } else {
        if (!linkedSalesforceOppId || !onPushSalesforce) {
          throw new Error("Import a Salesforce opportunity first, then Push.");
        }
        await onPushSalesforce(linkedSalesforceOppId, noteBody);
        setPushNotice("Pushed recovery brief to Salesforce as a feed post.");
      }
    } catch (err) {
      setPushError(err instanceof Error ? err.message : "Push failed");
    } finally {
      setPushBusy(null);
    }
  };

  return (
    <div className="fast-facts" data-guide-target="guide-fast-facts">
      <article className="card card-amber concise-card fast-facts-card">
        <h2 className="card-title">What this deal is</h2>
        <div className="card-body">
          <p className="fast-facts-status">{status}</p>
          <p>{recoverableLine(status)}</p>
          <p>
            <strong>Core blocker:</strong> {blocker}
          </p>
          {result.client_name && (
            <p className="meta-line">Account / deal: {result.client_name}</p>
          )}
        </div>
      </article>

      <article className="card card-neutral concise-card fast-facts-card">
        <h2 className="card-title">Main detractors / veto risk</h2>
        <div className="card-body">
          {vetoPeople.length === 0 ? (
            <p>No hidden detractor or absent decision maker mapped — review People Map in Concise.</p>
          ) : (
            <ul className="stall-collision-list">
              {vetoPeople.map((p, i) => (
                <li key={i}>
                  <strong>
                    {p.name}
                    {p.role ? ` (${p.role})` : ""}
                  </strong>
                  {p.persona_type || p.stance ? ` — ${p.persona_type || p.stance}` : ""}
                  {p.evidence && (
                    <>
                      <br />
                      <span className="stall-evidence">
                        "{p.evidence.replace(/^"|"$/g, "").slice(0, 220)}"
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </article>

      <article className="card card-emerald concise-card fast-facts-card">
        <h2 className="card-title">How to save it</h2>
        <div className="card-body">
          {saveSteps.length === 0 ? (
            <p>No immediate actions extracted — open Concise for the full 0–90 day plan.</p>
          ) : (
            <ol className="fast-facts-steps">
              {saveSteps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          )}
        </div>
      </article>

      <div className="fast-facts-actions">
        <button type="button" className="btn-secondary" onClick={() => void copyCrm()}>
          {copied ? "Copied" : "Copy for CRM"}
        </button>
        {linkedHubSpotDealId && onPushHubSpot && (
          <button
            type="button"
            className="btn-secondary"
            disabled={pushBusy !== null}
            onClick={() => void push("hubspot")}
          >
            {pushBusy === "hubspot" ? "Pushing…" : "Push to HubSpot"}
          </button>
        )}
        {linkedSalesforceOppId && onPushSalesforce && (
          <button
            type="button"
            className="btn-secondary"
            disabled={pushBusy !== null}
            onClick={() => void push("salesforce")}
          >
            {pushBusy === "salesforce" ? "Pushing…" : "Push to Salesforce"}
          </button>
        )}
      </div>
      {pushNotice && <p className="demo-transcript-notice">{pushNotice}</p>}
      {pushError && <div className="error-banner">{pushError}</div>}
    </div>
  );
}
