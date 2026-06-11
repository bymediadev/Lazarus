/**
 * Transcript grounding audit — rejects enterprise-template hallucinations.
 * Every force evidence quote must be traceable to the source transcript.
 */

export interface StakeholderSignal {
  name: string;
  role: string;
  stance: string;
  evidence: string;
}

export interface GroundingAudit {
  pass: boolean;
  grounded_force_count: number;
  ungrounded_forces: { factor: string; evidence: string; reason: string }[];
  invented_terms: string[];
  stakeholders: StakeholderSignal[];
  ungrounded_stakeholders: { name: string; reason: string }[];
  warnings: string[];
}

const TEMPLATE_BLEED_TERMS = [
  "as/400",
  "as400",
  "capex freeze",
  "$500",
  "500k",
  "500,000",
  "$1.2",
  "1.2 million",
  "acquisition",
  "merger",
  "kafka",
  "kubernetes",
  "cybercore",
];

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

/** Verbatim or near-verbatim quote must appear in transcript */
export function evidenceMatchesTranscript(evidence: string, transcript: string): boolean {
  const quote = stripQuoteWrappers(evidence);
  if (quote.length < 10) return false;

  const t = normalizeForMatch(transcript);
  const q = normalizeForMatch(quote);

  if (t.includes(q)) return true;

  // Allow minor truncation: match if 75%+ of significant words appear in order
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

/** Terms that often appear from template collapse when not in this call */
export function detectInventedTerms(
  forces: { factor: string; evidence: string }[],
  transcript: string,
  executiveSummary = ""
): string[] {
  const blob = normalizeForMatch(
    [transcript, executiveSummary, ...forces.map((f) => `${f.factor} ${f.evidence}`)].join(" ")
  );
  const invented: string[] = [];

  for (const term of TEMPLATE_BLEED_TERMS) {
    const inOutput =
      forces.some(
        (f) =>
          termInText(term, f.factor) ||
          termInText(term, f.evidence)
      ) || termInText(term, executiveSummary);
    const inTranscript = termInText(term, transcript);
    if (inOutput && !inTranscript) {
      invented.push(term);
    }
  }
  return invented;
}

/** Rough extraction of capitalized names from dialogue */
export function extractMentionedNames(transcript: string): string[] {
  const names = new Set<string>();
  const patterns = [
    /\b([A-Z][a-z]+)\s+(?:the\s+)?(?:VP|Vice President|Director|CIO|CTO|CFO|CEO|Chief)\b/g,
    /\b(?:VP|Director|Chief)\s+(?:of\s+\w+\s+)?([A-Z][a-z]+)\b/g,
    /\b([A-Z][a-z]+)\s+(?:said|mentioned|wasn't|was not|missed|joined|left)\b/g,
    /\b(?:meet|call|loop in|bring in)\s+([A-Z][a-z]+)\b/gi,
  ];

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(transcript)) !== null) {
      const name = m[1];
      if (name && !["Sarah", "Mark", "The", "We", "They", "Yes", "No", "Hi", "Hello"].includes(name)) {
        names.add(name);
      }
    }
  }

  // Speaker labels: "Dave (VP..." or "PROSPECT: Dave"
  const speakerRe = /\b([A-Z][a-z]{2,})\s*(?:\(|\s*[-–—]\s*(?:VP|Director|Chief))/g;
  let sm: RegExpExecArray | null;
  while ((sm = speakerRe.exec(transcript)) !== null) {
    names.add(sm[1]);
  }

  return [...names];
}

export function auditTranscriptGrounding(input: {
  transcript: string;
  dealValue: number;
  causal_forces: { factor: string; evidence: string }[];
  executive_summary?: string;
  stakeholders?: StakeholderSignal[];
}): GroundingAudit {
  const { transcript, causal_forces, executive_summary = "", stakeholders = [] } = input;
  const ungrounded_forces: GroundingAudit["ungrounded_forces"] = [];
  const warnings: string[] = [];

  for (const force of causal_forces) {
    if (!evidenceMatchesTranscript(force.evidence, transcript)) {
      ungrounded_forces.push({
        factor: force.factor,
        evidence: force.evidence,
        reason: "Evidence quote not found in transcript (possible hallucination)",
      });
    }
  }

  const invented_terms = detectInventedTerms(causal_forces, transcript, executive_summary);
  if (invented_terms.length > 0) {
    warnings.push(
      `Template bleed detected — terms not in transcript: ${invented_terms.join(", ")}`
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

  const mentionedNames = extractMentionedNames(transcript);
  const stakeholderNames = new Set(
    stakeholders.map((s) => s.name.toLowerCase().split(" ")[0])
  );
  for (const name of mentionedNames) {
    if (!stakeholderNames.has(name.toLowerCase())) {
      warnings.push(`Stakeholder "${name}" appears in transcript but was not extracted`);
    }
  }

  const grounded_force_count = causal_forces.length - ungrounded_forces.length;
  const pass =
    ungrounded_forces.length === 0 &&
    invented_terms.length === 0 &&
    ungrounded_stakeholders.length === 0 &&
    causal_forces.length > 0;

  return {
    pass,
    grounded_force_count,
    ungrounded_forces,
    invented_terms,
    stakeholders,
    ungrounded_stakeholders,
    warnings,
  };
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
    ...audit.ungrounded_stakeholders.map((s) => `UNGROUNDED STAKEHOLDER "${s.name}"`),
    ...audit.warnings.filter((w) => w.includes("appears in transcript")),
  ];

  return `DEAL VALUE: $${dealValue.toLocaleString()}

YOUR PRIOR OUTPUT FAILED TRANSCRIPT GROUNDING. Re-extract from scratch.

FAILURES:
${failures.map((f) => `- ${f}`).join("\n")}

MANDATORY RULES FOR THIS RETRY:
1. Every evidence field MUST be a verbatim quote copied from the TRANSCRIPT below (10-40 words).
2. Do NOT import concepts from other deals (no AS/400, capex freeze, acquisition, etc. unless literally spoken).
3. Extract EVERY named person (e.g. detractors who missed demos, VPs, economic buyers) in stakeholders[].
4. Use ONLY dollar amounts and systems mentioned in this call. User deal value is $${dealValue.toLocaleString()} — do not invent other deal sizes.
5. If a blocker is not explicitly stated, do not invent it — extract what was actually said.

TRANSCRIPT:
${transcript}`;
}
