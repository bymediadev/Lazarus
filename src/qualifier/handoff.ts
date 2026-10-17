import { ACV_LABEL, INTENT_LABEL, MOTION_LABEL, OWNERSHIP_LABEL, ROLE_LABEL, tierLabel } from "./score";
import type { QualifierAnswers, QualifierResult } from "./types";

export function handoffMessage(input: {
  answers: QualifierAnswers;
  result: QualifierResult;
  name: string;
  company: string;
  openedDeals: string[];
}): string {
  const { answers, result, name, company, openedDeals } = input;
  const lines = [
    "Off-hours forecast triage",
    "",
    `Name: ${name.trim() || "—"}`,
    `Company: ${company.trim() || "—"}`,
    `Fit: ${tierLabel(result.tier)} · ${result.score}/10`,
    `Buyer: ${result.buyerMatch}`,
    `Role: ${ROLE_LABEL[answers.role]}`,
    `Forecast seat: ${OWNERSHIP_LABEL[answers.ownership]}`,
    `Motion: ${MOTION_LABEL[answers.motion]}`,
    `ACV: ${ACV_LABEL[answers.acv]}`,
    `Asked for: ${INTENT_LABEL[answers.intent]}`,
    `Angle: ${result.angle}`,
    `Subject to test: ${result.subject}`,
  ];
  lines.push("", "Buying signals:");
  if (result.signals.length === 0) lines.push("- None captured");
  else result.signals.forEach((signal) => lines.push(`- ${signal}`));
  lines.push("", "Disqualifiers:");
  if (result.disqualifiers.length === 0) lines.push("- None");
  else result.disqualifiers.forEach((item) => lines.push(`- ${item}`));
  lines.push("", "Sample forecast:");
  if (openedDeals.length === 0) lines.push("- Not opened");
  else openedDeals.forEach((deal) => lines.push(`- Opened ${deal}`));
  lines.push("", "Human-led follow-up. This note did not run a deal through the analysis engine.");
  return lines.join("\n");
}
