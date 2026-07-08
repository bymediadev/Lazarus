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

  const copyActionItems = async () => {
    await navigator.clipboard.writeText(formatActionItems(plan));
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

  const hasPlan = timeline.some((t) => t.items.length > 0);

  return (
    <div className="concise-diagnostic">
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
            Condensed markdown for HubSpot or Salesforce — Root Issue, Core Blocker, and Next Action
            Date in one paste.
          </p>
          <button
            type="button"
            className={`copy-button crm-copy-btn ${copiedCrm ? "copied" : ""}`}
            onClick={copyCrmNotes}
          >
            {copiedCrm ? "Copied!" : "📋 Copy Compressed CRM Notes"}
          </button>
        </div>
      </article>
    </div>
  );
}
