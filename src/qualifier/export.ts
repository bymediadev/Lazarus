import { diagnosticProfile, parseTurns, purchaseMotion } from "../lib/reportMatrix";
import type { CompanyScoreContext, PostMortemResponse } from "../lib/api";
import type { Arrival } from "./arrival";
import { gateSummary, type GateAnswers, type HoldReason } from "./gates";
import { redactionCounts, type RedactionSpan } from "./redact";
import type { DealTeaser } from "./teaser";

export type QualifierExportInput = {
  arrival: Arrival;
  stage: string;
  companyUrl: string;
  accountName: string;
  acvText: string;
  forecastInput: string;
  meetingZone: string;
  gateAnswers: GateAnswers;
  access: string;
  hold: HoldReason | null;
  commitment: boolean | null;
  sourceTranscript: string;
  redactedTranscript: string;
  spans: RedactionSpan[];
  teaser: DealTeaser | null;
  report: PostMortemResponse | null;
  noticeTitle?: string | null;
  noticeBody?: string | null;
};

export type QualifierExportPayload = {
  exported_at: string;
  purpose: "local qualifier review before ship";
  arrival: Arrival;
  stage: string;
  fit: {
    company_url: string;
    account: string;
    amount_at_risk: string;
    forecast_input: string;
    meeting_zone: string;
    gate_summary: string;
    gate_answers: GateAnswers;
    access: string;
    hold: HoldReason | null;
    commitment: boolean | null;
    route_notice: string | null;
  };
  redaction: {
    counts: ReturnType<typeof redactionCounts>;
    source_transcript: string;
    redacted_transcript: string;
    spans: Array<{ kind: string; text: string; replacement: string }>;
  };
  read: {
    purchase_motion: ReturnType<typeof purchaseMotion>;
    speakers: {
      labeled: boolean;
      sellers: string[];
      buyers: string[];
    };
    diagnostic: ReturnType<typeof diagnosticProfile>;
  };
  teaser: DealTeaser | null;
  company_context: CompanyScoreContext | null;
  report: PostMortemResponse | null;
};

export function buildQualifierExport(input: QualifierExportInput): QualifierExportPayload {
  const scoredText = input.redactedTranscript.trim() || input.sourceTranscript;
  const turns = parseTurns(scoredText);
  const sellers = [
    ...new Set(turns.turns.filter((turn) => turn.role === "seller").map((turn) => turn.speaker).filter(Boolean)),
  ];
  const buyers = [
    ...new Set(turns.turns.filter((turn) => turn.role === "buyer").map((turn) => turn.speaker).filter(Boolean)),
  ];
  return {
    exported_at: new Date().toISOString(),
    purpose: "local qualifier review before ship",
    arrival: input.arrival,
    stage: input.stage,
    fit: {
      company_url: input.companyUrl.trim(),
      account: input.accountName.trim(),
      amount_at_risk: input.acvText.trim(),
      forecast_input: input.forecastInput.trim(),
      meeting_zone: input.meetingZone,
      gate_summary: gateSummary(input.gateAnswers, input.accountName, input.acvText),
      gate_answers: input.gateAnswers,
      access: input.access,
      hold: input.hold,
      commitment: input.commitment,
      route_notice:
        input.noticeTitle || input.noticeBody
          ? `${input.noticeTitle ?? ""} ${input.noticeBody ?? ""}`.trim()
          : null,
    },
    redaction: {
      counts: redactionCounts(input.spans),
      source_transcript: input.sourceTranscript,
      redacted_transcript: input.redactedTranscript,
      spans: input.spans.map((span) => ({
        kind: span.kind,
        text: span.text,
        replacement: span.replacement,
      })),
    },
    read: {
      purchase_motion: purchaseMotion(scoredText),
      speakers: {
        labeled: turns.labeled,
        sellers,
        buyers,
      },
      diagnostic: diagnosticProfile(scoredText),
    },
    teaser: input.teaser,
    company_context: input.report?.company_context ?? null,
    report: input.report,
  };
}

export function formatQualifierExportMarkdown(payload: QualifierExportPayload): string {
  const lines = [
    "# Qualifier export",
    "",
    `Exported: ${payload.exported_at}`,
    `Arrival: ${payload.arrival}`,
    `Stage: ${payload.stage}`,
    "",
    "## Fit",
    `- Company URL: ${payload.fit.company_url || "—"}`,
    `- Account: ${payload.fit.account || "—"}`,
    `- Amount at risk: ${payload.fit.amount_at_risk || "—"}`,
    `- Forecast: ${payload.fit.forecast_input || "—"} (${payload.fit.meeting_zone})`,
    `- Access: ${payload.fit.access}`,
    `- Hold: ${payload.fit.hold ?? "—"}`,
    `- Commitment: ${payload.fit.commitment == null ? "—" : payload.fit.commitment ? "yes" : "no"}`,
    "",
    "```",
    payload.fit.gate_summary || "(no gate summary)",
    "```",
    "",
    "## Purchase read",
    `- Motion: ${payload.read.purchase_motion.motion}`,
    `- Reason: ${payload.read.purchase_motion.reason}`,
    `- Speakers labeled: ${payload.read.speakers.labeled ? "yes" : "no"}`,
    `- Sellers: ${payload.read.speakers.sellers.join(", ") || "—"}`,
    `- Buyers: ${payload.read.speakers.buyers.join(", ") || "—"}`,
    `- Buying signals: ${payload.read.diagnostic.buyingSignals}`,
    `- Budget: ${payload.read.diagnostic.budget}`,
    `- Urgency: ${payload.read.diagnostic.urgency}`,
    `- Missed process: ${payload.read.diagnostic.missedProcess}`,
    `- Unknown: ${payload.read.diagnostic.unknown ?? "—"}`,
    `- False read: ${payload.read.diagnostic.falseRead || "—"}`,
    "",
    "## Company context (scored with the call)",
  ];
  if (payload.company_context) {
    lines.push(
      `- Site: ${payload.company_context.domain || "—"}`,
      `- Published: ${payload.company_context.profile || "—"}`,
      `- Account: ${payload.company_context.account || "—"}`,
      `- Amount: ${payload.company_context.amount || "—"}`,
      ""
    );
  } else {
    lines.push("- (none returned)", "");
  }

  lines.push("## Teaser");
  if (payload.teaser) {
    lines.push(
      `- Verdict: ${payload.teaser.verdict}`,
      `- Risk: ${payload.teaser.risk ?? "—"} (${payload.teaser.riskTier ?? "—"})`,
      `- Blocker: ${payload.teaser.blocker}`,
      `- Quote: ${payload.teaser.quote || "—"}`,
      "",
      "### This week",
      ...(payload.teaser.thisWeek.length
        ? payload.teaser.thisWeek.map((line) => `- ${line}`)
        : ["- (none)"]),
      ""
    );
  } else {
    lines.push("- (no teaser)", "");
  }

  lines.push(
    "## Redaction",
    `- Names: ${payload.redaction.counts.name}`,
    `- Companies: ${payload.redaction.counts.company}`,
    `- Amounts: ${payload.redaction.counts.amount}`,
    "",
    "### Source transcript",
    "```",
    payload.redaction.source_transcript || "(empty)",
    "```",
    "",
    "### Redacted transcript (what was scored)",
    "```",
    payload.redaction.redacted_transcript || "(empty)",
    "```",
    "",
    "## Engine report",
    "```json",
    JSON.stringify(payload.report, null, 2),
    "```",
    ""
  );
  return lines.join("\n");
}

export function downloadTextFile(filename: string, body: string, mime: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function exportQualifierBundle(input: QualifierExportInput): QualifierExportPayload {
  const payload = buildQualifierExport(input);
  const stamp = payload.exported_at.replace(/[:.]/g, "-");
  const base = `qualifier-export-${stamp}`;
  downloadTextFile(`${base}.json`, `${JSON.stringify(payload, null, 2)}\n`, "application/json");
  downloadTextFile(`${base}.md`, formatQualifierExportMarkdown(payload), "text/markdown");
  return payload;
}
