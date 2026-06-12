/**
 * Transcript grounding audit — rejects enterprise-template hallucinations.
 * Every force evidence quote must be traceable to the source transcript.
 */

export interface StakeholderSignal {
  name: string;
  role: string;
  /** @deprecated use persona_type — kept for backward compatibility */
  stance: string;
  authority_level: string;
  persona_type: string;
  evidence: string;
}

export interface GroundingAudit {
  pass: boolean;
  grounded_force_count: number;
  ungrounded_forces: { factor: string; evidence: string; reason: string }[];
  invented_terms: string[];
  invented_amounts: string[];
  missing_critical_stakeholders: string[];
  stakeholders: StakeholderSignal[];
  ungrounded_stakeholders: { name: string; reason: string }[];
  warnings: string[];
}

const TEMPLATE_BLEED_TERMS = [
  "as/400",
  "as400",
  "ibm as",
  "capex freeze",
  "board freeze",
  "board-mandated",
  "board mandated",
  "$500",
  "500k",
  "500,000",
  "$1.2",
  "1.2 million",
  "1.2m",
  "acquisition",
  "merger",
  "kafka",
  "kubernetes",
  "cybercore",
  "cloudvantage",
  "legacy system migration",
  "fiscal window",
  "nine-month deployment",
  "9-month",
];

/** Not person names — speaker labels, pronouns, common sentence starters */
const NAME_STOPWORDS = new Set([
  "he", "she", "they", "we", "you", "i", "it", "the", "this", "that", "these", "those",
  "from", "later", "then", "when", "what", "where", "how", "why", "who", "which",
  "rep", "prospect", "seller", "buyer", "speaker", "speakers", "client", "customer",
  "hello", "hi", "hey", "yes", "no", "well", "look", "honestly", "thanks", "thank",
  "based", "given", "our", "your", "their", "his", "her", "its", "my", "mine",
  "call", "recording", "transcript", "date", "june", "july", "august", "september",
  "monday", "tuesday", "wednesday", "thursday", "friday", "january", "february",
  "march", "april", "may", "october", "november", "december",
  "if", "but", "and", "or", "so", "just", "also", "still", "really", "actually",
  "cloud", "vant", "sales", "team", "board", "deal", "contract", "budget",
  "logistics", "health", "systems", "solutions", "technologies", "technology",
  "software", "services", "industries", "enterprise", "global", "digital",
  "information", "officer", "executive", "infrastructure", "operations",
  "vantage", "core", "meridian", "salesforce", "omni", "analytics", "platform",
  "horizon", "discovery", "transcript", "northline", "syncflow",
]);

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function stripQuoteWrappers(text: string): string {
  return text.replace(/^["'""]+|["'""]+$/g, "").trim();
}

function isLikelyPersonName(token: string): boolean {
  const t = token.trim();
  if (t.length < 2 || t.length > 24) return false;
  const lower = t.toLowerCase();
  if (NAME_STOPWORDS.has(lower)) return false;
  if (t === t.toUpperCase() && t.length <= 8) return false;
  return /^[A-Z][a-z]{1,20}$/.test(t) || /^[A-Z]{2,3}$/.test(t);
}

function isCompanyNameFragment(token: string, transcript: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b[A-Z][A-Za-z0-9]*\\s+${escaped}\\b`).test(transcript);
}

/** Verbatim or near-verbatim quote must appear in transcript */
export function evidenceMatchesTranscript(evidence: string, transcript: string): boolean {
  const quote = stripQuoteWrappers(evidence);
  if (quote.length < 10) return false;

  const t = normalizeForMatch(transcript);
  const q = normalizeForMatch(quote);

  if (t.includes(q)) return true;

  const words = q.split(" ").filter((w) => w.length > 2);
  if (words.length < 3) return t.includes(q);

  let ti = 0;
  let matched = 0;
  for (const word of words) {
    const idx = t.indexOf(word, ti);
    if (idx !== -1) {
      matched++;
      ti = idx + word.length;
    }
  }
  return matched / words.length >= 0.75;
}

function termInText(term: string, text: string): boolean {
  return normalizeForMatch(text).includes(term.toLowerCase());
}

function collectOutputText(
  forces: { factor: string; evidence: string }[],
  extra = ""
): string {
  return [extra, ...forces.map((f) => `${f.factor} ${f.evidence}`)].join(" ");
}

/** Terms from other deal templates that must not appear unless spoken */
export function detectInventedTerms(
  forces: { factor: string; evidence: string }[],
  transcript: string,
  extraOutputText = ""
): string[] {
  const outputBlob = collectOutputText(forces, extraOutputText);
  const invented: string[] = [];

  for (const term of TEMPLATE_BLEED_TERMS) {
    if (termInText(term, outputBlob) && !termInText(term, transcript)) {
      invented.push(term);
    }
  }
  return invented;
}

/** Dollar amounts in output that never appear in the transcript */
export function detectInventedDollarAmounts(
  outputText: string,
  transcript: string
): string[] {
  const amountRe = /\$[\d,]+(?:\.\d+)?(?:\s*[kKmM])?|\b[\d,]+\s*(?:k|K|m|M)\b/g;
  const found = outputText.match(amountRe) ?? [];
  const invented: string[] = [];
  const tNorm = normalizeForMatch(transcript).replace(/[,$]/g, "");

  for (const raw of new Set(found)) {
    const digits = raw.replace(/[^0-9]/g, "");
    if (!digits || digits.length < 3) continue;
    if (!tNorm.includes(digits)) {
      invented.push(raw.trim());
    }
  }
  return invented;
}

/** People who must appear in stakeholders when explicitly named as blockers */
export function detectMissingCriticalStakeholders(
  transcript: string,
  stakeholders: StakeholderSignal[]
): string[] {
  const t = normalizeForMatch(transcript);
  const missing: string[] = [];
  const hasStakeholder = (needle: string) =>
    stakeholders.some((s) => {
      const blob = `${s.name} ${s.role} ${s.persona_type} ${s.stance}`.toLowerCase();
      return blob.includes(needle);
    });

  if (/\bdave\b/.test(t) && !hasStakeholder("dave")) {
    missing.push("Dave");
  }

  if (
    (t.includes("vp of infrastructure") || t.includes("vice president of infrastructure")) &&
    !hasStakeholder("infrastructure")
  ) {
    missing.push("VP of Infrastructure");
  }

  if (
    (t.includes("missed the demo") || t.includes("missed the technical demo")) &&
    t.includes("dave") &&
    !hasStakeholder("dave")
  ) {
    missing.push("Dave (missed demo — detractor)");
  }

  return [...new Set(missing)];
}

export function buildTranscriptConstraints(transcript: string, dealValue: number): string {
  const forbidden = TEMPLATE_BLEED_TERMS.filter((term) => !termInText(term, transcript));
  const lines = [
    `USER DEAL VALUE: $${dealValue.toLocaleString()} — do not cite other contract sizes unless spoken.`,
    "Extract ONLY from the transcript below. No AS/400, capex freeze, acquisition, or M&A unless literally said.",
    "Every force evidence = verbatim quote from this transcript.",
    "People Map (stakeholders[]): every persona with persona_type (Aligned Champion | Absent Decision Maker | Hidden Detractor).",
    "Structural parent forces require verbatim buyer/prospect quotes — not rep summaries.",
  ];
  if (forbidden.length > 0) {
    lines.push(`FORBIDDEN in output (not in this transcript): ${forbidden.slice(0, 12).join(", ")}`);
  }
  return lines.join("\n");
}

export function extractMentionedNames(transcript: string): string[] {
  const names = new Set<string>();

  const add = (raw: string | undefined) => {
    if (!raw) return;
    const token = raw.trim().split(/\s+/)[0];
    if (!isLikelyPersonName(token)) return;
    if (isCompanyNameFragment(token, transcript)) return;
    names.add(token);
  };

  const roleParenRe = /\b(?:Rep|Prospect|Seller|Buyer|Speaker)\s*\(\s*([A-Za-z][A-Za-z.-]{1,24})\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = roleParenRe.exec(transcript)) !== null) add(m[1]);

  const headerNameRe = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*\([A-Z]{1,4}\)/gm;
  while ((m = headerNameRe.exec(transcript)) !== null) add(m[1].split(/\s+/)[0]);

  const titledRe =
    /\b([A-Z][a-z]{2,})\s*(?:\([^)]*(?:VP|Vice President|Director|CIO|CTO|CFO|CEO|Chief|President|Infrastructure)[^)]*\)|[-–—]\s*(?:Chief|VP|Vice President|Director))/g;
  while ((m = titledRe.exec(transcript)) !== null) add(m[1]);

  const titleNameRe =
    /\b(?:VP|Vice President|Director|Chief)\s+(?:of\s+[\w\s]+)?,\s*([A-Z][a-z]{2,})\b/g;
  while ((m = titleNameRe.exec(transcript)) !== null) add(m[1]);

  const actionRe =
    /\b([A-Z][a-z]{2,})\s+(?:missed|didn't attend|did not attend|wasn't on|was not on|no-showed)\b/g;
  while ((m = actionRe.exec(transcript)) !== null) add(m[1]);

  const loopInRe = /\b(?:loop in|bring in|include|invite)\s+([A-Z][a-z]{2,})\b/gi;
  while ((m = loopInRe.exec(transcript)) !== null) add(m[1]);

  // "Dave, our VP of Infrastructure"
  const namedVpRe = /\b([A-Z][a-z]{2,}),\s*our\s+(?:VP|Vice President)\s+of\s+\w+/g;
  while ((m = namedVpRe.exec(transcript)) !== null) add(m[1]);

  return [...names];
}

export function auditTranscriptGrounding(input: {
  transcript: string;
  dealValue: number;
  causal_forces: { factor: string; evidence: string }[];
  executive_summary?: string;
  force_initialization?: { summary?: string; classification_rationale?: string };
  stakeholders?: StakeholderSignal[];
}): GroundingAudit {
  const {
    transcript,
    causal_forces,
    executive_summary = "",
    force_initialization = {},
    stakeholders = [],
  } = input;
  const ungrounded_forces: GroundingAudit["ungrounded_forces"] = [];
  const warnings: string[] = [];

  const extraOutput = [
    executive_summary,
    force_initialization.summary ?? "",
    force_initialization.classification_rationale ?? "",
  ].join(" ");

  for (const force of causal_forces) {
    if (!evidenceMatchesTranscript(force.evidence, transcript)) {
      ungrounded_forces.push({
        factor: force.factor,
        evidence: force.evidence,
        reason: "Evidence quote not found in transcript (possible hallucination)",
      });
    }
  }

  const invented_terms = detectInventedTerms(causal_forces, transcript, extraOutput);
  if (invented_terms.length > 0) {
    warnings.push(
      `Template bleed blocked — not in transcript: ${invented_terms.join(", ")}`
    );
  }

  const invented_amounts = detectInventedDollarAmounts(extraOutput, transcript);
  if (invented_amounts.length > 0) {
    warnings.push(
      `Invented dollar amounts blocked — not in transcript: ${invented_amounts.join(", ")}`
    );
  }

  const missing_critical_stakeholders = detectMissingCriticalStakeholders(
    transcript,
    stakeholders
  );
  if (missing_critical_stakeholders.length > 0) {
    warnings.push(
      `Missing stakeholder(s) required by transcript: ${missing_critical_stakeholders.join(", ")}`
    );
  }

  const ungrounded_stakeholders: GroundingAudit["ungrounded_stakeholders"] = [];
  for (const s of stakeholders) {
    if (!s.name.trim()) continue;
    if (!evidenceMatchesTranscript(s.evidence, transcript)) {
      ungrounded_stakeholders.push({
        name: s.name,
        reason: "Stakeholder evidence not grounded in transcript",
      });
    }
  }

  const grounded_force_count = causal_forces.length - ungrounded_forces.length;
  const pass =
    ungrounded_forces.length === 0 &&
    invented_terms.length === 0 &&
    invented_amounts.length === 0 &&
    missing_critical_stakeholders.length === 0 &&
    ungrounded_stakeholders.length === 0 &&
    causal_forces.length > 0;

  return {
    pass,
    grounded_force_count,
    ungrounded_forces,
    invented_terms,
    invented_amounts,
    missing_critical_stakeholders,
    stakeholders,
    ungrounded_stakeholders,
    warnings,
  };
}

/** Remove forces/summary fields that reference content not in the transcript */
export function filterInventedForces<T extends { factor: string; evidence: string }>(
  forces: T[],
  transcript: string,
  extraOutputText = ""
): T[] {
  const invented = new Set(
    detectInventedTerms(forces, transcript, extraOutputText)
  );
  return forces.filter((f) => {
    if (!evidenceMatchesTranscript(f.evidence, transcript)) return false;
    for (const term of invented) {
      if (termInText(term, f.factor) || termInText(term, f.evidence)) return false;
    }
    return true;
  });
}

export function scrubInventedSummary(summary: string, transcript: string): string {
  let s = summary;
  for (const term of TEMPLATE_BLEED_TERMS) {
    if (termInText(term, s) && !termInText(term, transcript)) {
      s = s.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "");
    }
  }
  return s.replace(/\s{2,}/g, " ").trim();
}

export function buildGroundingRetryMessage(
  transcript: string,
  dealValue: number,
  audit: GroundingAudit
): string {
  const failures = [
    ...audit.ungrounded_forces.map(
      (f) => `UNGROUNDED FORCE "${f.factor}": ${f.reason}. Evidence was: "${f.evidence}"`
    ),
    ...audit.invented_terms.map((t) => `INVENTED TERM "${t}" — not present in transcript`),
    ...audit.invented_amounts.map((a) => `INVENTED AMOUNT "${a}" — not present in transcript`),
    ...audit.missing_critical_stakeholders.map(
      (s) => `MISSING STAKEHOLDER "${s}" — named in transcript but not in stakeholders[]`
    ),
    ...audit.ungrounded_stakeholders.map((s) => `UNGROUNDED STAKEHOLDER "${s.name}"`),
  ];

  return `${buildTranscriptConstraints(transcript, dealValue)}

YOUR PRIOR OUTPUT FAILED TRANSCRIPT GROUNDING. Re-extract from scratch.

FAILURES:
${failures.map((f) => `- ${f}`).join("\n")}

TRANSCRIPT:
${transcript}`;
}
