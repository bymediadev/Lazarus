/**
 * Multi-meeting pre-contract pathway: every logged objection across the cycle
 * must be met before a unified contract goes out — no back-and-forth paper edits.
 */

import type { HistoricalCrmContextEntry } from "../shared/deepContextTypes.js";
import type { BuyingGroupAlignment } from "./buyingGroup.js";
import {
  normalizePipelineStage,
  type PipelineStageBucket,
} from "./stageActions.js";

export type ConcernStatus = "OPEN" | "ADDRESSED" | "BLOCKING";

export type ContractGateStatus =
  | "TRACKING"
  | "GATED"
  | "READY"
  | "INSUFFICIENT_HISTORY";

export interface PathwayMeeting {
  date: string;
  stage: string;
  label: string;
  objection_count: number;
  veto_holders: string[];
}

export interface CycleConcern {
  id: string;
  text: string;
  status: ConcernStatus;
  source_meeting: string;
  source_stage: string;
  source_date: string;
  owner_hint: string | null;
  resolution_note: string | null;
  inferred: boolean;
}

export interface ContractReadinessPathway {
  gate_status: ContractGateStatus;
  headline: string;
  why_it_matters: string;
  crm_stage: string;
  stage_bucket: PipelineStageBucket;
  meetings: PathwayMeeting[];
  concerns: CycleConcern[];
  open_count: number;
  addressed_count: number;
  blocking_count: number;
  /** True when stage is proposal/negotiation and open concerns remain. */
  block_contract_send: boolean;
  checklist: string[];
  next_unified_step: string;
}

export interface ContractPathwayInput {
  dealStage?: string;
  historicalCrmContext?: HistoricalCrmContextEntry[];
  liveSessionObjections?: Array<{ text: string; status: string; source?: string }>;
  buyingGroup?: BuyingGroupAlignment;
  signalsMissed?: string[];
  coreBlocker?: string;
  executiveSummary?: string;
  immediateRemediation?: string[];
  historicalMatches?: Array<{
    conflict_type: string;
    historical_event: string;
    live_dialogue_evidence: string;
  }>;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function slugConcern(text: string, idx: number): string {
  const slug = normalize(text).replace(/\s+/g, "-").slice(0, 48);
  return slug || `concern-${idx}`;
}

function isNearContract(bucket: PipelineStageBucket): boolean {
  return bucket === "proposal" || bucket === "negotiation";
}

const RESOLUTION_HINTS = [
  "resolved",
  "addressed",
  "cleared",
  "approved",
  "signed off",
  "no longer",
  "waived",
  "accepted",
  "closed out",
  "unblocked",
];

function corpusLooksResolved(concernText: string, corpus: string): boolean {
  const c = normalize(concernText);
  const body = normalize(corpus);
  if (!c || !body) return false;

  const tokens = c.split(" ").filter((t) => t.length > 4).slice(0, 6);
  const overlap = tokens.filter((t) => body.includes(t)).length;
  if (overlap < 2) return false;

  return RESOLUTION_HINTS.some((h) => body.includes(h));
}

function matchContradicts(
  concernText: string,
  matches: ContractPathwayInput["historicalMatches"]
): string | null {
  for (const m of matches ?? []) {
    if (m.conflict_type !== "contradicts") continue;
    const blob = normalize(`${m.historical_event} ${m.live_dialogue_evidence}`);
    const tokens = normalize(concernText)
      .split(" ")
      .filter((t) => t.length > 4)
      .slice(0, 5);
    if (tokens.filter((t) => blob.includes(t)).length >= 2) {
      return m.live_dialogue_evidence || m.historical_event || "Later dialogue contradicts prior objection";
    }
  }
  return null;
}

function dedupeKey(text: string): string {
  return normalize(text)
    .split(" ")
    .filter((t) => t.length > 3)
    .slice(0, 8)
    .join(" ");
}

/** Build the multi-meeting objection pathway and pre-contract gate. */
export function buildContractReadinessPathway(
  input: ContractPathwayInput
): ContractReadinessPathway {
  const { label, bucket } = normalizePipelineStage(input.dealStage);
  const history = input.historicalCrmContext ?? [];
  const meetings: PathwayMeeting[] = history.map((entry, i) => ({
    date: entry.date || `Meeting ${i + 1}`,
    stage: entry.stage || "Unknown",
    label: `${entry.stage || "Meeting"} · ${entry.date || "undated"}`,
    objection_count: entry.past_logged_objections?.length ?? 0,
    veto_holders: (entry.past_identified_veto_holders ?? []).map((v) => v.display_name),
  }));

  meetings.push({
    date: new Date().toISOString().slice(0, 10),
    stage: label,
    label: `This call · ${label}`,
    objection_count: 0,
    veto_holders: [],
  });

  const resolutionCorpus = [
    input.executiveSummary ?? "",
    ...(input.immediateRemediation ?? []),
    ...(input.liveSessionObjections ?? [])
      .filter((o) => /resolved|answered|closed/i.test(o.status))
      .map((o) => o.text),
  ].join(" \n ");

  const concerns: CycleConcern[] = [];
  const seen = new Set<string>();

  let idx = 0;
  for (const entry of history) {
    for (const raw of entry.past_logged_objections ?? []) {
      const text = raw.trim();
      if (!text) continue;
      const key = dedupeKey(text);
      if (seen.has(key)) continue;
      seen.add(key);

      const owner =
        entry.past_identified_veto_holders?.[0]?.display_name ?? null;
      const contradictNote = matchContradicts(text, input.historicalMatches);
      const resolvedByCorpus = corpusLooksResolved(text, resolutionCorpus);

      let status: ConcernStatus = "OPEN";
      let resolution_note: string | null = null;
      if (contradictNote) {
        status = "ADDRESSED";
        resolution_note = contradictNote;
      } else if (resolvedByCorpus) {
        status = "ADDRESSED";
        resolution_note = "Marked addressed from later call / remediation language";
      } else if (isNearContract(bucket)) {
        status = "BLOCKING";
        resolution_note = "Still open — must be met before a unified contract is sent";
      }

      concerns.push({
        id: slugConcern(text, idx++),
        text,
        status,
        source_meeting: `${entry.stage || "Prior meeting"} · ${entry.date || "undated"}`,
        source_stage: entry.stage || "Unknown",
        source_date: entry.date || "",
        owner_hint: owner,
        resolution_note,
        inferred: false,
      });
    }
  }

  for (const live of input.liveSessionObjections ?? []) {
    const text = live.text.trim();
    if (!text) continue;
    const key = dedupeKey(text);
    if (seen.has(key)) continue;
    seen.add(key);
    const resolved = /resolved|answered|closed/i.test(live.status);
    concerns.push({
      id: slugConcern(text, idx++),
      text,
      status: resolved ? "ADDRESSED" : isNearContract(bucket) ? "BLOCKING" : "OPEN",
      source_meeting: "Live session",
      source_stage: label,
      source_date: meetings[meetings.length - 1]?.date ?? "",
      owner_hint: null,
      resolution_note: resolved ? "Resolved in live session" : null,
      inferred: false,
    });
  }

  // Inferred cycle risks from buying-group + missed signals (Liam: silence matters)
  if (input.buyingGroup && input.buyingGroup.status !== "ALIGNED") {
    for (const role of input.buyingGroup.roles.filter((r) => !r.present || r.quiet)) {
      const text = role.quiet && role.holder
        ? `${role.label} (${role.holder}) still quiet — align before contract`
        : `${role.label} not confirmed across the buying group`;
      const key = dedupeKey(text);
      if (seen.has(key)) continue;
      seen.add(key);
      concerns.push({
        id: slugConcern(text, idx++),
        text,
        status: isNearContract(bucket) ? "BLOCKING" : "OPEN",
        source_meeting: "Inferred · buying group",
        source_stage: label,
        source_date: meetings[meetings.length - 1]?.date ?? "",
        owner_hint: role.holder,
        resolution_note: isNearContract(bucket)
          ? "Inferred gap — do not send paper until this role is on the unified path"
          : null,
        inferred: true,
      });
    }
  }

  for (const signal of input.signalsMissed ?? []) {
    const text = signal.trim();
    if (!text) continue;
    const key = dedupeKey(text);
    if (seen.has(key)) continue;
    seen.add(key);
    concerns.push({
      id: slugConcern(text, idx++),
      text,
      status: isNearContract(bucket) ? "BLOCKING" : "OPEN",
      source_meeting: "Pipeline · signals missed",
      source_stage: label,
      source_date: "",
      owner_hint: null,
      resolution_note: null,
      inferred: true,
    });
  }

  if (input.coreBlocker?.trim()) {
    const text = input.coreBlocker.trim();
    const key = dedupeKey(text);
    if (!seen.has(key)) {
      seen.add(key);
      concerns.push({
        id: slugConcern(text, idx++),
        text,
        status: isNearContract(bucket) ? "BLOCKING" : "OPEN",
        source_meeting: "This call",
        source_stage: label,
        source_date: meetings[meetings.length - 1]?.date ?? "",
        owner_hint: null,
        resolution_note: null,
        inferred: true,
      });
    }
  }

  const open_count = concerns.filter((c) => c.status === "OPEN").length;
  const blocking_count = concerns.filter((c) => c.status === "BLOCKING").length;
  const addressed_count = concerns.filter((c) => c.status === "ADDRESSED").length;
  const unresolved = open_count + blocking_count;

  let gate_status: ContractGateStatus;
  if (!history.length && concerns.length === 0) {
    gate_status = "INSUFFICIENT_HISTORY";
  } else if (isNearContract(bucket) && unresolved > 0) {
    gate_status = "GATED";
  } else if (unresolved === 0 && concerns.length > 0) {
    gate_status = "READY";
  } else {
    gate_status = "TRACKING";
  }

  const block_contract_send = gate_status === "GATED";

  const checklist = [
    "Collect every objection from each meeting in the cycle (CRM + calls)",
    "Assign an owner / veto holder to each open concern",
    "Close each concern with a written completion signal before paper",
    "Send one unified contract only when the pathway shows READY",
  ];

  const headline =
    gate_status === "GATED"
      ? `Contract send gated — ${unresolved} concern${unresolved === 1 ? "" : "s"} still open across the cycle`
      : gate_status === "READY"
        ? "Pathway clear — buying concerns met; safe to send a unified contract"
        : gate_status === "INSUFFICIENT_HISTORY"
          ? "Load multi-meeting CRM history to track objections before contract"
          : `Tracking ${concerns.length} cycle concern${concerns.length === 1 ? "" : "s"} across ${meetings.length} meetings`;

  const why_it_matters =
    "Multiple meetings create scattered objections. Meeting every concern before contract send prevents back-and-forth redlines and keeps one unified paper.";

  const next_unified_step =
    gate_status === "GATED"
      ? `Resolve the ${blocking_count || open_count} open concern${(blocking_count || open_count) === 1 ? "" : "s"} below, then re-run — do not send contract yet.`
      : gate_status === "READY"
        ? "Send the unified contract with all prior objections already reflected."
        : gate_status === "INSUFFICIENT_HISTORY"
          ? "Load demo history (or paste CRM timeline) so Lazarus can stitch objections across meetings."
          : "Keep logging objections each meeting; clear them before moving to contractsent.";

  // Keep UI scannable — open/blocking first, then addressed
  concerns.sort((a, b) => {
    const rank = (s: ConcernStatus) =>
      s === "BLOCKING" ? 0 : s === "OPEN" ? 1 : 2;
    return rank(a.status) - rank(b.status);
  });

  return {
    gate_status,
    headline,
    why_it_matters,
    crm_stage: label,
    stage_bucket: bucket,
    meetings,
    concerns: concerns.slice(0, 12),
    open_count,
    addressed_count,
    blocking_count,
    block_contract_send,
    checklist,
    next_unified_step,
  };
}
