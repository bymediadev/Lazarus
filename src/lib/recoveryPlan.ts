export interface RecoveryActionView {
  text: string;
  kind: "activity" | "outcome" | "mixed" | "unspecified";
  owner: string | null;
  stakeholder: string | null;
  outcome: string | null;
  progressEvidence: string | null;
  checkpoint: string | null;
  missing: string[];
}

const ACTIVITY =
  /\b(schedule|send|email|call|book|meet|demo|draft|share|introduce|reschedule)\b/i;
const OUTCOME =
  /\b(agreement|approve|approval|criteria|decision|sign-off|sign off|commit|confirm|validated|obtain)\b/i;

function field(text: string, label: string): string | null {
  const match = text.match(new RegExp(`${label}:\\s*([^|]+)`, "i"));
  if (!match) return null;
  const value = match[1].trim().replace(/\.$/, "");
  if (!value || /^unknown$/i.test(value)) return null;
  return value;
}

function kindFrom(text: string, explicit: string | null): RecoveryActionView["kind"] {
  const stated = (explicit ?? "").toLowerCase();
  if (stated.includes("activity") && stated.includes("outcome")) return "mixed";
  if (stated.includes("outcome")) return "outcome";
  if (stated.includes("activity")) return "activity";
  const activity = ACTIVITY.test(text);
  const outcome = OUTCOME.test(text);
  if (activity && outcome) return "mixed";
  if (outcome) return "outcome";
  if (activity) return "activity";
  return "unspecified";
}

/**
 * Show only the owner, stakeholder, outcome, progress check, and checkpoint
 * that the action already states. Missing fields stay missing.
 */
export function formatRecoveryAction(text: string): RecoveryActionView {
  const cleaned = text.trim();
  const owner = field(cleaned, "Owner");
  const stakeholder = field(cleaned, "Stakeholder");
  const outcome = field(cleaned, "Outcome");
  const progressEvidence = field(cleaned, "Progress evidence");
  const checkpoint = field(cleaned, "Checkpoint");
  const kind = kindFrom(cleaned, field(cleaned, "Kind"));
  const missing = [
    owner ? null : "owner",
    stakeholder ? null : "stakeholder",
    progressEvidence ? null : "progress evidence",
    checkpoint ? null : "checkpoint",
  ].filter((item): item is string => Boolean(item));

  return {
    text: cleaned,
    kind,
    owner,
    stakeholder,
    outcome,
    progressEvidence,
    checkpoint,
    missing,
  };
}
