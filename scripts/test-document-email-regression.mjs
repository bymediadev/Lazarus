import { stitchContext } from "../server/utils/contextStitcher.ts";
import {
  formatScoreOutOf100,
  resolveLegendScore,
  METRIC_LEGEND,
} from "../src/lib/metricLegend.ts";
import {
  formatImportedEmailsAsThread,
  gmailSearchTestUtils,
} from "../server/integrations/google/gmail.ts";
import { formatOutlookMessagesAsThread } from "../server/integrations/teams/outlook.ts";
import { isAcceptedDocument, documentKind } from "../server/documents.ts";
import { extractMailboxSearchTarget } from "../src/lib/emailProviders.ts";
import { formatCompressedCrmNotes } from "../src/lib/crmNotes.ts";
import { normalizeResult } from "../src/types.ts";
import { resolveFrontendOrigin } from "../server/integrations/oauthShared.ts";

let failed = 0;

function check(label, condition) {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    failed++;
  } else {
    console.log(`OK: ${label}`);
  }
}

const stitched = stitchContext({
  audioTranscript: "Rep: The recorded call confirms the budget.",
  callTranscript: "Rep: Budget looks aligned.\nBuyer: Need legal next.",
  emailThread: "From: buyer@acme.com\nSubject: Follow-up\n\nStill waiting on legal.",
  documentText: "MSA draft — clause 4.2 security questionnaire outstanding.",
});

check("document source flagged", stitched.sources.document === true);
check("audio source flagged", stitched.sources.audio === true);
check("email source flagged", stitched.sources.email === true);
check("manual source flagged", stitched.sources.manual === true);
check("document label present", stitched.text.includes("UPLOADED DOCUMENT (PDF / DOCX)"));
check("document body present", stitched.text.includes("security questionnaire"));
check("all four evidence channels retained", stitched.entries.length >= 4);

const zeroScores = {
  deal_risk_index: 0,
  multi_department_friction: 0,
  stakeholder_dispersion_index: 0,
  dialogue_stall_score: 0,
  viability_score: 0,
};

for (const entry of METRIC_LEGEND) {
  const score = resolveLegendScore(entry, zeroScores);
  check(`${entry.id} keeps real zero`, score === 0);
  check(`${entry.id} formats /100`, formatScoreOutOf100(score) === "0/100");
}

check("missing score shows em dash", formatScoreOutOf100(undefined) === "—/100");
check("clamps above 100", formatScoreOutOf100(140) === "100/100");

const gmailThread = formatImportedEmailsAsThread([
  {
    id: "1",
    threadId: "thread-abc",
    subject: "Re: Pricing",
    from: "Pat <pat@acme.com>",
    date: "Mon, 1 Jan 2024 10:00:00 -0500",
    snippet: "Need a revised quote",
    body: "Need a revised quote before Friday.",
  },
  {
    id: "2",
    threadId: "thread-abc",
    subject: "Re: Pricing",
    from: "Rep <rep@seller.com>",
    date: "Mon, 1 Jan 2024 11:00:00 -0500",
    snippet: "Sending now",
    body: "Sending the revised quote now.",
  },
]);
check("gmail thread includes subject", gmailThread.includes("Subject: Re: Pricing"));
check("gmail thread includes body", gmailThread.includes("Need a revised quote before Friday."));
check("gmail thread marks conversation", gmailThread.includes("EMAIL THREAD"));
check(
  "gmail query keeps multi-word deal name",
  gmailSearchTestUtils.buildGmailSearchQuery("Spec Kitty") === '"Spec Kitty"'
);
check(
  "gmail query expands domain participants",
  gmailSearchTestUtils.buildGmailSearchQuery("acme.com").includes("from:acme.com")
);
check(
  "gmail query does not use invalid in:anywhere",
  !gmailSearchTestUtils.buildGmailSearchQuery("Acme").includes("in:anywhere")
);

const outlookThread = formatOutlookMessagesAsThread([
  {
    id: "2",
    conversationId: "conv-1",
    subject: "Security review",
    from: "Alex <alex@acme.com>",
    date: "2024-01-02T15:00:00Z",
    snippet: "InfoSec wants SOC2",
    body: "InfoSec wants SOC2 before kickoff.",
  },
]);
check("outlook thread includes from", outlookThread.includes("Alex <alex@acme.com>"));
check("outlook thread includes body", outlookThread.includes("InfoSec wants SOC2"));
check("outlook thread marks conversation", outlookThread.includes("EMAIL THREAD"));

check("accepts pdf", isAcceptedDocument("brief.pdf", "application/pdf"));
check("accepts docx", isAcceptedDocument("notes.docx"));
check("rejects txt", !isAcceptedDocument("notes.txt"));
check("pdf kind", documentKind("brief.pdf") === "pdf");
check("docx kind", documentKind("notes.docx") === "docx");
check(
  "extracts company from natural mailbox request",
  extractMailboxSearchTarget(
    "Look through my thread for Acme Corporation and see whether the deal is still alive"
  ) === "Acme Corporation"
);
check(
  "extracts quoted mailbox target",
  extractMailboxSearchTarget('Find everything about "Northstar Logistics"') ===
    "Northstar Logistics"
);
check(
  "extracts pull-up thread phrasing",
  extractMailboxSearchTarget("Pull up the Spec Kitty thread") === "Spec Kitty"
);

const prevNodeEnv = process.env.NODE_ENV;
const prevFrontend = process.env.FRONTEND_ORIGIN;
const prevPublic = process.env.PUBLIC_API_URL;
process.env.NODE_ENV = "development";
process.env.FRONTEND_ORIGIN = "http://localhost:5173,https://lazarus-4uxi.onrender.com";
process.env.PUBLIC_API_URL = "https://lazarus-4uxi.onrender.com";
check(
  "local oauth callback prefers localhost frontend",
  resolveFrontendOrigin() === "http://localhost:5173"
);
process.env.NODE_ENV = prevNodeEnv;
if (prevFrontend === undefined) delete process.env.FRONTEND_ORIGIN;
else process.env.FRONTEND_ORIGIN = prevFrontend;
if (prevPublic === undefined) delete process.env.PUBLIC_API_URL;
else process.env.PUBLIC_API_URL = prevPublic;

const crmNotes = formatCompressedCrmNotes(
  normalizeResult({
    client_name: "Acme",
    deal_status: "STALLED — RECOVERABLE",
    executive_summary: "Legal review is blocking an otherwise aligned purchase.",
    proprietary_indices: {
      deal_risk_index: 72,
      risk_tier: "HIGH",
      multi_department_friction: 61,
      stakeholder_dispersion_index: 48,
      dialogue_stall_score: 55,
      authority_gap_flag: true,
    },
    viability_state: {
      state: "RECOVERABLE",
      viability_score: 64,
      equilibrium_derivation: "",
      derivation_components: {
        intent_strength: 70,
        constraint_pressure: 60,
        structural_lock_in_impact: 20,
        timing_accessibility: 65,
      },
    },
    immediate_remediation: ["AE: schedule legal review by 2026-08-03."],
    stakeholders: [],
  })
);
check("CRM overview names account", crmNotes.includes("Lazarus Deal Overview — Acme"));
check("CRM overview includes recovery action", crmNotes.includes("schedule legal review"));
check("CRM overview includes dispersion /100", crmNotes.includes("Dispersion:** 48/100"));
check("CRM overview includes metric legend", crmNotes.includes("Metric legend"));

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}

console.log("\nDOCUMENT + LEGEND + EMAIL FORMAT OK");
