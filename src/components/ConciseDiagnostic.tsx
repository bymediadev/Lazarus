import { useState } from "react";
import { formatCompressedCrmNotes } from "../lib/crmNotes";
import { PostMortemResult, RescueTriagePlan, StakeholderSignal } from "../types";

interface Props {
  result: PostMortemResult;
}

const PERSONA_BADGES = [
  {
    match: /aligned champion/i,
    label: "ALIGNED CHAMPION",
    hint: "Wants to push forward internally",
    className: "persona-badge-champion",
  },
  {
    match: /hidden detractor/i,
    label: "HIDDEN DETRACTOR",
    hint: "InfoSec or Legal blocking silently",
    className: "persona-badge-detractor",
  },
  {
    match: /absent decision maker/i,
    label: "ABSENT DECISION MAKER",
    hint: "Economic buyer missing from interactions",
    className: "persona-badge-absent",
  },
  {
    match: /suppressed champion/i,
    label: "SUPPRESSED CHAMPION",
    hint: "High intent but stripped of authority",
    className: "persona-badge-suppressed",
  },
] as const;

const DEPT_PATTERN =
  /\b(legal|infosec|info\s*sec|security|compliance|procurement|finance|it|hr|engineering|ops)\b/i;

function deriveStallPoint(result: PostMortemResult): {
  headline: string;
  collisions: { label: string; evidence: string }[];
  invisibleVeto: StakeholderSignal | null;
} {
  const init = result.force_initialization;
  const eq = result.equilibrium_analysis;
  const stakeholders = result.stakeholders ?? [];
  const forces = (result.causal_forces ?? []).filter(
    (f) => f.type === "Constraint" || f.type === "Structural"
  );

  const invisibleVeto =
    stakeholders.find((s) => /hidden detractor/i.test(s.persona_type ?? s.stance ?? "")) ??
    stakeholders.find((s) => /absent decision maker/i.test(s.persona_type ?? s.stance ?? "")) ??
    null;

  const deptForces = forces.filter((f) => DEPT_PATTERN.test(`${f.factor} ${f.evidence}`));
  const collisions = deptForces.slice(0, 4).map((f) => ({
    label: f.factor,
    evidence: f.evidence.replace(/^"|"$/g, ""),
  }));

  if (collisions.length === 0 && forces.length > 0) {
    forces.slice(0, 3).forEach((f) => {
      collisions.push({
        label: f.factor,
        evidence: f.evidence.replace(/^"|"$/g, ""),
      });
    });
  }

  const headline =
    eq?.equilibrium_breaker?.trim() ||
    init?.classification_rationale?.trim() ||
    init?.summary?.trim() ||
    result.executive_summary?.trim() ||
    "Multi-department friction detected — review constraint forces below.";

  return { headline, collisions, invisibleVeto };
}

function groupedStakeholders(stakeholders: StakeholderSignal[]) {
  const groups: {
    badge: (typeof PERSONA_BADGES)[number];
    people: StakeholderSignal[];
  }[] = [];
  for (const def of PERSONA_BADGES) {
    const people = stakeholders.filter((s) => def.match.test(s.persona_type ?? s.stance ?? ""));
    if (people.length > 0) groups.push({ badge: def, people });
  }
  return groups;
}

function formatActionItems(plan: RescueTriagePlan): string {
  const sections: [string, string[]][] = [
    ["30 Days", plan.immediate_0_30_days],
    ["60 Days", plan.near_term_30_90_days.slice(0, Math.ceil(plan.near_term_30_90_days.length / 2))],
    [
      "90 Days",
      [
        ...plan.near_term_30_90_days.slice(Math.ceil(plan.near_term_30_90_days.length / 2)),
        ...plan.long_term_90_plus_days,
      ],
    ],
  ];
  return sections
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => `${label}\n${items.map((a, i) => `${i + 1}. ${a}`).join("\n")}`)
    .join("\n\n");
}

function buyingGroupTone(status: string): string {
  if (status === "ALIGNED") return "bg-aligned";
  if (status === "PARTIAL") return "bg-partial";
  return "bg-missing";
}

function pathwayTone(status: string): string {
  if (status === "READY") return "pathway-ready";
  if (status === "GATED") return "pathway-gated";
  if (status === "INSUFFICIENT_HISTORY") return "pathway-thin";
  return "pathway-tracking";
}

function concernTone(status: string): string {
  if (status === "ADDRESSED") return "concern-addressed";
  if (status === "BLOCKING") return "concern-blocking";
  return "concern-open";
}

export default function ConciseDiagnostic({ result }: Props) {
  const [copiedActions, setCopiedActions] = useState(false);
  const [copiedCrm, setCopiedCrm] = useState(false);
  const stall = deriveStallPoint(result);
  const stakeholders = result.stakeholders ?? [];
  const personaGroups = groupedStakeholders(stakeholders);
  const plan = result.rescue_triage_plan ?? {
    immediate_0_30_days: [],
    near_term_30_90_days: [],
    long_term_90_plus_days: [],
  };
  const brief = result.action_brief;
  const buyingGroup = result.buying_group_alignment;
  const pathway = result.contract_readiness;

  const copyActionItems = async () => {
    const text = brief
      ? [
          `What happened: ${brief.what_happened}`,
          `What next: ${brief.what_next}`,
          brief.who_to_contact
            ? `Who: ${brief.who_to_contact.name} (${brief.who_to_contact.role_label})`
            : null,
          "",
          `Primary: ${brief.primary.title}`,
          ...brief.supporting.map((a, i) => `Supporting ${i + 1}: ${a.title}`),
        ]
          .filter(Boolean)
          .join("\n")
      : formatActionItems(plan);
    await navigator.clipboard.writeText(text);
    setCopiedActions(true);
    setTimeout(() => setCopiedActions(false), 2000);
  };

  const copyCrmNotes = async () => {
    await navigator.clipboard.writeText(formatCompressedCrmNotes(result));
    setCopiedCrm(true);
    setTimeout(() => setCopiedCrm(false), 2000);
  };

  const timeline: { phase: string; items: string[] }[] = [
    { phase: "30 Days", items: plan.immediate_0_30_days },
  ];
  const sixty = plan.near_term_30_90_days.slice(0, Math.ceil(plan.near_term_30_90_days.length / 2));
  const ninety = [
    ...plan.near_term_30_90_days.slice(Math.ceil(plan.near_term_30_90_days.length / 2)),
    ...plan.long_term_90_plus_days,
  ];
  if (sixty.length) timeline.push({ phase: "60 Days", items: sixty });
  if (ninety.length) timeline.push({ phase: "90 Days", items: ninety });

  const hasPlan = timeline.some((t) => t.items.length > 0) || !!brief;
  const triage = result.live_deal_triage;
  const historyMatches = result.historical_context_match ?? [];
  const friction = result.friction_deltas;
  const immediate = result.immediate_remediation ?? [];

  return (
    <div className="concise-diagnostic">
      {brief && (
        <article className="card card-emerald concise-card action-brief-card">
          <h2 className="card-title">What happened · What next · Who to contact</h2>
          <div className="card-body">
            <p className="meta-line">
              CRM stage: <strong>{brief.crm_stage}</strong>
              <span className="meta-sep">·</span>
              {brief.noise_cap_note}
            </p>
            <div className="action-brief-grid">
              <div>
                <span className="action-brief-label">What happened</span>
                <p className="stall-headline">{brief.what_happened}</p>
              </div>
              <div>
                <span className="action-brief-label">What to do next</span>
                <p className="stall-headline">{brief.what_next}</p>
                <p className="meta-line">{brief.primary.stage_reason}</p>
              </div>
              <div>
                <span className="action-brief-label">Who to contact</span>
                {brief.who_to_contact ? (
                  <p className="stall-headline">
                    <strong>{brief.who_to_contact.name}</strong>
                    {" · "}
                    {brief.who_to_contact.role_label}
                    <br />
                    <span className="stall-evidence">{brief.who_to_contact.why}</span>
                  </p>
                ) : (
                  <p className="meta-line">No single contact inferred — confirm buying group below.</p>
                )}
              </div>
            </div>
            {brief.supporting.length > 0 && (
              <ol className="timeline-actions supporting-actions">
                {brief.supporting.map((a, i) => (
                  <li key={i}>
                    <strong>{a.title}</strong>
                    {a.completion_signal && (
                      <span className="meta-line"> — done when: {a.completion_signal}</span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </article>
      )}

      {pathway && (
        <article className={`card concise-card contract-pathway-card ${pathwayTone(pathway.gate_status)}`}>
          <h2 className="card-title">Pre-contract pathway (multi-meeting)</h2>
          <div className="card-body">
            <p className="stall-headline">
              <span className={`persona-badge pathway-status-badge ${pathwayTone(pathway.gate_status)}`}>
                {pathway.gate_status}
              </span>{" "}
              {pathway.headline}
            </p>
            <p className="meta-line">{pathway.why_it_matters}</p>
            {pathway.block_contract_send && (
              <p className="pathway-gate-banner">
                Do not send the contract yet — clear every open concern so one unified paper goes out.
              </p>
            )}
            <div className="pathway-stats">
              <span>{pathway.meetings.length} meetings tracked</span>
              <span>{pathway.open_count + pathway.blocking_count} open</span>
              <span>{pathway.addressed_count} addressed</span>
            </div>
            {pathway.meetings.length > 0 && (
              <ol className="pathway-meeting-list">
                {pathway.meetings.map((m, i) => (
                  <li key={i}>
                    <strong>{m.label}</strong>
                    {m.objection_count > 0 && (
                      <span className="meta-line"> — {m.objection_count} logged objection(s)</span>
                    )}
                    {m.veto_holders.length > 0 && (
                      <span className="stall-evidence"> · {m.veto_holders.join(", ")}</span>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {pathway.concerns.length > 0 && (
              <ul className="pathway-concern-list">
                {pathway.concerns.map((c) => (
                  <li key={c.id} className={concernTone(c.status)}>
                    <span className={`persona-badge concern-badge ${concernTone(c.status)}`}>
                      {c.status}
                    </span>{" "}
                    <strong>{c.text}</strong>
                    <br />
                    <span className="meta-line">
                      {c.source_meeting}
                      {c.owner_hint ? ` · Owner: ${c.owner_hint}` : ""}
                      {c.inferred ? " · inferred" : ""}
                    </span>
                    {c.resolution_note && (
                      <>
                        <br />
                        <span className="stall-evidence">{c.resolution_note}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="stall-headline" style={{ marginTop: "0.75rem" }}>
              {pathway.next_unified_step}
            </p>
            <ul className="pathway-checklist">
              {pathway.checklist.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        </article>
      )}

      {buyingGroup && (
        <article className={`card concise-card buying-group-card ${buyingGroupTone(buyingGroup.status)}`}>
          <h2 className="card-title">Buying-group alignment (inferred)</h2>
          <div className="card-body">
            <p className="stall-headline">
              <span className={`persona-badge buying-status-badge ${buyingGroupTone(buyingGroup.status)}`}>
                {buyingGroup.status}
              </span>{" "}
              {buyingGroup.summary}
            </p>
            <p className="meta-line">Confidence {buyingGroup.confidence} · Quiet stakeholders inferred even if never quoted</p>
            <ul className="buying-role-list">
              {buyingGroup.roles.map((role) => (
                <li key={role.role}>
                  <strong>{role.label}</strong>
                  {role.present && !role.quiet && role.holder && (
                    <span> — {role.holder} present</span>
                  )}
                  {role.quiet && role.holder && (
                    <span className="stall-evidence"> — {role.holder} quiet / absent</span>
                  )}
                  {!role.present && <span className="stall-evidence"> — missing (inferred)</span>}
                  {role.evidence && (
                    <>
                      <br />
                      <span className="stall-evidence">"{role.evidence.replace(/^"|"$/g, "")}"</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
            {buyingGroup.quiet_stakeholders.length > 0 && (
              <p className="meta-line">
                Quiet: {buyingGroup.quiet_stakeholders.join(", ")}
              </p>
            )}
          </div>
        </article>
      )}

      {triage && (triage.root_issue || triage.core_blocker) && (
        <article className="card card-amber concise-card">
          <h2 className="card-title">Live Deal Triage</h2>
          <div className="card-body">
            {triage.root_issue && (
              <p>
                <strong>Root issue:</strong> {triage.root_issue}
              </p>
            )}
            {triage.core_blocker && (
              <p>
                <strong>Core blocker:</strong> {triage.core_blocker}
              </p>
            )}
            {triage.department_friction_index > 0 && (
              <p className="meta-line">
                Department friction index: {triage.department_friction_index}
              </p>
            )}
          </div>
        </article>
      )}

      {historyMatches.length > 0 && (
        <article className="card card-neutral concise-card">
          <h2 className="card-title">Historical Context Match</h2>
          <div className="card-body">
            <ul className="stall-collision-list">
              {historyMatches.map((match, i) => (
                <li key={i}>
                  <strong>{match.reference_date}</strong> · {match.conflict_type}
                  <br />
                  <span className="stall-evidence">"{match.live_dialogue_evidence}"</span>
                  {match.historical_event && (
                    <>
                      <br />
                      <span className="meta-line">Prior: {match.historical_event}</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </article>
      )}

      {friction && (
        <article className="card card-neutral concise-card">
          <h2 className="card-title">Friction Deltas</h2>
          <div className="card-body">
            <ul className="stall-collision-list">
              {friction.administrative_gatekeeping.detected && (
                <li>
                  <strong>Administrative gatekeeping</strong>
                  {friction.administrative_gatekeeping.evidence && (
                    <span className="stall-evidence">
                      {" "}
                      — "{friction.administrative_gatekeeping.evidence}"
                    </span>
                  )}
                </li>
              )}
              {friction.stakeholder_dispersion.detected && (
                <li>
                  <strong>Stakeholder dispersion</strong>
                  {friction.stakeholder_dispersion.unmapped_names.length > 0 && (
                    <span> ({friction.stakeholder_dispersion.unmapped_names.join(", ")})</span>
                  )}
                  {friction.stakeholder_dispersion.evidence && (
                    <span className="stall-evidence">
                      {" "}
                      — "{friction.stakeholder_dispersion.evidence}"
                    </span>
                  )}
                </li>
              )}
              {friction.budget_scoping_gap.detected && (
                <li>
                  <strong>Budget scoping gap</strong>
                  {friction.budget_scoping_gap.evidence && (
                    <span className="stall-evidence">
                      {" "}
                      — "{friction.budget_scoping_gap.evidence}"
                    </span>
                  )}
                </li>
              )}
            </ul>
          </div>
        </article>
      )}

      {immediate.length > 0 && !brief && (
        <article className="card card-emerald concise-card">
          <h2 className="card-title">Immediate Remediation (0–7 Days)</h2>
          <div className="card-body">
            <ol className="timeline-actions">
              {immediate.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ol>
          </div>
        </article>
      )}

      <article className="card card-red concise-card">
        <h2 className="card-title">The Stall Point &amp; Invisible Veto-Holder</h2>
        <div className="card-body">
          <p className="stall-headline">{stall.headline}</p>
          {stall.collisions.length > 0 && (
            <ul className="stall-collision-list">
              {stall.collisions.map((c, i) => (
                <li key={i}>
                  <strong>{c.label}</strong>
                  {c.evidence && <span className="stall-evidence"> — "{c.evidence}"</span>}
                </li>
              ))}
            </ul>
          )}
          {stall.invisibleVeto && (
            <div className="invisible-veto-callout">
              <span className="persona-badge persona-badge-detractor">INVISIBLE VETO HOLDER</span>
              <p>
                <strong>{stall.invisibleVeto.name}</strong>
                {stall.invisibleVeto.role && ` · ${stall.invisibleVeto.role}`}
                {stall.invisibleVeto.evidence && (
                  <span className="stall-evidence"> — "{stall.invisibleVeto.evidence.replace(/^"|"$/g, "")}"</span>
                )}
              </p>
            </div>
          )}
          {personaGroups.length > 0 && (
            <div className="people-map-grid" style={{ marginTop: "1rem" }}>
              {personaGroups.map(({ badge, people }) => (
                <div key={badge.label} className="people-map-group">
                  <span className={`persona-badge ${badge.className}`}>{badge.label}</span>
                  <span className="persona-hint">{badge.hint}</span>
                  <ul className="people-map-names">
                    {people.map((s, i) => (
                      <li key={i}>
                        <strong>{s.name}</strong>
                        {s.role && <span className="people-role"> · {s.role}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {result.proprietary_indices && result.proprietary_indices.multi_department_friction > 0 && (
            <p className="meta-line">
              Dept friction index: {result.proprietary_indices.multi_department_friction}
            </p>
          )}
        </div>
      </article>

      <article className="card card-emerald concise-card">
        <h2 className="card-title">The Resuscitation Plan</h2>
        <div className="card-body">
          {!hasPlan ? (
            <p className="meta-line">No rescue actions generated — add more call or email context.</p>
          ) : (
            <div className="resuscitation-timeline">
              {timeline.map((bucket) => (
                <div key={bucket.phase} className="timeline-bucket">
                  <span className="timeline-phase">{bucket.phase}</span>
                  <ol className="timeline-actions">
                    {bucket.items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            className={`copy-button copy-action-items ${copiedActions ? "copied" : ""}`}
            onClick={copyActionItems}
            disabled={!hasPlan}
          >
            {copiedActions ? "Copied!" : "Copy Action Items"}
          </button>
        </div>
      </article>

      <article className="card card-neutral concise-card crm-portability-card">
        <h2 className="card-title">One-Click CRM Portability</h2>
        <div className="card-body">
          <p className="meta-line">
            Condensed markdown for HubSpot or Salesforce — what happened, who to contact, and the
            next stage-aligned move in one paste.
          </p>
          <button
            type="button"
            className={`copy-button crm-copy-btn ${copiedCrm ? "copied" : ""}`}
            onClick={copyCrmNotes}
          >
            {copiedCrm ? "Copied!" : "Copy Compressed CRM Notes"}
          </button>
        </div>
      </article>
    </div>
  );
}
