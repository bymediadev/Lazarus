import "dotenv/config";
import cors from "cors";
import express from "express";
import { existsSync } from "fs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

import { transcribeAudio } from "./assemblyai.js";
import { analyzeTranscript } from "./gemini.js";
import {
  formatLiveTranscriptPayload,
  parseDeepContextFromBody,
  buildIngestMetadata,
  buildDealMemorySummary,
  detectRecurringVetoHolders,
} from "./deepContext.js";
import { savePostMortem, purgeExpiredTranscripts, saveRescueOutcome } from "./supabase.js";
import { buildAnalysisTranscript } from "./transcript.js";
import { stripOutcomeMetadata } from "./sanitize.js";
import { normalizeEmailThread, normalizeManualTranscript } from "./normalize.js";
import { scanLiveObjections as scanLiveObjectionsServer } from "./liveObjections.js";
import { runLiveTriage } from "./liveTriage.js";
import { registerTrustPackRoutes, trustPackSlugFromPath } from "./trustPack.js";
import {
  mapHubSpotDealToDeepContext,
  verifyHubSpotWebhookSecret,
  type HubSpotWebhookPayload,
} from "./integrations/hubspot.js";
import { registerZoomRoutes, registerZoomWebhook } from "./integrations/zoom/routes.js";
import { isZoomConfigured } from "./integrations/zoom/config.js";
import { registerGoogleMeetRoutes } from "./integrations/google/routes.js";
import { isGoogleMeetConfigured } from "./integrations/google/config.js";
import { registerTeamsRoutes } from "./integrations/teams/routes.js";
import { isTeamsConfigured } from "./integrations/teams/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, "../dist");
const publicPath = path.join(__dirname, "../public");

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

/**
 * Zoom Apps require these OWASP Secure Headers on text/html Home URL responses.
 * Meta tags are not enough — they must be HTTP response headers.
 * @see https://developers.zoom.us/docs/zoom-apps/security/owasp/
 */
app.use((_req, res, next) => {
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://appssdk.zoom.us https://*.zoom.us",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "frame-src 'self' https://*.zoom.us",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://zoom.us https://*.zoom.us",
    ].join("; ")
  );
  next();
});

registerZoomWebhook(app);

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
    zoom: isZoomConfigured(),
    google_meet: isGoogleMeetConfigured(),
    teams: isTeamsConfigured(),
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
    req.headers.authorization?.replace(/^Bearer\s+/i, "")?.trim();
  if (provided !== expected) {
    res.status(401).json({ error: "Unauthorized — invalid or missing API key" });
    return;
  }
  next();
}

app.post("/api/post-mortem", requireApiKey, upload.single("recording"), async (req, res) => {
  try {
    const processedAt = new Date().toISOString();
    const dealValue = parseFloat(String(req.body.deal_value)) || 0;
    const deepContext = parseDeepContextFromBody(req.body as Record<string, unknown>);
    const manualRaw = normalizeTextField(req.body.transcript);
    const livePayloadText = deepContext.liveTranscriptPayload?.length
      ? formatLiveTranscriptPayload(deepContext.liveTranscriptPayload)
      : "";
    const manualTranscript = normalizeManualTranscript(manualRaw || livePayloadText);
    const emailRaw = normalizeTextField(req.body.email_thread);
    const emailThread = normalizeEmailThread(emailRaw);
    const isFieldCapture = ["1", "true", true].includes(req.body.field_capture as string | boolean);
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
      emailThread,
      fieldCaptureAudio: isFieldCapture && !!audioTranscript,
      audioMeta,
      audioCapturedAt: audioTranscript ? processedAt : undefined,
      callCapturedAt: manualTranscript ? processedAt : undefined,
      emailCapturedAt: emailThread ? processedAt : undefined,
      fieldCapturedAt: isFieldCapture && audioTranscript ? processedAt : undefined,
    });

    if (!rawTranscript.trim()) {
      res.status(400).json({
        error: "Provide a recording, call transcript, email thread, or any combination.",
      });
      return;
    }

    const transcript = stripOutcomeMetadata(rawTranscript);
    const result = await analyzeTranscript(transcript, { dealValue, deepContext });

    const recurringVetoHolders = deepContext.historicalCrmContext?.length
      ? detectRecurringVetoHolders(deepContext.historicalCrmContext)
      : [];
    const ingestMetadata = buildIngestMetadata(deepContext);
    const dealMemorySummary = buildDealMemorySummary(
      result as unknown as Record<string, unknown>,
      recurringVetoHolders
    );

    const savedId = await savePostMortem({
      clientName: result.client_name,
      dealValue,
      dealStatus: result.deal_classification.status,
      headline: result.executive_summary,
      diagnosis: result.diagnosis,
      actionPlan: result.action_plan.join("\n"),
      transcriptText: rawTranscript,
      analysisJson: JSON.stringify({ ...result, processed_at: processedAt }),
      ...(ingestMetadata ? { ingestMetadata: ingestMetadata as Record<string, unknown> } : {}),
      dealMemorySummary: dealMemorySummary as Record<string, unknown>,
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
      processed_at: processedAt,
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

/** HubSpot deal webhook → deep-context fields (ingest helper; not full CRM sync). */
app.post("/api/webhooks/hubspot", async (req, res) => {
  const expectedSecret = (process.env.HUBSPOT_WEBHOOK_SECRET ?? "").trim();
  const providedSecret =
    (req.headers["x-hubspot-signature"] as string | undefined) ??
    (req.headers["x-webhook-secret"] as string | undefined);

  if (!verifyHubSpotWebhookSecret(providedSecret, expectedSecret || undefined)) {
    res.status(401).json({ error: "Unauthorized — invalid HubSpot webhook secret" });
    return;
  }

  try {
    const mapped = mapHubSpotDealToDeepContext(req.body as HubSpotWebhookPayload);
    if (!mapped) {
      res.status(400).json({ error: "No deal payload found — expected deal or deals[]" });
      return;
    }
    res.json({ ok: true, mapped });
  } catch (err) {
    console.error("HubSpot webhook error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "HubSpot webhook mapping failed",
    });
  }
});

app.post("/api/live/objections", requireApiKey, async (req, res) => {
  try {
    const full_transcript = String(req.body?.full_transcript ?? "");
    const existing_objections = Array.isArray(req.body?.existing_objections)
      ? req.body.existing_objections
      : [];
    const result = await scanLiveObjectionsServer({
      full_transcript,
      existing_objections,
    });
    res.json(result);
  } catch (err) {
    console.error("Live objection scan error:", err);
    const raw = err instanceof Error ? err.message : "Live scan failed.";
    res.status(500).json({ error: formatApiError(raw) });
  }
});

app.post("/api/live/triage", requireApiKey, async (req, res) => {
  try {
    const result = await runLiveTriage({
      full_transcript: String(req.body?.full_transcript ?? ""),
      platform: String(req.body?.platform ?? "live"),
      deal_value:
      Number.isFinite(Number(req.body?.deal_value)) && Number(req.body?.deal_value) > 0
        ? Number(req.body.deal_value)
        : undefined,
      open_objections: Array.isArray(req.body?.open_objections)
        ? req.body.open_objections.map(String)
        : [],
    });
    res.json(result);
  } catch (err) {
    console.error("Live triage error:", err);
    const raw = err instanceof Error ? err.message : "Live triage failed.";
    res.status(500).json({ error: formatApiError(raw) });
  }
});

/** Record rescue loop outcome — anonymous metadata only, no transcript. */
app.post("/api/post-mortem/:id/rescue-outcome", requireApiKey, async (req, res) => {
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

  if (indices?.deal_risk_index == null) {
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

registerZoomRoutes(app);
registerGoogleMeetRoutes(app);
registerTeamsRoutes(app);
registerTrustPackRoutes(app, publicPath);

/** Public assets (logo, legal-shared.css). Trust-pack HTML only via /api/trust-pack/:slug. */
app.use(express.static(publicPath, { index: false }));

if (process.env.NODE_ENV === "production" || existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    const legacySlug = trustPackSlugFromPath(req.path);
    if (legacySlug && /\.html$/i.test(req.path)) {
      res.redirect(301, `/api/trust-pack/${legacySlug}`);
      return;
    }
    const trustFile = path.join(publicPath, req.path.replace(/^\//, ""));
    if (/\.css$/i.test(req.path) && existsSync(trustFile)) {
      res.sendFile(trustFile);
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
