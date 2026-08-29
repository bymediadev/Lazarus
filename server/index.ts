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
import { extractDocumentText, DOCUMENT_MAX_BYTES } from "./documents.js";
import { savePostMortem, purgeExpiredTranscripts, saveRescueOutcome } from "./supabase.js";
import { buildAnalysisTranscript } from "./transcript.js";
import { stripOutcomeMetadata } from "./sanitize.js";
import { normalizeEmailThread, normalizeManualTranscript } from "./normalize.js";
import { scanLiveObjections as scanLiveObjectionsServer } from "./liveObjections.js";
import { runLiveTriage } from "./liveTriage.js";
import { classifySalesRelevance } from "./relevanceGate.js";
import { canonicalTrustPackPath, registerTrustPackRoutes, trustPackSlugFromPath } from "./trustPack.js";
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
import { registerHubSpotRoutes } from "./integrations/hubspot/routes.js";
import { isHubSpotConfigured } from "./integrations/hubspot/config.js";
import { registerSalesforceRoutes } from "./integrations/salesforce/routes.js";
import { isSalesforceConfigured } from "./integrations/salesforce/config.js";
import { answerGuideQuestion } from "./guide.js";
import {
  upsertCrmDealLink,
  getCrmDealLinkByExternalId,
  updateCrmDealLinkContext,
} from "./crmDealLinks.js";
import { registerAuthRoutes } from "./authRoutes.js";
import { optionalAuthUserId } from "./authMiddleware.js";
import {
  isAnonymousGuestRateLimited,
  isFreemiumExempt,
} from "./guestRateLimit.js";
import {
  isStripeConfigured,
  PAYMENT_REQUIRED_MESSAGE,
  releaseReservation,
  reserveAnalysis,
  type ConsumeKind,
} from "./billing.js";
import { resolveModelTierForUser } from "./modelForPlan.js";
import { registerBillingRoutes, registerBillingWebhook } from "./billingRoutes.js";
import { apiEventsMiddleware, setApiErrorLocal } from "./apiEvents.js";
import { registerFounderRoutes } from "./founderRoutes.js";
import { registerMeDealRoutes } from "./meDeals.js";
import { registerTelemetryRoutes } from "./telemetry.js";
import { getRuntimeConfig, rejectIfAnalysesBlocked } from "./runtimeConfig.js";
import { isContactConfigured, registerContactRoutes } from "./contact.js";
import { corsAllowedOrigins } from "./integrations/oauthShared.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, "../dist");
const publicPath = path.join(__dirname, "../public");

const app = express();
app.set("trust proxy", 1);

const CANONICAL_HOST = "www.getldr.ca";
const APEX_HOST = "getldr.ca";
const RENDER_PUBLIC_HOST = (
  process.env.RENDER_EXTERNAL_HOSTNAME || "lazarus-4uxi.onrender.com"
).toLowerCase();

app.use((req, res, next) => {
  const host = (req.hostname || "").toLowerCase();
  const sendToCanonical =
    req.method === "GET" &&
    !req.path.startsWith("/api") &&
    (host === APEX_HOST || host === RENDER_PUBLIC_HOST);
  if (sendToCanonical) {
    res.redirect(301, `https://${CANONICAL_HOST}${req.originalUrl}`);
    return;
  }
  next();
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});
const uploadFields = upload.fields([
  { name: "recording", maxCount: 1 },
  { name: "document", maxCount: 1 },
]);

function firstUploadedFile(
  files: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] } | undefined,
  field: string
): Express.Multer.File | undefined {
  if (!files || Array.isArray(files)) return undefined;
  return files[field]?.[0];
}

app.use(
  cors({
    origin(origin, callback) {
      const allowed = corsAllowedOrigins();
      if (!origin || allowed.includes("*") || allowed.includes(origin)) {
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
      "frame-src 'self' https://*.zoom.us https://www.loom.com https://*.loom.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://zoom.us https://*.zoom.us",
    ].join("; ")
  );
  next();
});

registerZoomWebhook(app);
registerBillingWebhook(app);

app.use(express.json());
app.use(apiEventsMiddleware);

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
    hubspot: isHubSpotConfigured(),
    salesforce: isSalesforceConfigured(),
    whitewhale: false,
    stripe: isStripeConfigured(),
    contact: isContactConfigured(),
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
    return "Gemini API quota exceeded. Wait a few minutes and retry, enable Google billing for Team (Gemini 3.1 Pro), or set GEMINI_MODEL=gemini-2.5-flash in .env.";
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

app.post("/api/post-mortem", requireApiKey, uploadFields, async (req, res) => {
  let reservation: ConsumeKind | null = null;
  let reservationUserId: string | undefined;
  let committed = false;
  try {
    if (await rejectIfAnalysesBlocked(req, res)) return;
    const authUserIdEarly = (await optionalAuthUserId(req)) ?? undefined;
    const freemiumExempt = await isFreemiumExempt(req);
    if (!freemiumExempt) {
      if (!authUserIdEarly) {
        if (isAnonymousGuestRateLimited(req)) {
          res.status(402).json({
            error: PAYMENT_REQUIRED_MESSAGE,
            code: "PAYMENT_REQUIRED",
          });
          return;
        }
      } else {
        const decision = await reserveAnalysis(authUserIdEarly);
        if (!decision.ok) {
          res.status(decision.status).json({
            error: decision.error,
            code: decision.code,
          });
          return;
        }
        reservation = decision.consume;
        reservationUserId = authUserIdEarly;
      }
    }

    const processedAt = new Date().toISOString();
    const dealValue = parseFloat(String(req.body.deal_value)) || 0;
    const deepContext = parseDeepContextFromBody(req.body as Record<string, unknown>);
    const manualRaw = normalizeTextField(req.body.transcript);
    const livePayloadText = deepContext.liveTranscriptPayload?.length
      ? formatLiveTranscriptPayload(deepContext.liveTranscriptPayload)
      : "";
    const combinedManualInput = [manualRaw, livePayloadText].filter((part) => part.trim()).join(
      "\n\n--- LIVE SESSION TRANSCRIPT ---\n\n"
    );
    const manualTranscript = normalizeManualTranscript(combinedManualInput);
    const emailRaw = normalizeTextField(req.body.email_thread);
    const emailThread = normalizeEmailThread(emailRaw);
    const isFieldCapture = ["1", "true", true].includes(req.body.field_capture as string | boolean);
    const strippedPriorAnalysis = manualRaw.trim().length - manualTranscript.length > 80;
    let audioTranscript = "";
    let audioMeta: { durationSeconds?: number; speakerCount?: number } | undefined;
    let documentText = "";

    const recording = firstUploadedFile(req.files, "recording");
    const documentFile = firstUploadedFile(req.files, "document");

    if (recording) {
      const transcription = await transcribeAudio(recording.buffer, recording.originalname);
      audioTranscript = transcription.formatted;
      audioMeta = {
        durationSeconds: transcription.durationSeconds,
        speakerCount: transcription.speakerCount,
      };
    }

    if (documentFile) {
      if (documentFile.size > DOCUMENT_MAX_BYTES) {
        res.status(400).json({
          error: `Document exceeds ${DOCUMENT_MAX_BYTES / (1024 * 1024)} MB limit.`,
        });
        return;
      }
      try {
        const extracted = await extractDocumentText(
          documentFile.buffer,
          documentFile.originalname,
          documentFile.mimetype
        );
        documentText = extracted.text;
      } catch (docErr) {
        const message = docErr instanceof Error ? docErr.message : "Document extraction failed.";
        res.status(400).json({ error: message });
        return;
      }
    }

    const { text: rawTranscript, sources } = buildAnalysisTranscript({
      audioTranscript,
      manualTranscript,
      emailThread,
      documentText,
      fieldCaptureAudio: isFieldCapture && !!audioTranscript,
      audioMeta,
      audioCapturedAt: audioTranscript ? processedAt : undefined,
      callCapturedAt: manualTranscript ? processedAt : undefined,
      emailCapturedAt: emailThread ? processedAt : undefined,
      fieldCapturedAt: isFieldCapture && audioTranscript ? processedAt : undefined,
      documentCapturedAt: documentText ? processedAt : undefined,
    });

    if (!rawTranscript.trim()) {
      res.status(400).json({
        error:
          "Add one or more evidence sources. Every recording, transcript, email thread, and document is analyzed together.",
      });
      return;
    }

    const transcript = stripOutcomeMetadata(rawTranscript);
    const forceAnalysis = ["1", "true", true].includes(
      req.body.force_analysis as string | boolean
    );
    const relevance = await classifySalesRelevance(transcript);
    if (relevance.label === "not_sales" && !forceAnalysis) {
      res.status(400).json({
        error: `Can't use this — it doesn't look like sales or deal evidence. ${relevance.reason}`,
        code: "NOT_SALES_EVIDENCE",
        relevance,
      });
      return;
    }

    const result = await analyzeTranscript(transcript, {
      dealValue,
      deepContext,
      modelTier: await resolveModelTierForUser({
        userId: authUserIdEarly,
        consume: reservation,
        exempt: freemiumExempt,
      }),
    });

    const recurringVetoHolders = deepContext.historicalCrmContext?.length
      ? detectRecurringVetoHolders(deepContext.historicalCrmContext)
      : [];
    const ingestMetadata = buildIngestMetadata(deepContext);
    const dealMemorySummary = buildDealMemorySummary(
      result as unknown as Record<string, unknown>,
      recurringVetoHolders
    );

    const authUserId = authUserIdEarly;
    // Guests can run analyses for demos; only persist when signed in.
    const savedId = authUserId
      ? await savePostMortem({
          userId: authUserId,
          clientName: result.client_name,
          dealValue,
          dealStatus: result.deal_classification.status,
          headline: result.executive_summary,
          diagnosis: result.diagnosis,
          actionPlan: result.action_plan.join("\n"),
          transcriptText: rawTranscript,
          analysisJson: JSON.stringify({
            ...result,
            processed_at: processedAt,
          }),
          ...(ingestMetadata ? { ingestMetadata: ingestMetadata as Record<string, unknown> } : {}),
          dealMemorySummary: dealMemorySummary as Record<string, unknown>,
        })
      : null;

    const linkedHubSpotDealId = String(req.body?.hubspot_deal_id ?? "").trim();
    const linkedSalesforceOppId = String(req.body?.salesforce_opportunity_id ?? "").trim();
    if (savedId && linkedHubSpotDealId) {
      await upsertCrmDealLink({
        provider: "hubspot",
        externalDealId: linkedHubSpotDealId,
        postMortemId: savedId,
        userId: authUserId,
        accountId: deepContext.accountId,
        salesCycleDays: deepContext.salesCycleDays,
        historicalCrmContext: deepContext.historicalCrmContext,
      });
    }
    if (savedId && linkedSalesforceOppId) {
      await upsertCrmDealLink({
        provider: "salesforce",
        externalDealId: linkedSalesforceOppId,
        postMortemId: savedId,
        userId: authUserId,
        accountId: deepContext.accountId,
        salesCycleDays: deepContext.salesCycleDays,
        historicalCrmContext: deepContext.historicalCrmContext,
      });
    }

    const warnings: string[] = [];
    const addWarning = (msg: string) => {
      if (!warnings.includes(msg)) warnings.push(msg);
    };
    if (forceAnalysis && relevance.label === "not_sales") {
      addWarning(
        `Relevance override used — classifier flagged this as not sales/deal evidence (${relevance.reason}).`
      );
    }
    if (strippedPriorAnalysis) {
      addWarning(
        "Removed a prior Lazarus Deal Recovery analysis that was pasted below the call transcript. Only the call text was analyzed."
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
      relevance,
    });
    committed = true;
  } catch (err) {
    console.error("Post-mortem error:", err);
    const raw = err instanceof Error ? err.message : "Post-mortem failed.";
    const friendly = formatApiError(raw);
    setApiErrorLocal(res, friendly);
    res.status(500).json({ error: friendly });
  } finally {
    if (!committed && reservation && reservationUserId) {
      await releaseReservation(reservationUserId, reservation);
    }
  }
});

/** HubSpot deal webhook → deep-context upsert into crm_deal_links (CRM → Lazarus). */
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
    const externalId = String(mapped.deal_id ?? mapped.account_id ?? "").trim();
    let linkId: string | null = null;
    if (externalId) {
      const existing = await getCrmDealLinkByExternalId("hubspot", externalId);
      if (existing) {
        await updateCrmDealLinkContext(existing.id, {
          historical_crm_context: mapped.historical_crm_context,
          sales_cycle_days: mapped.sales_cycle_days,
          last_inbound_at: new Date().toISOString(),
        });
        linkId = existing.id;
      } else {
        linkId = await upsertCrmDealLink({
          provider: "hubspot",
          externalDealId: externalId,
          accountId: mapped.account_id,
          salesCycleDays: mapped.sales_cycle_days,
          historicalCrmContext: mapped.historical_crm_context,
          lastInboundAt: new Date().toISOString(),
        });
      }
    }
    res.json({ ok: true, mapped, link_id: linkId, synced: !!linkId });
  } catch (err) {
    console.error("HubSpot webhook error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "HubSpot webhook mapping failed",
    });
  }
});

/** Product guide Q&A — grounded on static how-to content only. */
app.post("/api/guide/chat", requireApiKey, async (req, res) => {
  try {
    const question = String(req.body?.question ?? "");
    const history = Array.isArray(req.body?.history)
      ? (req.body.history as { role?: string; content?: string }[])
          .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: String(m.content),
          }))
      : [];
    const result = await answerGuideQuestion(question, history);
    res.json(result);
  } catch (err) {
    console.error("Guide chat error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Guide chat failed",
    });
  }
});

app.post("/api/live/objections", requireApiKey, async (req, res) => {
  try {
    if (await rejectIfAnalysesBlocked(req, res)) return;
    const full_transcript = String(req.body?.full_transcript ?? "");
    const existing_objections = Array.isArray(req.body?.existing_objections)
      ? req.body.existing_objections
      : [];
    const userId = (await optionalAuthUserId(req)) ?? undefined;
    const modelTier = await resolveModelTierForUser({
      userId,
      exempt: await isFreemiumExempt(req),
    });
    const result = await scanLiveObjectionsServer({
      full_transcript,
      existing_objections,
      modelTier,
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
    if (await rejectIfAnalysesBlocked(req, res)) return;
    const userId = (await optionalAuthUserId(req)) ?? undefined;
    const modelTier = await resolveModelTierForUser({
      userId,
      exempt: await isFreemiumExempt(req),
    });
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
      modelTier,
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
registerHubSpotRoutes(app);
registerSalesforceRoutes(app);
registerAuthRoutes(app);
registerBillingRoutes(app);
registerContactRoutes(app);
registerFounderRoutes(app);
registerMeDealRoutes(app);
registerTelemetryRoutes(app);
registerTrustPackRoutes(app, publicPath);

app.get("/api/runtime", async (_req, res) => {
  try {
    const cfg = await getRuntimeConfig();
    res.json({
      analyses_paused: cfg.analyses_paused,
      pause_message: cfg.pause_message,
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Runtime status failed",
    });
  }
});

/** Public assets (logo, legal-shared.css). Trust-pack HTML via /privacy, /terms, /dpa, /security-overview. */
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
      res.redirect(301, canonicalTrustPackPath(legacySlug));
      return;
    }
    const trustFile = path.join(publicPath, req.path.replace(/^\//, ""));
    if (/\.css$/i.test(req.path) && existsSync(trustFile)) {
      res.sendFile(trustFile);
      return;
    }
    const p = req.path;
    if (
      p === "/app" ||
      p.startsWith("/app/") ||
      p === "/portal" ||
      p.startsWith("/portal/") ||
      p === "/login"
    ) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
    }
    res.sendFile(path.join(distPath, "index.html"));
  });
}

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Lazarus Deal Recovery API running on http://0.0.0.0:${PORT}`);
  if (existsSync(distPath)) {
    console.log(`Serving frontend from ${distPath}`);
  }
});
