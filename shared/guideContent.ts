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
    title: "Revive a linked deal",
    summary: "Revive reads the linked deal, scores it, and writes that score back.",
    firstStepId: "hs-0",
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
    summary: "Copy a note, push a note, or let Revive write the score.",
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
    body: "Upload a call recording or PDF/DOCX, paste a transcript, import mailbox threads, or end a live session. Optional: set deal value, or import a HubSpot or Salesforce deal under CRM import.",
    target: "guide-upload-tab",
    prev: "fa-1",
    next: "fa-3",
  },
  "fa-3": {
    id: "fa-3",
    title: "Raise this deal from the dead",
    body: "Complete the security check, then click Raise this deal from the dead. Lazarus extracts evidence, scores recoverable vs flat no, and builds the recovery brief on the right.",
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
  "hs-0": {
    id: "hs-0",
    title: "What Revive does",
    body: "Revive reads a linked HubSpot or Salesforce deal and writes the meaning back onto it. It pulls the stage, amount, close date, notes, and any meetings or tasks that CRM will share, then scores that record. It writes the viability, whether the deal is stalled or recoverable, and the next action onto the deal’s next-step field, plus one note. The pipeline stage stays where the rep left it. Raise this deal from the dead scores what you pasted and shows the brief on the right. Revive does that for the CRM record and updates the deal. The button appears after you import a deal, beside the green run button. One CRM is enough. If both are linked, both receive the same score and note. A change in the CRM is included the next time you click Revive.",
    target: "guide-run-analysis",
    next: "hs-1",
  },
  "hs-1": {
    id: "hs-1",
    title: "Connect HubSpot or Salesforce",
    body: "Sign in. Open Add more evidence, then CRM import. Connect HubSpot or Salesforce. One CRM is enough.",
    target: "guide-deal-profile",
    prev: "hs-0",
    next: "hs-2",
  },
  "hs-2": {
    id: "hs-2",
    title: "Import the deal",
    body: "Search by name and import it. Lazarus pulls the stage, amount, close date, notes, and meetings or tasks when that CRM allows them.",
    target: "guide-deal-profile",
    prev: "hs-1",
    next: "hs-3",
  },
  "hs-3": {
    id: "hs-3",
    title: "Click Revive",
    body: "Revive sits beside Raise this deal from the dead. It scores that record and writes the viability, status, and next step back onto the deal, plus one note. It does not change the pipeline stage. If both CRMs are linked, both get the same write. A later change in the CRM shows up the next time you Revive.",
    target: "guide-run-analysis",
    prev: "hs-2",
  },
  "lv-1": {
    id: "lv-1",
    title: "Open the Live tab",
    body: "Switch to Live. Connect Zoom, or for Meet install the captions extension and turn on Captions. Mic/paste still works.",
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
    body: "Copy and Push use a brief you already have. Revive is the other path: it reads the linked deal, scores it, and writes the score back in the same click.",
    target: "guide-run-analysis",
    next: "crm-2",
  },
  "crm-2": {
    id: "crm-2",
    title: "Copy or push",
    body: "Copy for CRM puts the note on your clipboard. Push to HubSpot or Push to Salesforce writes that note only when you click it. Revive is what writes the score and next step. None of these moves the stage.",
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
    a: "When you click Revive, it reads the linked HubSpot or Salesforce deal and writes the score and next step back. It does not change the pipeline stage, and it does not write when the CRM changes on its own. Push writes a note only when you click it. Copy leaves the paste to you.",
  },
  {
    q: "What does Revive do?",
    a: "Revive reads a linked HubSpot or Salesforce deal and writes the meaning back onto it. It pulls the stage, amount, close date, notes, and any meetings or tasks that CRM will share, then scores that record. It writes the viability, whether the deal is stalled or recoverable, and the next action onto the deal’s next-step field, plus one note. The pipeline stage stays where the rep left it. The button appears after you import a deal. One CRM is enough. If both are linked, both receive the same score and note. A change in the CRM is included the next time you click Revive.",
  },
  {
    q: "How do I revive a deal?",
    a: "Sign in, import a HubSpot or Salesforce deal, then click Revive. Lazarus scores that record and writes the viability, status, and next step back. It does not move the stage. One CRM is enough. If both are linked, both get the same write.",
  },
  {
    q: "How do I push notes to HubSpot?",
    a: "Raise this deal from the dead first so you have a brief. Import the HubSpot deal under CRM import if you haven’t. In Fast Facts, click Push to HubSpot. That writes a note only. Revive is the button that also writes the score and next step. You can also use Copy for CRM and paste it yourself.",
  },
  {
    q: "How do I push notes to Salesforce?",
    a: "Raise this deal from the dead, import the Salesforce opportunity, then click Push to Salesforce on the brief. That writes a feed post only. Revive writes the score and next step. Or Copy for CRM and paste it yourself.",
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

  const revive = /\brevive\b/i.test(q);
  if (revive && /what (does|is)|explain/.test(q)) {
    return {
      answer: GUIDE_FAQ.find((f) => /What does Revive do/.test(f.q))!.a,
      steps: [],
    };
  }
  if (revive) {
    return {
      answer: GUIDE_FAQ.find((f) => /What does Revive do/.test(f.q))!.a,
      steps: [GUIDE_STEPS["hs-1"].body, GUIDE_STEPS["hs-2"].body, GUIDE_STEPS["hs-3"].body],
    };
  }

  const pushHubspot =
    /(push|write|send).*(note|notes|brief).*(hubspot)|hubspot.*(push|note|notes)/i.test(q) ||
    /how (do i|to) push.*hubspot/i.test(q);
  if (pushHubspot) {
    return {
      answer: GUIDE_FAQ.find((f) => /push notes to HubSpot/i.test(f.q))!.a,
      steps: [
        "Raise this deal from the dead so a brief exists.",
        "Under CRM import, connect HubSpot and import the deal if needed.",
        "Open Fast Facts.",
        "Click Push to HubSpot. That writes a note only.",
        "Click Revive if you want the score and next step written back. It does not move the stage.",
        "Or use Copy for CRM and paste the note yourself.",
      ],
    };
  }

  const pushSf =
    /(push|write|send).*(note|notes|brief).*(salesforce)|salesforce.*(push|note|notes)/i.test(q);
  if (pushSf) {
    return {
      answer: GUIDE_FAQ.find((f) => /push notes to Salesforce/i.test(f.q))!.a,
      steps: [
        "Raise this deal from the dead so a brief exists.",
        "Under CRM import, connect Salesforce and import the opportunity.",
        "On the brief, click Push to Salesforce. That writes a feed post only.",
        "Click Revive to write the score and next step. It does not move the stage.",
        "Or Copy for CRM and paste the note yourself.",
      ],
    };
  }

  const firstAnalysis = /(first analysis|run analysis|how (do i|to) (run|start|use)|getting started)/i.test(
    q
  );
  if (firstAnalysis) {
    return {
      answer: "Add evidence on the left, click Raise this deal from the dead, then read Fast Facts and the recovery brief on the right.",
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
      answer: "Sign in, connect HubSpot or Salesforce under CRM import, import the deal, then click Revive. That writes the score and next step back and does not move the stage.",
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
