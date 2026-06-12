import "dotenv/config";
import cors from "cors";
import express from "express";
import { existsSync } from "fs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

import { transcribeAudio } from "./assemblyai.js";
import { analyzeTranscript } from "./gemini.js";
import { savePostMortem, purgeExpiredTranscripts, saveRescueOutcome } from "./supabase.js";
import { buildAnalysisTranscript } from "./transcript.js";
import { stripOutcomeMetadata } from "./sanitize.js";
import { normalizeManualTranscript } from "./normalize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, "../dist");

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const allowedOrigins = (
  process.env.FRONTEND_ORIGIN ??
  "http://localhost:5173,http://localhost:3001,http://127.0.0.1:5173"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      console.warn(`CORS: blocked origin ${origin}`);
      callback(null, false);
    },
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  const geminiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  const geminiKeyValid = /^AIza/.test(geminiKey) || /^AQ\./.test(geminiKey);
  res.json({
    status: "ok",
    gemini: !!geminiKey,
    gemini_key_format_valid: geminiKeyValid,
    assemblyai: !!process.env.ASSEMBLYAI_API_KEY,
    supabase: !!process.env.SUPABASE_URL,
  });
});

function formatApiError(message: string): string {
  if (
    message.includes("401") ||
    message.includes("invalid authentication") ||
    message.includes("API key not valid")
  ) {
    return "GEMINI_API_KEY was rejected by Google (401). Create a new key at https://aistudio.google.com/apikey — AIza or AQ. format both work. Restart npm run dev after updating .env.";
  }
  if (message.includes("429") || message.includes("quota")) {
    return "Gemini API quota exceeded. Wait a few minutes and retry, or set GEMINI_MODEL=gemini-2.5-flash in .env.";
  }
  if (message.includes("GEMINI_API_KEY")) {
    return "GEMINI_API_KEY is missing. Add it to your .env file.";
  }
  if (message.includes("ASSEMBLYAI_API_KEY")) {
    return "Audio upload requires ASSEMBLYAI_API_KEY in .env — or paste a transcript instead.";
  }
  if (message.includes("fetch failed") || message.includes("UNABLE_TO_VERIFY")) {
    return "HTTPS connection to Gemini failed (Windows TLS). Stop the server and run: npm run dev — the server uses node --use-system-ca. If it still fails: powershell -File scripts/export-windows-cas.ps1";
  }
  if (message.includes("invalid analysis structure") || message.includes("JSON")) {
    return "AI returned an invalid response. Retry in a few seconds.";
  }
  return message.split("\n")[0].slice(0, 280);
}

function normalizeTextField(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.filter((part): part is string => typeof part === "string").join("\n\n");
  }
  return "";
}

/** Optional — set LAZARUS_API_KEY in production to require X-Api-Key header. */
function requireApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  const expected = (process.env.LAZARUS_API_KEY ?? "").trim();
  if (!expected) {
    next();
    return;
  }
  const provided =
    (req.headers["x-api-key"] as string | undefined)?.trim() ??
    req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (provided !== expected) {
    res.status(401).json({ error: "Unauthorized — invalid or missing API key" });
    return;
  }
  next();
}

app.post("/api/post-mortem", requireApiKey, upload.single("recording"), async (req, res) => {
  try {
    const dealValue = parseFloat(String(req.body.deal_value)) || 0;
    const manualRaw = normalizeTextField(req.body.transcript);
    const manualTranscript = normalizeManualTranscript(manualRaw);
    const strippedPriorAnalysis = manualRaw.trim().length - manualTranscript.length > 80;
    let audioTranscript = "";
    let audioMeta: { durationSeconds?: number; speakerCount?: number } | undefined;

    if (req.file) {
      const transcription = await transcribeAudio(req.file.buffer, req.file.originalname);
      audioTranscript = transcription.formatted;
      audioMeta = {
        durationSeconds: transcription.durationSeconds,
        speakerCount: transcription.speakerCount,
      };
    }

    const { text: rawTranscript, sources } = buildAnalysisTranscript({
      audioTranscript,
      manualTranscript,
      audioMeta,
    });

    if (!rawTranscript.trim()) {
      res.status(400).json({
        error: "Provide a recording, a transcript, or both.",
      });
      return;
    }

    const transcript = stripOutcomeMetadata(rawTranscript);
    const result = await analyzeTranscript(transcript, dealValue);

    const savedId = await savePostMortem({
      clientName: result.client_name,
      dealValue,
      dealStatus: result.deal_classification.status,
      headline: result.executive_summary,
      diagnosis: result.diagnosis,
      actionPlan: result.action_plan.join("\n"),
      transcriptText: rawTranscript,
      analysisJson: JSON.stringify(result),
    });

    const warnings: string[] = [];
    const addWarning = (msg: string) => {
      if (!warnings.includes(msg)) warnings.push(msg);
    };
    if (strippedPriorAnalysis) {
      addWarning(
        "Removed a prior Lazarus analysis that was pasted below the call transcript. Only the call text was analyzed."
      );
    }
    for (const w of result.grounding_audit?.warnings ?? []) addWarning(w);
    if (result.grounding_audit && !result.grounding_audit.pass) {
      addWarning(
        "Transcript grounding check failed — ungrounded claims were stripped. Verify evidence quotes."
      );
    }

    res.json({
      ...result,
      id: savedId,
      sources,
      audio_meta: audioMeta ?? null,
      warnings,
    });
  } catch (err) {
    console.error("Post-mortem error:", err);
    const raw = err instanceof Error ? err.message : "Post-mortem failed.";
    const friendly = formatApiError(raw);
    res.status(500).json({ error: friendly });
  }
});

/** Record rescue loop outcome — anonymous metadata only, no transcript. */
app.post("/api/post-mortem/:id/rescue-outcome", async (req, res) => {
  const outcome = String(req.body?.outcome ?? "").trim() as
    | "closed_won"
    | "still_stalled"
    | "lost"
    | "unknown";
  const valid = ["closed_won", "still_stalled", "lost", "unknown"];
  if (!valid.includes(outcome)) {
    res.status(400).json({ error: "outcome must be closed_won, still_stalled, lost, or unknown" });
    return;
  }

  const rescueActionTaken = String(req.body?.rescue_action_taken ?? "").trim();
  if (!rescueActionTaken) {
    res.status(400).json({ error: "rescue_action_taken is required" });
    return;
  }

  const indices = req.body?.proprietary_indices;
  const viabilityScore = Number(req.body?.viability_score ?? 0);
  const trajectoryType = String(req.body?.trajectory_type ?? "");
  const constraintPressure = Number(req.body?.constraint_pressure ?? 0);
  const stakeholders = Array.isArray(req.body?.stakeholders) ? req.body.stakeholders : [];

  if (!indices?.deal_risk_index && indices?.deal_risk_index !== 0) {
    res.status(400).json({ error: "proprietary_indices required" });
    return;
  }

  try {
    const savedId = await saveRescueOutcome({
      postMortemId: req.params.id,
      rescueActionTaken,
      outcome,
      proprietaryIndices: indices,
      viabilityScore,
      trajectoryType,
      constraintPressure,
      stakeholders,
    });
    if (!savedId) {
      res.status(503).json({ error: "Supabase not configured or rescue_outcomes table missing" });
      return;
    }
    res.json({ ok: true, id: savedId });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to save rescue outcome",
    });
  }
});

/** Cron-only: purge transcript_text past retention window. Requires PURGE_CRON_SECRET header. */
app.post("/api/admin/purge-retention", async (req, res) => {
  const secret = process.env.PURGE_CRON_SECRET;
  if (!secret || req.headers["x-cron-secret"] !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const days = req.body?.retention_days
      ? parseInt(String(req.body.retention_days), 10)
      : undefined;
    const result = await purgeExpiredTranscripts(days);
    if (!result) {
      res.status(503).json({ error: "Supabase not configured" });
      return;
    }
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Purge failed",
    });
  }
});

if (process.env.NODE_ENV === "production" || existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(path.join(distPath, "index.html"));
  });
}

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`Lazarus API running on http://localhost:${PORT}`);
  if (existsSync(distPath)) {
    console.log(`Serving frontend from ${distPath}`);
  }
});
