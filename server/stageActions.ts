/**
 * Low-friction, stage-aligned action pack: what happened, what to do next, who to contact.
 * Caps noise at 1 primary + 2 supporting moves.
 */

import {
  type BuyingGroupAlignment,
  type BuyingGroupRole,
} from "./buyingGroup.js";

export type PipelineStageBucket =
  | "discovery"
  | "evaluation"
  | "proposal"
  | "negotiation"
  | "closed"
  | "unknown";

export interface ActionContact {
  name: string;
  role_label: string;
  why: string;
}

export interface StageAction {
  title: string;
  owner: "AE" | "Manager" | "SE" | "CS";
  contact: ActionContact | null;
  objective: string;
  completion_signal: string;
  stage_reason: string;
}

export interface LowFrictionBrief {
  what_happened: string;
  what_next: string;
  who_to_contact: ActionContact | null;
  crm_stage: string;
  stage_bucket: PipelineStageBucket;
  primary: StageAction;
  supporting: StageAction[];
  noise_cap_note: string;
}

export interface StageActionInput {
  dealStage?: string;
  executiveSummary?: string;
  coreBlocker?: string;
  rootIssue?: string;
  recommendedNext?: string;
  immediateRemediation?: string[];
  buyingGroup: BuyingGroupAlignment;
  stakeholders?: Array<{
    name: string;
    role?: string;
    persona_type?: string;
    stance?: string;
    evidence?: string;
  }>;
}

const ROLE_LABEL: Record<BuyingGroupRole, string> = {
  champion: "Champion",
  economic_buyer: "Economic buyer",
  technical_veto: "Technical / security veto",
  procurement: "Procurement / legal",
};

export function normalizePipelineStage(raw: string | undefined): {
  label: string;
  bucket: PipelineStageBucket;
} {
  const s = (raw ?? "").trim();
  const n = s.toLowerCase().replace(/[_-]+/g, " ");
  if (!n) return { label: "Unknown / not set", bucket: "unknown" };

  if (/closed.?won|closedwon|won/.test(n)) return { label: s || "Closed Won", bucket: "closed" };
  if (/closed.?lost|closedlost|lost/.test(n)) return { label: s || "Closed Lost", bucket: "closed" };
  if (/contract|negotiat|legal review|redline|procurement/.test(n)) {
    return { label: s, bucket: "negotiation" };
  }
  if (/proposal|quote|pricing|pilot proposal|commercial/.test(n)) {
    return { label: s, bucket: "proposal" };
  }
  if (/eval|demo|poc|proof|technical|security review|deep dive/.test(n)) {
    return { label: s, bucket: "evaluation" };
  }
  if (/discover|qualify|sql|mql|intro|awareness|lead|appoint/.test(n)) {
    return { label: s, bucket: "discovery" };
  }
  return { label: s, bucket: "unknown" };
}

function firstMissingRole(
  bg: BuyingGroupAlignment,
  bucket: PipelineStageBucket
): BuyingGroupRole | null {
  if (!bg.missing_roles.length) return null;

  const priorityByBucket: Record<PipelineStageBucket, BuyingGroupRole[]> = {
    discovery: ["economic_buyer", "champion", "technical_veto", "procurement"],
    evaluation: ["technical_veto", "economic_buyer", "champion", "procurement"],
    proposal: ["economic_buyer", "technical_veto", "procurement", "champion"],
    negotiation: ["procurement", "technical_veto", "economic_buyer", "champion"],
    closed: ["champion", "economic_buyer", "technical_veto", "procurement"],
    unknown: ["technical_veto", "economic_buyer", "champion", "procurement"],
  };

  const priority = priorityByBucket[bucket];

  // Prefer a missing role that already has a named quiet holder (actionable contact).
  const named = bg.roles.filter(
    (r) => bg.missing_roles.includes(r.role) && r.holder
  );
  for (const role of priority) {
    if (named.some((r) => r.role === role)) return role;
  }
  for (const role of priority) {
    if (bg.missing_roles.includes(role)) return role;
  }
  return bg.missing_roles[0] ?? null;
}

function contactForRole(
  role: BuyingGroupRole | null,
  input: StageActionInput
): ActionContact | null {
  if (!role) return null;
  const presence = input.buyingGroup.roles.find((r) => r.role === role);
  if (presence?.holder) {
    return {
      name: presence.holder,
      role_label: presence.label,
      why: presence.quiet
        ? "Quiet / absent on recent calls — re-engage before advancing stage"
        : "Mapped buying-group role for this stage",
    };
  }

  const stakeholders = input.stakeholders ?? [];
  const quiet = stakeholders.find((s) =>
    /absent|hidden|suppressed/i.test(s.persona_type ?? s.stance ?? "")
  );
  if (quiet) {
    return {
      name: quiet.name,
      role_label: ROLE_LABEL[role],
      why: "Inferred gap — bring this person into the next live conversation",
    };
  }

  return {
    name: `Unidentified ${ROLE_LABEL[role].toLowerCase()}`,
    role_label: ROLE_LABEL[role],
    why: "Role not on the call — ask champion to introduce before contract stage",
  };
}

function stageObjective(
  bucket: PipelineStageBucket,
  missing: BuyingGroupRole | null
): { title: string; objective: string; completion: string; reason: string } {
  const missLabel = missing ? ROLE_LABEL[missing] : null;

  switch (bucket) {
    case "discovery":
      return {
        title: missLabel
          ? `Map and book the ${missLabel.toLowerCase()}`
          : "Confirm buying-group map before next meeting",
        objective: missLabel
          ? `Get an introduction to the ${missLabel.toLowerCase()} and confirm their success criteria.`
          : "Confirm champion, economic buyer, and technical veto are named with next meetings booked.",
        completion: "Calendar invite accepted by the missing role (or written intro sent).",
        reason: "Discovery should produce a complete buying map — not just interest.",
      };
    case "evaluation":
      return {
        title: missLabel
          ? `Run a working session with the ${missLabel.toLowerCase()}`
          : "Close open technical / security questions",
        objective: missLabel
          ? `Remove the ${missLabel.toLowerCase()} gap with a scoped deep-dive and explicit go/no-go.`
          : "Convert evaluation feedback into a stage-exit checklist both sides share.",
        completion: "Written go/no-go or open-issue list from the veto role.",
        reason: "Evaluation stalls when a quiet veto never joins the room.",
      };
    case "proposal":
      return {
        title: missLabel
          ? `Validate proposal with ${missLabel.toLowerCase()} before send`
          : "Align proposal to buying-group success criteria",
        objective: missLabel
          ? `Do not send commercials until the ${missLabel.toLowerCase()} has reviewed scope.`
          : "Send a phased proposal only after buying-group alignment is confirmed.",
        completion: "Proposal acknowledged by champion + economic buyer (or documented blocker).",
        reason: "Proposal without buying-group alignment creates false pipeline.",
      };
    case "negotiation":
      return {
        title: missLabel
          ? `Unstick ${missLabel.toLowerCase()} before redlines advance`
          : "Keep legal/procurement path on a dated checklist",
        objective: missLabel
          ? `Resolve the ${missLabel.toLowerCase()} gap — contract stage without them is forecast risk.`
          : "Drive a dated legal/procurement checklist with a single owner on both sides.",
        completion: "Next legal/procurement milestone date confirmed in writing.",
        reason: "Negotiation fails when quiet stakeholders surface after paper is out.",
      };
    case "closed":
      return {
        title: "Document handover + expansion owners",
        objective: "Capture veto holders and champions for CS/expansion — do not lose the buying map.",
        completion: "Handover note with named economic buyer and technical owner.",
        reason: "Closed deals still need the buying group for expansion and renewals.",
      };
    default:
      return {
        title: missLabel
          ? `Close the ${missLabel.toLowerCase()} gap before advancing stage`
          : "Confirm stage and buying-group map",
        objective: missLabel
          ? `Identify and engage the ${missLabel.toLowerCase()} before CRM stage advances.`
          : "Set CRM stage accurately and confirm who must be present for the next exit criteria.",
        completion: "Named contact + next meeting on calendar.",
        reason: "Stage-aligned action requires a known CRM stage and complete buying map.",
      };
  }
}

function supportingFromRemediation(
  items: string[] | undefined,
  primaryTitle: string
): StageAction[] {
  const out: StageAction[] = [];
  for (const raw of items ?? []) {
    const text = raw.replace(/^\d+\s*\[[^\]]+\]:\s*/i, "").trim();
    if (!text) continue;
    if (normalizeLoose(text) === normalizeLoose(primaryTitle)) continue;
    out.push({
      title: text.length > 90 ? `${text.slice(0, 87)}…` : text,
      owner: "AE",
      contact: null,
      objective: text,
      completion_signal: "Logged in CRM with date and owner",
      stage_reason: "Supporting move from call remediation (capped to reduce noise)",
    });
    if (out.length >= 2) break;
  }
  return out;
}

function normalizeLoose(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Build the low-noise brief Liam asked for: what happened → what next → who. */
export function buildLowFrictionBrief(input: StageActionInput): LowFrictionBrief {
  const { label, bucket } = normalizePipelineStage(input.dealStage);
  const missing = firstMissingRole(input.buyingGroup, bucket);
  const contact = contactForRole(missing, input);
  const staged = stageObjective(bucket, missing);

  const what_happened =
    input.rootIssue?.trim() ||
    input.coreBlocker?.trim() ||
    input.executiveSummary?.trim() ||
    input.buyingGroup.summary;

  const primary: StageAction = {
    title: staged.title,
    owner: "AE",
    contact,
    objective: staged.objective,
    completion_signal: staged.completion,
    stage_reason: staged.reason,
  };

  // Prefer LLM remediation only as supporting (noise cap)
  let supporting = supportingFromRemediation(input.immediateRemediation, primary.title);
  if (supporting.length < 2 && input.recommendedNext?.trim()) {
    const rec = input.recommendedNext.trim();
    if (normalizeLoose(rec) !== normalizeLoose(primary.title)) {
      supporting.push({
        title: rec.length > 90 ? `${rec.slice(0, 87)}…` : rec,
        owner: "AE",
        contact: null,
        objective: rec,
        completion_signal: "Next step accepted by champion",
        stage_reason: "CRM-recommended next action (secondary)",
      });
    }
  }
  supporting = supporting.slice(0, 2);

  const what_next = primary.objective;
  const who_to_contact = contact;

  return {
    what_happened,
    what_next,
    who_to_contact,
    crm_stage: label,
    stage_bucket: bucket,
    primary,
    supporting,
    noise_cap_note: "Max 1 primary + 2 supporting actions — not a task dump.",
  };
}

/** Resolve best-available CRM stage string from optional inputs. */
export function resolveDealStage(options: {
  dealStage?: string;
  historicalStages?: string[];
  pipelineStageHint?: string;
}): string | undefined {
  if (options.dealStage?.trim()) return options.dealStage.trim();
  if (options.pipelineStageHint?.trim()) return options.pipelineStageHint.trim();
  const hist = (options.historicalStages ?? []).map((s) => s.trim()).filter(Boolean);
  return hist.length ? hist[hist.length - 1] : undefined;
}
