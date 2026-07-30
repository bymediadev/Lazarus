import { PostMortemResult, StakeholderSignal } from "../types";
import { formatMetricLegendMarkdown } from "./metricLegend";

function lineList(items: string[], empty = "—"): string {
  if (!items.length) return empty;
  return items.map((item, i) => `${i + 1}. ${item}`).join("\n");
}

function bulletList(items: string[], empty = "—"): string {
  if (!items.length) return empty;
  return items.map((item) => `- ${item}`).join("\n");
}

function stakeholderLabel(s: StakeholderSignal): string {
  const persona = (s.persona_type ?? s.stance ?? "").trim();
  const role = s.role?.trim();
  const bits = [s.name.trim()];
  if (role) bits.push(`(${role})`);
  if (persona) bits.push(`— ${persona}`);
  return bits.join(" ");
}

function invisibleVetoHolder(result: PostMortemResult): string {
  const stakeholders = result.stakeholders ?? [];
  const veto =
    stakeholders.find((s) =>
      /hidden detractor|absent decision maker/i.test(s.persona_type ?? s.stance ?? "")
    ) ??
    stakeholders.find((s) => /technical_veto|economic_buyer/i.test(s.authority_level ?? ""));
  if (!veto) return "Not identified — review People Map";
  return stakeholderLabel(veto);
}

function coreBlocker(result: PostMortemResult): string {
  const eq = result.equilibrium_analysis;
  const init = result.force_initialization;
  const force = (result.causal_forces ?? []).find(
    (f) => f.type === "Constraint" || f.type === "Structural"
  );
  return (
    eq?.equilibrium_breaker?.trim() ||
    init?.classification_rationale?.trim() ||
    force?.factor?.trim() ||
    init?.summary?.trim() ||
    "See full autopsy for blocker detail"
  );
}

function nextActionDate(result: PostMortemResult): string {
  const immediate =
    result.immediate_remediation?.[0] ||
    result.rescue_triage_plan?.immediate_0_30_days?.[0];
  if (!immediate) return "Within 7 days";
  const dateMatch = immediate.match(/\b(20\d{2}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/);
  return dateMatch ? dateMatch[1] : "Within 7–30 days";
}

function recoverableFraming(status: string): string {
  if (/STRUCTURAL|FLAT|DEAD|LOST/i.test(status)) {
    return "Likely flat no for forecast — do not keep sandbagging this as closable without a new force change.";
  }
  if (/RECOVERABLE|STALLED|DEFERRED/i.test(status)) {
    return "Recoverable with focused manager action — keep on forecast only if the plan below is owned.";
  }
  if (/CLOSED|WON|VELOCITY|MOVING/i.test(status)) {
    return "Moving / healthier path — protect momentum; still clear open blockers.";
  }
  return "Judge recoverable vs flat no from the blocker and ownership below before the next forecast call.";
}

function peopleByRole(result: PostMortemResult): string {
  const stakeholders = result.stakeholders ?? [];
  if (!stakeholders.length) {
    return "- No stakeholders mapped — re-run with a fuller transcript.";
  }

  const groups: { label: string; match: RegExp }[] = [
    { label: "Aligned champion (push internally)", match: /aligned champion/i },
    { label: "Suppressed champion (intent, no authority)", match: /suppressed champion/i },
    { label: "Hidden detractor / veto risk", match: /hidden detractor/i },
    { label: "Absent decision maker", match: /absent decision maker/i },
  ];

  const lines: string[] = [];
  const used = new Set<string>();

  for (const g of groups) {
    const people = stakeholders.filter((s) => g.match.test(s.persona_type ?? s.stance ?? ""));
    if (!people.length) continue;
    lines.push(`**${g.label}:**`);
    for (const p of people) {
      used.add(`${p.name}|${p.role}`);
      const evidence = p.evidence?.replace(/^"|"$/g, "").trim();
      lines.push(
        `- ${stakeholderLabel(p)}${evidence ? `\n  Evidence: "${evidence.slice(0, 220)}${evidence.length > 220 ? "…" : ""}"` : ""}`
      );
    }
    lines.push("");
  }

  const others = stakeholders.filter((s) => !used.has(`${s.name}|${s.role}`));
  if (others.length) {
    lines.push("**Other stakeholders:**");
    for (const p of others) {
      lines.push(`- ${stakeholderLabel(p)}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function whoDoesWhat(result: PostMortemResult): string {
  const lines: string[] = [];
  const stakeholders = result.stakeholders ?? [];
  const champion = stakeholders.find((s) =>
    /aligned champion|suppressed champion/i.test(s.persona_type ?? s.stance ?? "")
  );
  const detractor = stakeholders.find((s) =>
    /hidden detractor/i.test(s.persona_type ?? s.stance ?? "")
  );
  const absent = stakeholders.find((s) =>
    /absent decision maker/i.test(s.persona_type ?? s.stance ?? "")
  );
  const crmNext = result.crm_intelligence?.recommended_next_action?.trim();

  lines.push("- **Sales manager / AE (our side):** Own the next action date, clear the core blocker, and update forecast with recoverable vs flat-no judgment.");
  if (champion) {
    lines.push(
      `- **${champion.name}${champion.role ? ` (${champion.role})` : ""}:** Internal champion — arm them with the evidence and next step they can run inside their org.`
    );
  }
  if (detractor) {
    lines.push(
      `- **${detractor.name}${detractor.role ? ` (${detractor.role})` : ""}:** Likely veto / friction source — do not ignore; surface their concern directly.`
    );
  }
  if (absent) {
    lines.push(
      `- **${absent.name}${absent.role ? ` (${absent.role})` : ""}:** Missing decision-maker — get them in the room or on the thread before treating close date as real.`
    );
  }
  if (crmNext) {
    lines.push(`- **Recommended next move:** ${crmNext}`);
  }

  return lines.join("\n");
}

function whatToDo(result: PostMortemResult): string {
  const immediate = result.immediate_remediation ?? [];
  const plan = result.rescue_triage_plan ?? {
    immediate_0_30_days: [],
    near_term_30_90_days: [],
    long_term_90_plus_days: [],
  };

  const day0 = immediate.length
    ? immediate
    : plan.immediate_0_30_days.slice(0, 2);
  const day30 = plan.immediate_0_30_days;
  const mid = Math.ceil(plan.near_term_30_90_days.length / 2);
  const day60 = plan.near_term_30_90_days.slice(0, mid);
  const day90 = [
    ...plan.near_term_30_90_days.slice(mid),
    ...plan.long_term_90_plus_days,
  ];

  const sections: string[] = [];
  sections.push("**This week (0–7 days):**");
  sections.push(lineList(day0.length ? day0 : day30.slice(0, 2), "Set a dated next step with the champion."));
  sections.push("");
  sections.push("**30 days:**");
  sections.push(lineList(day30, "Hold the weekly recovery motion from this week’s actions."));
  if (day60.length) {
    sections.push("");
    sections.push("**60 days:**");
    sections.push(lineList(day60));
  }
  if (day90.length) {
    sections.push("");
    sections.push("**90 days:**");
    sections.push(lineList(day90));
  }
  return sections.join("\n");
}

function frictionExtras(result: PostMortemResult): string[] {
  const items: string[] = [];
  const f = result.friction_deltas;
  if (!f) return items;
  if (f.administrative_gatekeeping.detected) {
    items.push(
      `Administrative gatekeeping${f.administrative_gatekeeping.evidence ? ` — "${f.administrative_gatekeeping.evidence}"` : ""}`
    );
  }
  if (f.stakeholder_dispersion.detected) {
    const names = f.stakeholder_dispersion.unmapped_names?.length
      ? ` (${f.stakeholder_dispersion.unmapped_names.join(", ")})`
      : "";
    items.push(
      `Stakeholder dispersion${names}${f.stakeholder_dispersion.evidence ? ` — "${f.stakeholder_dispersion.evidence}"` : ""}`
    );
  }
  if (f.budget_scoping_gap.detected) {
    items.push(
      `Budget scoping gap${f.budget_scoping_gap.evidence ? ` — "${f.budget_scoping_gap.evidence}"` : ""}`
    );
  }
  return items;
}

function historicalExtras(result: PostMortemResult): string[] {
  return (result.historical_context_match ?? []).slice(0, 4).map((m) => {
    const prior = m.historical_event ? ` Prior: ${m.historical_event}` : "";
    return `${m.reference_date} · ${m.conflict_type} — "${m.live_dialogue_evidence}"${prior}`;
  });
}

function metricsBlock(result: PostMortemResult): string {
  const pi = result.proprietary_indices;
  const triage = result.live_deal_triage;
  const vs = result.viability_state;
  const dt = result.deal_trajectory;
  const lines: string[] = [];

  if (pi) {
    lines.push(`- **Deal Risk Score:** ${pi.deal_risk_index}/100 (${pi.risk_tier})`);
    lines.push(`- **Department Friction (DFI):** ${pi.multi_department_friction}/100`);
    lines.push(`- **Dispersion:** ${pi.stakeholder_dispersion_index}/100`);
    lines.push(`- **Stall signals:** ${pi.dialogue_stall_score}/100`);
    if (pi.authority_gap_flag) lines.push("- **Authority gap:** Yes");
  } else if (triage && triage.department_friction_index > 0) {
    lines.push(`- **Department friction index:** ${triage.department_friction_index}/100`);
  }
  if (vs) {
    lines.push(`- **Recoverability / Viability:** ${vs.state} (${vs.viability_score}/100)`);
  }
  if (dt?.trajectory_type) {
    lines.push(`- **Trajectory:** ${dt.trajectory_type}`);
  }
  return lines.length ? lines.join("\n") : "- Metrics not available for this run.";
}

/**
 * Manager-ready CRM overview for HubSpot / Salesforce paste:
 * what's going on, who does what, what to do, plus supporting context + legend.
 */
export function formatCompressedCrmNotes(result: PostMortemResult): string {
  const client = result.client_name?.trim() || "Unknown account";
  const status = String(
    result.deal_classification?.status ?? result.deal_status ?? "STALLED"
  );
  const rootIssue =
    result.live_deal_triage?.root_issue?.trim() ||
    result.executive_summary?.trim() ||
    result.diagnosis?.trim() ||
    "Stalled sequence — see blocker";
  const blocker =
    result.live_deal_triage?.core_blocker?.trim() || coreBlocker(result);
  const veto = invisibleVetoHolder(result);
  const nextDate = nextActionDate(result);
  const eqNote = result.equilibrium_analysis?.explanation?.trim();
  const friction = frictionExtras(result);
  const history = historicalExtras(result);

  return [
    `## Lazarus Deal Recovery Overview — ${client}`,
    "",
    "### Exactly what's going on",
    `**Deal status:** ${status}`,
    `**Forecast judgment:** ${recoverableFraming(status)}`,
    `**Root issue:** ${rootIssue}`,
    `**Core blocker:** ${blocker}`,
    `**Invisible veto / missing authority:** ${veto}`,
    eqNote ? `**Why it's stuck:** ${eqNote}` : null,
    "",
    "### Who needs to do what",
    whoDoesWhat(result),
    "",
    "### People map (buying group)",
    peopleByRole(result),
    "",
    "### What to do",
    `**Next action date:** ${nextDate}`,
    "",
    whatToDo(result),
    "",
    "### Snapshot metrics",
    metricsBlock(result),
    friction.length ? "" : null,
    friction.length ? "### Friction & signals" : null,
    friction.length ? bulletList(friction) : null,
    history.length ? "" : null,
    history.length ? "### Historical context" : null,
    history.length ? bulletList(history) : null,
    "",
    "---",
    "",
    formatMetricLegendMarkdown({
      deal_risk_index: result.proprietary_indices?.deal_risk_index,
      multi_department_friction: result.proprietary_indices?.multi_department_friction,
      stakeholder_dispersion_index: result.proprietary_indices?.stakeholder_dispersion_index,
      dialogue_stall_score: result.proprietary_indices?.dialogue_stall_score,
      viability_score: result.viability_state?.viability_score,
    }),
    "",
    `*Generated by Lazarus Deal Recovery · ${new Date().toISOString().slice(0, 10)}*`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}
