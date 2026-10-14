import { useState } from "react";
import { recoveryActionLines, uniqueRecoveryNotes } from "../lib/recoveryPlan";
import { forecastGuidance } from "../lib/forecastCall";
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

function opposing(result: PostMortemResult): StakeholderSignal[] {
  return (result.stakeholders ?? []).filter((s) =>
    /hidden detractor/i.test(`${s.persona_type ?? ""} ${s.stance ?? ""}`)
  );
}

function absentPeople(result: PostMortemResult): StakeholderSignal[] {
  return (result.stakeholders ?? []).filter((s) =>
    /absent decision maker/i.test(`${s.persona_type ?? ""} ${s.stance ?? ""}`)
  );
}

function conditionPeople(result: PostMortemResult): StakeholderSignal[] {
  return (result.stakeholders ?? []).filter((s) =>
    /unmet condition|resource constraint|inactive sponsor|competitive preference/i.test(
      `${s.persona_type ?? ""} ${s.stance ?? ""}`
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
  const trajectory = result.deal_trajectory?.trajectory_type ?? "";
  const guidance = forecastGuidance({
    status,
    trajectory,
    recoverability: result.recoverability_score ?? result.viability_state?.viability_score,
    viabilityState: result.viability_state?.state,
  });
  const blocker = coreBlocker(result);
  const vetoPeople = opposing(result);
  const missingPeople = absentPeople(result);
  const conditionStakeholders = conditionPeople(result);
  const plan = result.rescue_triage_plan;
  const saveSteps = uniqueRecoveryNotes([
    ...(result.immediate_remediation ?? []),
    ...(plan?.immediate_0_30_days ?? []),
  ]).slice(0, 1);

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
          <p>{guidance.line}</p>
          <p>
            <strong>Core blocker:</strong> {blocker}
          </p>
          {result.client_name && (
            <p className="meta-line">Account / deal: {result.client_name}</p>
          )}
        </div>
      </article>

      <article className="card card-neutral concise-card fast-facts-card">
        <h2 className="card-title">People and constraints</h2>
        <div className="card-body">
          {vetoPeople.length === 0 && missingPeople.length === 0 && conditionStakeholders.length === 0 ? (
            <p>No opposing or absent stakeholder is mapped. The people table is in Expanded Analysis.</p>
          ) : (
            <ul className="stall-collision-list">
              {vetoPeople.map((p, i) => (
                <li key={`oppose-${i}`}>
                  <strong>
                    {p.name}
                    {p.role ? ` (${p.role})` : ""}
                  </strong>
                  {p.persona_type || p.stance ? ` — ${p.persona_type || p.stance}` : ""}
                  . Opposition is recorded only when the persona says so. The quotation is in Expanded Analysis.
                </li>
              ))}
              {conditionStakeholders.map((p, i) => (
                <li key={`condition-${i}`}>
                  <strong>
                    {p.name}
                    {p.role ? ` (${p.role})` : ""}
                  </strong>
                  {p.persona_type || p.stance ? ` — ${p.persona_type || p.stance}` : ""}
                  . This is a condition or a limit, not recorded opposition.
                </li>
              ))}
              {missingPeople.map((p, i) => (
                <li key={`absent-${i}`}>
                  <strong>
                    {p.name}
                    {p.role ? ` (${p.role})` : ""}
                  </strong>
                  {" — absent from this evidence. Absence is not a rejection."}
                </li>
              ))}
            </ul>
          )}
        </div>
      </article>

      <article className="card card-emerald concise-card fast-facts-card">
        <h2 className="card-title">CRM-ready next step</h2>
        <div className="card-body">
          <p>{guidance.line}</p>
          {!guidance.showRecoveryPlan ? null : saveSteps.length === 0 ? (
            <p>No immediate action was extracted. The recovery plan above stays empty until the evidence supports one.</p>
          ) : (
            <>
              <ol className="fast-facts-steps">
                {saveSteps.map((s, i) => (
                  <li key={i}>
                    {recoveryActionLines(s).map((line, lineIndex) =>
                      lineIndex === 0 ? (
                        <div key={line}>{line}</div>
                      ) : (
                        <div key={line} className="meta-line">
                          {line}
                        </div>
                      )
                    )}
                  </li>
                ))}
              </ol>
              <p className="meta-line">The full recovery plan is in the brief above. This block is the note to copy.</p>
            </>
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
