const ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2";

interface AssemblyUtterance {
  speaker: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
}

interface AssemblySentiment {
  text: string;
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  confidence: number;
  start?: number;
  end?: number;
}

interface AssemblyTranscriptJob {
  status: string;
  text?: string;
  error?: string;
  utterances?: AssemblyUtterance[];
  sentiment_analysis_results?: AssemblySentiment[];
  audio_duration?: number;
}

export interface TranscriptionResult {
  formatted: string;
  durationSeconds?: number;
  speakerCount: number;
}

export async function transcribeAudio(
  buffer: Buffer,
  filename: string
): Promise<TranscriptionResult> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ASSEMBLYAI_API_KEY is not set. Paste a transcript instead, or add the key to .env."
    );
  }

  const uploadRes = await fetch(`${ASSEMBLYAI_BASE}/upload`, {
    method: "POST",
    headers: {
      authorization: apiKey,
      "content-type": "application/octet-stream",
    },
    body: buffer,
  });

  if (!uploadRes.ok) {
    throw new Error(`AssemblyAI upload failed: ${uploadRes.statusText}`);
  }

  const { upload_url } = (await uploadRes.json()) as { upload_url: string };

  const speakersExpected = parseInt(process.env.ASSEMBLYAI_SPEAKERS ?? "2", 10);

  const transcriptRes = await fetch(`${ASSEMBLYAI_BASE}/transcript`, {
    method: "POST",
    headers: {
      authorization: apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      audio_url: upload_url,
      speaker_labels: true,
      speakers_expected: Number.isFinite(speakersExpected) ? speakersExpected : 2,
      sentiment_analysis: true,
      disfluencies: true,
      punctuate: true,
      format_text: true,
    }),
  });

  if (!transcriptRes.ok) {
    throw new Error(`AssemblyAI transcript request failed: ${transcriptRes.statusText}`);
  }

  const { id } = (await transcriptRes.json()) as { id: string };

  const pollInterval = 3000;
  const maxAttempts = 60;

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(pollInterval);

    const statusRes = await fetch(`${ASSEMBLYAI_BASE}/transcript/${id}`, {
      headers: { authorization: apiKey },
    });

    const job = (await statusRes.json()) as AssemblyTranscriptJob;

    if (job.status === "completed") {
      return formatTranscription(job);
    }

    if (job.status === "error") {
      throw new Error(`Transcription failed: ${job.error ?? "unknown error"}`);
    }
  }

  throw new Error(`Transcription timed out for ${filename}`);
}

function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function sentimentForUtterance(
  utterance: AssemblyUtterance,
  sentiments: AssemblySentiment[]
): AssemblySentiment | undefined {
  return sentiments.find(
    (s) =>
      s.start !== undefined &&
      s.end !== undefined &&
      s.start >= utterance.start - 500 &&
      s.end <= utterance.end + 500
  );
}

function inferSpeakerRoles(utterances: AssemblyUtterance[]): Map<string, "rep" | "prospect" | "unknown"> {
  const roles = new Map<string, "rep" | "prospect" | "unknown">();

  for (const u of utterances) {
    if (roles.has(u.speaker)) continue;
    const lower = u.text.toLowerCase();

    if (
      /\b(from|with|at)\s+[A-Z][\w\s]+(solutions|tech|software|inc|corp)/i.test(u.text) ||
      /\b(this is|my name is)\s+\w+.*\b(from|with)\b/i.test(u.text) ||
      lower.includes("calling from") ||
      lower.includes("reach out") ||
      lower.includes("follow up")
    ) {
      roles.set(u.speaker, "rep");
    } else if (
      lower.includes("this is") && !lower.includes("from") ||
      lower.includes("speaking") ||
      lower.includes("hello") && u.start < 15000
    ) {
      roles.set(u.speaker, "prospect");
    } else {
      roles.set(u.speaker, "unknown");
    }
  }

  const known = [...roles.values()];
  if (known.includes("rep") && !known.includes("prospect")) {
    for (const u of utterances) {
      if (!roles.has(u.speaker) || roles.get(u.speaker) === "unknown") {
        if (roles.get(u.speaker) !== "rep") roles.set(u.speaker, "prospect");
      }
    }
  }

  return roles;
}

function formatTranscription(job: AssemblyTranscriptJob): TranscriptionResult {
  const utterances = job.utterances ?? [];
  const sentiments = job.sentiment_analysis_results ?? [];

  if (utterances.length === 0) {
    return {
      formatted: job.text ?? "",
      durationSeconds: job.audio_duration,
      speakerCount: 0,
    };
  }

  const roles = inferSpeakerRoles(utterances);
  const speakers = new Set(utterances.map((u) => u.speaker));

  const lines: string[] = [
    "=== AUDIO TRANSCRIPT (speaker-labeled, timed, sentiment-enriched) ===",
    "Use timestamps, speaker turns, sentiment tags, and disfluencies as delivery/tone evidence — read between the lines.",
    "",
  ];

  for (const u of utterances) {
    const role = roles.get(u.speaker) ?? "unknown";
    const roleLabel =
      role === "rep" ? "REP" : role === "prospect" ? "PROSPECT" : `SPEAKER ${u.speaker}`;
    const sentiment = sentimentForUtterance(u, sentiments);
    const sentimentTag = sentiment
      ? ` | sentiment: ${sentiment.sentiment.toLowerCase()}`
      : "";
    const pauseMs = u.start > 0 ? u.start : 0;

    lines.push(
      `[${formatTimestamp(pauseMs)}] ${roleLabel}: ${u.text.trim()}${sentimentTag}`
    );
  }

  if (job.audio_duration) {
    lines.push("");
    lines.push(`[call duration: ${Math.round(job.audio_duration)}s, speakers: ${speakers.size}]`);
  }

  return {
    formatted: lines.join("\n"),
    durationSeconds: job.audio_duration,
    speakerCount: speakers.size,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
