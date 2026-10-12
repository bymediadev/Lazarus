export interface RecoveryActionView {
  /** Action sentence, without the structured labels. */
  action: string;
  /** Same sentence. Kept so existing callers do not render the raw pipe string. */
  text: string;
  kind: "activity" | "outcome" | "mixed" | "unspecified";
  owner: string | null;
  stakeholder: string | null;
  outcome: string | null;
  progressEvidence: string | null;
  checkpoint: string | null;
  missing: string[];
}

import { checkpointLine } from "./checkpointTiming";

const ACTIVITY =
  /\b(schedule|send|email|call|book|meet|demo|draft|share|introduce|reschedule)\b/i;
const OUTCOME =
  /\b(agreement|approve|approval|criteria|decision|sign-off|sign off|commit|confirm|validated|obtain)\b/i;
const MISSING = /^(unknown|n\/a|not stated|not in the evidence)$/i;
const LABELED_LINE =
  /^(?:P\d+\s*\|.*|Owner\s*:|Stakeholder\s*:|Action\s*:|Outcome\s*:|Target outcome\s*:|Progress evidence\s*:|Evidence that would show progress\s*:|Required, not yet observed\s*:|Checkpoint\s*:|Source timing\s*:|Kind\s*:|Current status\s*:|Activity$|Outcome$|Activity and outcome$)/i;

function field(text: string, label: string): string | null {
  const labels =
    label === "Outcome"
      ? ["Target outcome", "Outcome"]
      : label === "Progress evidence"
        ? ["Required, not yet observed", "Evidence that would show progress", "Progress evidence"]
        : label === "Checkpoint"
          ? ["Source timing", "Checkpoint"]
          : [label];
  for (const name of labels) {
    const match = text.match(new RegExp(`${name}:\\s*([^|\\n]+)`, "i"));
    if (!match) continue;
    const value = match[1].trim().replace(/\.$/, "");
    if (!value || MISSING.test(value)) return null;
    if (/^that date is in the past/i.test(value)) return null;
    return value;
  }
  return null;
}

function explicitKind(text: string): string | null {
  const labeled = field(text, "Kind");
  if (labeled) return labeled;
  const lines = text.split(/\n/).map((line) => line.trim().toLowerCase());
  if (lines.includes("activity and outcome")) return "activity and outcome";
  if (lines.includes("activity")) return "activity";
  if (lines.includes("outcome")) return "outcome";
  return null;
}

function kindFrom(action: string, explicit: string | null): RecoveryActionView["kind"] {
  const stated = (explicit ?? "").toLowerCase();
  const activity = ACTIVITY.test(action);
  const outcome = OUTCOME.test(action);
  if (stated.includes("activity") && stated.includes("outcome")) return "mixed";
  // A scheduling step stays an activity even if the model labeled it an outcome.
  if (activity && !outcome) return "activity";
  if (stated.includes("outcome")) return "outcome";
  if (stated.includes("activity")) return "activity";
  if (activity && outcome) return "mixed";
  if (outcome) return "outcome";
  if (activity) return "activity";
  return "unspecified";
}

function actionBody(text: string): string {
  const explicit = field(text, "Action");
  if (explicit) return explicit;
  const prose = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !LABELED_LINE.test(line));
  if (prose.length > 0) return prose[0].replace(/\.$/, "");
  const unlabeled = text
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part && !/^(?:P\d+|Owner|Stakeholder|Action|Outcome|Progress evidence|Checkpoint|Kind)\s*:/i.test(part));
  return (unlabeled.join(" ").trim() || text.trim()).replace(/\.$/, "");
}

function kindLabel(kind: RecoveryActionView["kind"]): string | null {
  if (kind === "activity") return "Activity";
  if (kind === "outcome") return "Outcome";
  if (kind === "mixed") return "Activity and outcome";
  return null;
}

/**
 * Show only the owner, stakeholder, outcome, progress check, and checkpoint
 * that the action already states. Missing fields stay missing.
 */
export function formatRecoveryAction(text: string): RecoveryActionView {
  const cleaned = text.trim();
  const action = actionBody(cleaned);
  const owner = field(cleaned, "Owner");
  const stakeholder = field(cleaned, "Stakeholder");
  const outcome = field(cleaned, "Outcome");
  const progressEvidence = field(cleaned, "Progress evidence");
  const checkpoint = field(cleaned, "Checkpoint");
  const kind = kindFrom(action, explicitKind(cleaned));
  const missing = [
    owner ? null : "owner",
    stakeholder ? null : "stakeholder",
    progressEvidence ? null : "progress evidence",
    checkpoint ? null : "checkpoint",
  ].filter((item): item is string => Boolean(item));

  return {
    action,
    text: action,
    kind,
    owner,
    stakeholder,
    outcome,
    progressEvidence,
    checkpoint,
    missing,
  };
}

function readsAsDone(text: string): boolean {
  return (
    /^(confirmed|completed|accepted|sent|held|scheduled)\b/i.test(text) ||
    /\b(was held|were identified|has been confirmed|already confirmed|already held)\b/i.test(text)
  );
}

function progressLine(text: string): string {
  if (readsAsDone(text)) return `Required, not yet observed: ${text}`;
  return `Evidence that would show progress: ${text}`;
}

/** Each structured field once. The kind is one label, never a second copy of the fields. */
export function recoveryActionLines(text: string, now = new Date()): string[] {
  const view = formatRecoveryAction(text);
  const lines: string[] = [];
  if (view.action) lines.push(view.action);
  const kind = kindLabel(view.kind);
  if (kind) lines.push(kind);
  lines.push("Current status: Proposed");
  if (view.owner) lines.push(`Owner: ${view.owner}`);
  if (view.stakeholder) lines.push(`Stakeholder: ${view.stakeholder}`);
  if (view.outcome && view.outcome.toLowerCase() !== view.action.toLowerCase()) {
    lines.push(`Target outcome: ${view.outcome}`);
  }
  if (view.progressEvidence) lines.push(progressLine(view.progressEvidence));
  if (view.checkpoint) lines.push(checkpointLine(view.checkpoint, now));
  return lines;
}

export function recoveryActionNote(text: string): string {
  return recoveryActionLines(text).join("\n");
}

function actionKey(action: string): string {
  return action
    .toLowerCase()
    .replace(/^\d+\s*\[[^\]]+\]:\s*/, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sameAction(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  return shorter.length > 24 && longer.includes(shorter);
}

export function uniqueRecoveryNotes(steps: string[]): string[] {
  const kept: { key: string; note: string }[] = [];
  for (const step of steps) {
    const view = formatRecoveryAction(step);
    const note = recoveryActionNote(step);
    const key = actionKey(view.action);
    if (!note || !key) continue;
    const existing = kept.find((item) => sameAction(item.key, key));
    if (!existing) {
      kept.push({ key, note });
      continue;
    }
    if (note.length > existing.note.length) {
      existing.note = note;
      if (key.length > existing.key.length) existing.key = key;
    }
  }
  return kept.map((item) => item.note);
}
