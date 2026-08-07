/** Static Lazarus product guide — step graphs + FAQ for UI and grounded Q&A. */

export interface GuideStep {
  id: string;
  title: string;
  body: string;
  /** Optional DOM data-guide-target for highlight */
  target?: string;
  next?: string;
  prev?: string;
}

export interface GuideWorkflow {
  id: string;
  title: string;
  summary: string;
  firstStepId: string;
}

export const GUIDE_WORKFLOWS: GuideWorkflow[] = [
  {
    id: "first-analysis",
    title: "Run your first analysis",
    summary: "Add evidence, run analysis, read the recovery brief.",
    firstStepId: "fa-1",
  },
  {
    id: "hubspot-history",
    title: "Add HubSpot deal history",
    summary: "Connect HubSpot and import notes into Deal Profile.",
    firstStepId: "hs-1",
  },
  {
    id: "live-triage",
    title: "Live meeting triage",
    summary: "Join a live call and watch blockers surface mid-meeting.",
    firstStepId: "lv-1",
  },
  {
    id: "crm-notes",
    title: "Copy CRM-ready notes",
    summary: "Paste the compressed brief into HubSpot or Salesforce.",
    firstStepId: "crm-1",
  },
];

export const GUIDE_STEPS: Record<string, GuideStep> = {
  "fa-1": {
    id: "fa-1",
    title: "Open Deal evidence",
    body: "Use the left panel. Pick Upload (recording or transcript), Live, Mailbox, or Field. You can combine sources — Lazarus analyzes them together.",
    target: "guide-intake",
    next: "fa-2",
  },
  "fa-2": {
    id: "fa-2",
    title: "Attach at least one source",
    body: "Upload a call recording or PDF/DOCX, paste a transcript, import mailbox threads, or end a live session. Optional: set deal value and HubSpot history under Deal Profile.",
    target: "guide-upload-tab",
    prev: "fa-1",
    next: "fa-3",
  },
  "fa-3": {
    id: "fa-3",
    title: "Run Analysis",
    body: "Click Run Analysis. Lazarus extracts evidence, scores recoverable vs flat no, and builds the recovery brief on the right.",
    target: "guide-run-analysis",
    prev: "fa-2",
    next: "fa-4",
  },
  "fa-4": {
    id: "fa-4",
    title: "Read the brief",
    body: "Start with Fast Facts for Spark Notes (deal, detractors, how to save). Use Concise for the full manager view, or Expanded for deep forces.",
    target: "guide-results",
    prev: "fa-3",
  },
  "hs-1": {
    id: "hs-1",
    title: "Connect HubSpot",
    body: "Open Deal Profile → HubSpot import. Click Connect HubSpot and approve read/write scopes in the popup.",
    target: "guide-deal-profile",
    next: "hs-2",
  },
  "hs-2": {
    id: "hs-2",
    title: "Search and import a deal",
    body: "Search by deal name, then Import notes. Account ID, cycle days, and historical CRM context fill automatically.",
    target: "guide-deal-profile",
    prev: "hs-1",
    next: "hs-3",
  },
  "hs-3": {
    id: "hs-3",
    title: "Analyze with CRM context",
    body: "Add call/email evidence, then Run Analysis. Historical veto holders and objections inform the brief. Use Push to HubSpot when you want the CRM updated.",
    target: "guide-run-analysis",
    prev: "hs-2",
  },
  "lv-1": {
    id: "lv-1",
    title: "Open the Live tab",
    body: "Switch to Live. Connect Zoom, Google Meet, or Teams, or use mic/paste for a companion session.",
    target: "guide-live-tab",
    next: "lv-2",
  },
  "lv-2": {
    id: "lv-2",
    title: "Watch live triage",
    body: "While the session runs, the right panel shows rolling blockers and next moves. End the session to fold the transcript into evidence for a full analysis.",
    target: "guide-results",
    prev: "lv-1",
  },
  "crm-1": {
    id: "crm-1",
    title: "Finish an analysis first",
    body: "You need a recovery brief before CRM notes exist. Run Analysis on any evidence package.",
    target: "guide-run-analysis",
    next: "crm-2",
  },
  "crm-2": {
    id: "crm-2",
    title: "Copy or push",
    body: "In Fast Facts or Concise Diagnostic, use Copy for CRM. If HubSpot is linked, use Push to HubSpot to write a note on the deal (human-confirmed).",
    target: "guide-results",
    prev: "crm-1",
  },
};

export const GUIDE_FAQ: { q: string; a: string }[] = [
  {
    q: "What is Lazarus Deal Recovery?",
    a: "A judgment layer for sales managers: which stalled deals will close, which are recoverable vs flat no, what’s blocking them, and what to do in 0–90 days. Humans decide — it is not an AI SDR.",
  },
  {
    q: "What evidence can I upload?",
    a: "Call recordings, transcripts, PDF/DOCX, mailbox threads (Gmail/Outlook), live meeting capture, and field recordings. Multiple sources are stitched into one brief.",
  },
  {
    q: "Does Lazarus write to my CRM automatically?",
    a: "No silent mass writes. You can copy CRM-ready notes, or confirm Push to HubSpot/Salesforce after analysis. CRM changes can sync back into Lazarus when webhooks are configured.",
  },
  {
    q: "What is Fast Facts?",
    a: "Spark Notes on the deal after analysis: what the deal is, main detractors/veto risk, and how to save it — before you dig into the full brief.",
  },
];

/** Plain-text grounding corpus for the guide Q&A model. */
export function buildGuideGroundingText(): string {
  const lines: string[] = [
    "PRODUCT: Lazarus Deal Recovery — human-led, AI-assisted forecast & deal recovery intelligence.",
    "NEVER claim Lazarus sends outreach, closes deals autonomously, or replaces Gong.",
    "",
    "WORKFLOWS:",
  ];
  for (const wf of GUIDE_WORKFLOWS) {
    lines.push(`## ${wf.title}`);
    lines.push(wf.summary);
    let stepId: string | undefined = wf.firstStepId;
    let n = 1;
    while (stepId) {
      const step: GuideStep | undefined = GUIDE_STEPS[stepId];
      if (!step) break;
      lines.push(`${n}. ${step.title}: ${step.body}`);
      stepId = step.next;
      n += 1;
    }
    lines.push("");
  }
  lines.push("FAQ:");
  for (const item of GUIDE_FAQ) {
    lines.push(`Q: ${item.q}`);
    lines.push(`A: ${item.a}`);
  }
  return lines.join("\n");
}
