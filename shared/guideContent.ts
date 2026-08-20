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
    title: "Raise this deal from the dead",
    body: "Click Raise this deal from the dead. Lazarus extracts evidence, scores recoverable vs flat no, and builds the recovery brief on the right.",
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
    q: "How do I push notes to HubSpot?",
    a: "Run Analysis first so you have a recovery brief. Link a HubSpot deal under Deal Profile if you haven’t. In Fast Facts or Concise Diagnostic, click Push to HubSpot and confirm — Lazarus writes a note on that deal. You can also use Copy for CRM and paste manually.",
  },
  {
    q: "How do I push notes to Salesforce?",
    a: "Run Analysis, link a Salesforce opportunity under Deal Profile, then use Push to Salesforce on the brief (human-confirmed). Or Copy for CRM and paste into the opportunity.",
  },
  {
    q: "What is Fast Facts?",
    a: "Spark Notes on the deal after analysis: what the deal is, main detractors/veto risk, and how to save it — before you dig into the full brief.",
  },
];

/** Offline how-to match — no Gemini required. */
export function matchGuideOffline(question: string): { answer: string; steps: string[] } | null {
  const q = question.trim().toLowerCase();
  if (q.length < 3) return null;

  const pushHubspot =
    /(push|write|send).*(note|notes|brief).*(hubspot)|hubspot.*(push|note|notes)/i.test(q) ||
    /how (do i|to) push.*hubspot/i.test(q);
  if (pushHubspot) {
    return {
      answer: GUIDE_FAQ.find((f) => /push notes to HubSpot/i.test(f.q))!.a,
      steps: [
        "Run Analysis so a recovery brief exists.",
        "Under Deal Profile, Connect HubSpot and link/import the deal if needed.",
        "Open Fast Facts or Concise Diagnostic.",
        "Click Push to HubSpot and confirm the write (human-confirmed).",
        "Or use Copy for CRM and paste the note into HubSpot yourself.",
      ],
    };
  }

  const pushSf =
    /(push|write|send).*(note|notes|brief).*(salesforce)|salesforce.*(push|note|notes)/i.test(q);
  if (pushSf) {
    return {
      answer: GUIDE_FAQ.find((f) => /push notes to Salesforce/i.test(f.q))!.a,
      steps: [
        "Run Analysis so a recovery brief exists.",
        "Under Deal Profile, Connect Salesforce and link the opportunity.",
        "On the brief, click Push to Salesforce and confirm.",
        "Or Copy for CRM and paste manually.",
      ],
    };
  }

  const firstAnalysis = /(first analysis|run analysis|how (do i|to) (run|start|use)|getting started)/i.test(
    q
  );
  if (firstAnalysis) {
    return {
      answer: "Add evidence on the left, click Run Analysis, then read Fast Facts and the recovery brief on the right.",
      steps: [
        GUIDE_STEPS["fa-1"].body,
        GUIDE_STEPS["fa-2"].body,
        GUIDE_STEPS["fa-3"].body,
        GUIDE_STEPS["fa-4"].body,
      ],
    };
  }

  const hubspotImport = /(hubspot).*(import|history|connect|deal)/i.test(q);
  if (hubspotImport && !pushHubspot) {
    return {
      answer: "Connect HubSpot under Deal Profile, search a deal, Import notes, then run analysis with that CRM context.",
      steps: [GUIDE_STEPS["hs-1"].body, GUIDE_STEPS["hs-2"].body, GUIDE_STEPS["hs-3"].body],
    };
  }

  const live = /(live|zoom|meet|teams|triage|meeting)/i.test(q);
  if (live) {
    return {
      answer: "Use the Live tab for mid-call blockers, then end the session to fold the transcript into a full analysis.",
      steps: [GUIDE_STEPS["lv-1"].body, GUIDE_STEPS["lv-2"].body],
    };
  }

  // Exact-ish FAQ keyword overlap
  for (const item of GUIDE_FAQ) {
    const tokens = item.q
      .toLowerCase()
      .replace(/[?]/g, "")
      .split(/\s+/)
      .filter((t) => t.length > 3);
    const hits = tokens.filter((t) => q.includes(t)).length;
    if (hits >= Math.min(3, tokens.length)) {
      return { answer: item.a, steps: [] };
    }
  }

  return null;
}
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
