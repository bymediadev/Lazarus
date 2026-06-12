import { readFileSync } from "fs";
import {
  auditTranscriptGrounding,
  detectInventedTerms,
  detectMissingCriticalStakeholders,
} from "../server/grounding.ts";

const sarahMark = readFileSync("fixtures/sarah_mark_transcript.txt", "utf8");

// Simulated CyberCore template hallucination on Sarah/Mark call
const hallucinated = {
  causal_forces: [
    {
      factor: "Board capex freeze over $500K",
      evidence: "board mandated a hard freeze on all new IT expenditures over $500,000",
    },
    {
      factor: "AS/400 legacy migration",
      evidence: "heavily modified IBM AS/400 backend for our core inventory routing",
    },
  ],
  executive_summary:
    "CyberCore deferred due to acquisition bandwidth and board capex freeze on AS/400 migration.",
  stakeholders: [{
    name: "Mark O'Brien",
    role: "Director",
    stance: "Neutral",
    authority_level: "influencer",
    persona_type: "Neutral",
    evidence: "Mark, thanks for making time.",
  }],
};

const invented = detectInventedTerms(
  hallucinated.causal_forces,
  sarahMark,
  hallucinated.executive_summary
);
const missingDave = detectMissingCriticalStakeholders(sarahMark, hallucinated.stakeholders);
const audit = auditTranscriptGrounding({
  transcript: sarahMark,
  dealValue: 280000,
  ...hallucinated,
});

console.log("=== Sarah/Mark regression (hallucinated CyberCore output) ===");
console.log("Invented terms detected:", invented);
console.log("Missing stakeholders:", missingDave);
console.log("Audit pass (should be false):", audit.pass);
console.log("Audit warnings:", audit.warnings);

if (audit.pass || invented.length === 0 || !missingDave.includes("Dave")) {
  console.error("REGRESSION FAILED");
  process.exit(1);
}
console.log("REGRESSION OK");
