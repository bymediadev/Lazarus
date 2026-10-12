export type EvidenceBasis = "firsthand" | "secondhand" | "unattributed";

export interface QuoteAttribution {
  speaker: string | null;
  subject: string;
  basis: EvidenceBasis;
}

export interface PeopleMapQuote {
  text: string;
  note: string;
}

export interface PeopleMapRow {
  name: string;
  role: string;
  authority: string;
  persona: string;
  quotes: PeopleMapQuote[];
  secondhandNote: string | null;
}

interface StakeholderInput {
  name: string;
  role?: string;
  authority_level?: string;
  persona_type?: string;
  stance?: string;
  evidence?: string;
  evidence_speaker?: string;
  evidence_basis?: EvidenceBasis;
}

interface Speaker {
  name: string;
  alias: string;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namesMatch(left: string, right: string): boolean {
  const tokens = (value: string) =>
    normalize(value)
      .split(" ")
      .filter((token) => token.length > 2);
  const other = new Set(tokens(right));
  return tokens(left).some((token) => other.has(token));
}

function parseSpeakers(transcript: string): Speaker[] {
  const block = transcript.match(/SPEAKERS:\s*([\s\S]*?)(?:\n\s*\n|\n\[)/i);
  if (!block) return [];
  const speakers: Speaker[] = [];
  for (const line of block[1].split("\n")) {
    const match = line.match(/^(.+?)\(([A-Za-z]{1,8})\)/);
    if (!match) continue;
    speakers.push({ name: match[1].trim(), alias: match[2].trim() });
  }
  return speakers;
}

function utterances(transcript: string): { alias: string; body: string }[] {
  const turns: { alias: string; body: string }[] = [];
  let current: { alias: string; body: string } | null = null;
  for (const line of transcript.split(/\r?\n/)) {
    const match = line.match(/^\[(\d{2}:\d{2}:\d{2})\]\s*([A-Za-z]{1,8}):\s*(.*)$/);
    if (match) {
      if (current) turns.push(current);
      current = { alias: match[2], body: match[3].trim() };
      continue;
    }
    if (current && line.trim()) current.body += ` ${line.trim()}`;
  }
  if (current) turns.push(current);
  return turns;
}

/** The quote stays with the person who said it. A named subject is not the speaker. */
export function attributeQuote(transcript: string, stakeholderName: string, quote: string): QuoteAttribution {
  const speakers = parseSpeakers(transcript);
  const quoteText = normalize(quote);
  let best: { alias: string; score: number } | null = null;
  for (const turn of utterances(transcript)) {
    const body = normalize(turn.body);
    if (body.length < 12 || quoteText.length < 12) continue;
    let score = 0;
    if (quoteText.includes(body)) score = body.length;
    else if (body.includes(quoteText)) score = quoteText.length;
    else {
      const slice = quoteText.slice(0, 48);
      if (slice.length >= 24 && body.includes(slice)) score = slice.length;
    }
    if (score > (best?.score ?? 0)) best = { alias: turn.alias, score };
  }
  const known = speakers.find((speaker) => speaker.alias.toLowerCase() === best?.alias.toLowerCase());
  const speaker = known?.name ?? null;
  if (!speaker) {
    return { speaker: null, subject: stakeholderName, basis: "unattributed" };
  }
  const firsthand = namesMatch(speaker, stakeholderName);
  return {
    speaker,
    subject: stakeholderName,
    basis: firsthand ? "firsthand" : "secondhand",
  };
}

export function peopleMapRows(stakeholders: StakeholderInput[]): PeopleMapRow[] {
  const rows: PeopleMapRow[] = stakeholders.map((person) => ({
    name: person.name,
    role: person.role ?? "",
    authority: person.authority_level ?? "",
    persona: person.persona_type || person.stance || "",
    quotes: [],
    secondhandNote: null,
  }));

  for (const person of stakeholders) {
    const quote = person.evidence?.replace(/^"|"$/g, "").trim();
    if (!quote) continue;
    const basis = person.evidence_basis ?? "unattributed";
    const speaker = person.evidence_speaker?.trim() || null;
    const speakerRow =
      basis === "secondhand" && speaker
        ? rows.find((row) => namesMatch(row.name, speaker))
        : undefined;
    const subject = rows.find((row) => row.name === person.name);
    const note =
      basis === "secondhand" && speaker
        ? `About ${person.name}. Said by ${speaker}, not by ${person.name}.`
        : basis === "firsthand" && speaker
          ? `Said by ${speaker}.`
          : "";
    const target = speakerRow ?? subject;
    if (!target) continue;
    const key = normalize(quote);
    if (!target.quotes.some((item) => normalize(item.text) === key)) {
      target.quotes.push({ text: quote, note });
    }
    if (speakerRow && subject && speakerRow !== subject) {
      subject.secondhandNote = `No firsthand statement. ${speaker} spoke about ${person.name}.`;
    }
  }

  return rows;
}
