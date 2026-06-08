export type DealStatus = "failed" | "stalled" | "successful";

export interface PostMortemResult {
  deal_status: DealStatus;
  client_name?: string;
  headline: string;
  diagnosis: string;
  action_plan: string[];
  sources?: { audio: boolean; manual: boolean };
  id?: string | null;
  warnings?: string[];
  /** @deprecated Use headline */
  stall_cause?: string;
  /** @deprecated Use diagnosis */
  why_it_stalled?: string;
  /** @deprecated Use action_plan */
  restart_plan?: string[];
}

export interface DealStatusPresentation {
  mode: string;
  label: string;
  tagClass: string;
  headerLoading: string;
  headerComplete: string;
  outputPanelLabel: string;
  card1: { title: string; border: "red" | "amber" | "emerald" };
  card2: { title: string; border: "red" | "amber" | "emerald" };
  card3: { title: string; border: "red" | "amber" | "emerald"; copyLabel: string };
}

export const DEAL_STATUS_UI: Record<DealStatus, DealStatusPresentation> = {
  failed: {
    mode: "Post-Mortem",
    label: "FAILED — CLOSED LOST",
    tagClass: "status-failed",
    headerLoading: "POST-MORTEM IN PROGRESS...",
    headerComplete: "POST-MORTEM COMPLETE",
    outputPanelLabel: "Close-Out Brief",
    card1: { title: "Primary Cause of Death", border: "red" },
    card2: { title: "Failure Autopsy", border: "amber" },
    card3: { title: "Close-Out & Lessons", border: "red", copyLabel: "Copy Close-Out Items" },
  },
  stalled: {
    mode: "Rescue Brief",
    label: "STALLED — RECOVERABLE",
    tagClass: "status-stalled",
    headerLoading: "RESCUE ANALYSIS IN PROGRESS...",
    headerComplete: "RESCUE BRIEF READY",
    outputPanelLabel: "Rescue Triage Output",
    card1: { title: "Primary Blocker", border: "red" },
    card2: { title: "Why Momentum Froze", border: "amber" },
    card3: { title: "Resuscitation Plan", border: "emerald", copyLabel: "Copy Action Items" },
  },
  successful: {
    mode: "Win Brief",
    label: "SUCCESSFUL — WON",
    tagClass: "status-success",
    headerLoading: "WIN ANALYSIS IN PROGRESS...",
    headerComplete: "WIN BRIEF READY",
    outputPanelLabel: "Win Analysis Output",
    card1: { title: "Win Driver", border: "emerald" },
    card2: { title: "Why It Closed", border: "emerald" },
    card3: { title: "Protect & Expand Plan", border: "emerald", copyLabel: "Copy Next Steps" },
  },
};

export const NEUTRAL_UI = {
  headerLoading: "ANALYSIS IN PROGRESS...",
  headerComplete: "ANALYSIS COMPLETE",
  outputPanelLabel: "Analysis Output",
};

export const MOCK_POST_MORTEM: PostMortemResult = {
  deal_status: "stalled",
  client_name: "Meridian Health — RevOps",
  headline:
    "Deal frozen at the security and procurement gate — $52K price crossed the three-quote threshold while IT never got a live review.",
  diagnosis:
    "Champion Priya lost internal air cover during a hiring freeze while Security, Legal, and Procurement were never in the same room. The rep sent async docs but never secured a joint 45-minute review. Momentum died when leadership defaulted to 'just use Salesforce Einstein' as the path of least resistance, and four follow-up emails over 10 days went unanswered.",
  action_plan: [
    "Send a 3-line exec note from your VP Sales to their CFO framing forecast-accuracy ROI vs. native Einstein — attach a healthcare RevOps reference willing to take a 15-min call.",
    "Book a 45-min live security workshop with CISO + IT: cover US-East storage, subprocessor list, and DPA redlines — do not send another PDF.",
    "Restructure to Phase 1 under $38K (20 seats, SFDC + HubSpot sync only) to bypass three-quote procurement until Q4 expansion.",
    "Multi-thread: ask Priya for a warm intro to Procurement lead by name; offer to pre-fill their vendor comparison grid.",
    "Set a hard 72-hour re-engagement deadline — if no security meeting booked, mark lost and recycle in 90 days.",
  ],
};

export function normalizeResult(raw: PostMortemResult): PostMortemResult {
  const headline = raw.headline || raw.stall_cause || "";
  const diagnosis = raw.diagnosis || raw.why_it_stalled || "";
  const action_plan = raw.action_plan?.length
    ? raw.action_plan
    : raw.restart_plan || [];

  return {
    ...raw,
    deal_status: raw.deal_status ?? "stalled",
    headline,
    diagnosis,
    action_plan,
    stall_cause: headline,
    why_it_stalled: diagnosis,
    restart_plan: action_plan,
  };
}
