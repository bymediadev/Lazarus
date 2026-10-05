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
  buildDealMemorySummary,
  detectRecurringVetoHolders,
} from "./deepContext.js";
import { extractDocumentText, DOCUMENT_MAX_BYTES } from "./documents.js";
import {
  savePostMortem,
  saveRescueOutcome,
  getPostMortemUserId,
} from "./supabase.js";
import { buildAnalysisTranscript } from "./transcript.js";
import { stripOutcomeMetadata } from "./sanitize.js";
import { normalizeEmailThread, normalizeManualTranscript } from "./normalize.js";
import { scanLiveObjections as scanLiveObjectionsServer } from "./liveObjections.js";
import { runLiveTriage } from "./liveTriage.js";
import { classifySalesRelevance } from "./relevanceGate.js";
import { canonicalTrustPackPath, registerTrustPackRoutes, trustPackSlugFromPath } from "./trustPack.js";
import {
  mapHubSpotDealToDeepContext,
  verifyHubSpotV3Signature,
  type HubSpotWebhookPayload,
} from "./integrations/hubspot.js";
import { registerZoomRoutes, registerZoomWebhook } from "./integrations/zoom/routes.js";
import { registerGoogleMeetRoutes } from "./integrations/google/routes.js";
import { hydrateGoogleTokens } from "./integrations/google/tokens.js";
import { registerTeamsRoutes } from "./integrations/teams/routes.js";
import { registerHubSpotRoutes } from "./integrations/hubspot/routes.js";
import { getHubSpotConfig } from "./integrations/hubspot/config.js";
import { userOwnsHubSpotDeal } from "./integrations/hubspot/deals.js";
import { userOwnsSalesforceOpportunity } from "./integrations/salesforce/deals.js";
import { hydrateHubSpotTokens } from "./integrations/hubspot/tokens.js";
import { hydrateSalesforceTokens } from "./integrations/salesforce/tokens.js";
import { hydrateTeamsTokens } from "./integrations/teams/tokens.js";
import { hydrateZoomTokens } from "./integrations/zoom/tokens.js";
import { resolveAuthUser } from "./founderAuth.js";
import { registerSalesforceRoutes } from "./integrations/salesforce/routes.js";
import { answerGuideQuestion } from "./guide.js";
import {
  upsertCrmDealLink,
  getCrmDealLinkByExternalId,
  updateCrmDealLinkContext,
  wipeReportForClosedCrmDeal,
  stampCrmLinkTenantFromUser,
} from "./crmDealLinks.js";
import { registerAuthRoutes } from "./authRoutes.js";
import { registerFeedbackRoutes } from "./feedback.js";
import { registerSeoPageRoutes, sendIndexedHtml } from "./seoPages.js";
import { optionalAuthUserId } from "./authMiddleware.js";
import {
  isAnonymousGuestRateLimited,
  consumeAnonymousGuestSlot,
  isFreemiumExempt,
  isIpDailyRateLimited,
  consumeIpMonthlySlot,
  ipDailyLimitMessage,
  isPpuIpRateLimited,
  consumePpuIpSlot,
  ppuIpLimitMessage,
  guestServerLimitMessage,
} from "./guestRateLimit.js";
import {
  ensureBillingCustomer,
  evaluateCanAnalyze,
  isStripeConfigured,
  releaseReservation,
  reserveAnalysis,
  skipsIpMonthlyCap,
  type ConsumeKind,
} from "./billing.js";
import { consumeForLlmRoute, preferOpenWeightsFor, resolveModelTierForUser } from "./modelForPlan.js";
import { registerBillingRoutes, registerBillingWebhook } from "./billingRoutes.js";
import { apiEventsMiddleware, setApiErrorLocal } from "./apiEvents.js";
import { registerFounderRoutes } from "./founderRoutes.js";
import { registerTenantKeyRoutes } from "./tenantKeyRoutes.js";
import { registerMeDealRoutes } from "./meDeals.js";
import { registerTelemetryRoutes } from "./telemetry.js";
import { getRuntimeConfig, rejectIfAnalysesBlocked } from "./runtimeConfig.js";
import { registerContactRoutes } from "./contact.js";
import { corsAllowedOrigins } from "./integrations/oauthShared.js";
import { secretsEqual } from "./cryptoSecrets.js";
import { rateLimit, skipPublicAndWebhooks } from "./rateLimit.js";
import { enforceCaptcha, publicCaptchaConfig } from "./captcha.js";
import { requireAuthUser, getAuthUserId } from "./requireUser.js";
import { decideApiKey, findTenantIdByApiKey } from "./tenantApiKey.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, "../dist");
const publicPath = path.join(__dirname, "../public");

const app = express();
app.disable("x-powered-by");
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
  limits: { fileSize: 25 * 1024 * 1024 },
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

app.use(
  "/api",
  rateLimit({
    windowMs: 60_000,
    max: 180,
    name: "api",
    skip: skipPublicAndWebhooks,
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
      "script-src 'self' 'unsafe-inline' https://appssdk.zoom.us https://*.zoom.us https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://openrouter.ai https://generativelanguage.googleapis.com https://api.assemblyai.com https://challenges.cloudflare.com https://*.zoom.us wss://*.zoom.us https://login.microsoftonline.com https://graph.microsoft.com",
      "frame-src 'self' https://*.zoom.us https://www.loom.com https://*.loom.com https://challenges.cloudflare.com",
      "frame-ancestors 'self' https://*.zoom.us https://zoom.us https://teams.microsoft.com https://*.teams.microsoft.com https://*.cloud.microsoft",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://zoom.us https://*.zoom.us",
    ].join("; ")
  );
  next();
});

registerZoomWebhook(app);
registerBillingWebhook(app);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: string }).rawBody = buf.toString("utf8");
    },
  })
);
app.use(apiEventsMiddleware);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

function formatApiError(message: string): string {
  if (
    message.includes("401") ||
    message.includes("invalid authentication") ||
    message.includes("API key not valid")
  ) {
    return "GEMINI_API_KEY was rejected by Google (401). Create a new key at https://aistudio.google.com/apikey — AIza or AQ. format both work. Restart npm run dev after updating .env.";
  }
  if (/unavailable for free|No endpoints found/i.test(message)) {
    return "OpenRouter free models changed. Update OPENROUTER_MODEL_LIVE / OPENROUTER_MODEL_AUTOPSY. See docs/llm-failover.md.";
  }
  if (message.includes("ETIMEDOUT") || message.includes("aborted")) {
    return "The analysis timed out. Wait a minute and run the deal again.";
  }
  if (message.includes("429") || message.includes("quota") || message.includes("All LLM providers failed")) {
    return "The analysis providers are rate-limited or down. Wait a few minutes and run the deal again.";
  }
  if (message.includes("GEMINI_API_KEY") || message.includes("No LLM provider")) {
    return "No LLM key is set. Add GEMINI_API_KEY, or a free OPENROUTER_API_KEY. See docs/llm-failover.md.";
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

/** Site key unlocks the browser. A company key stamps that workspace. */
function requireApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  void (async () => {
    const header = (req.headers["x-api-key"] as string | undefined)?.trim() ?? "";
    const siteKey = (process.env.LAZARUS_API_KEY ?? "").trim();
    let tenantIdForHeader: string | null = null;
    if (header && !(siteKey && secretsEqual(header, siteKey))) {
      tenantIdForHeader = await findTenantIdByApiKey(header);
    }
    const decision = decideApiKey({
      header,
      siteKey,
      tenantIdForHeader,
    });
    if (!decision.ok) {
      res.status(decision.status).json({ error: "Unauthorized — invalid or missing API key" });
      return;
    }
    if (decision.tenantId) {
      (req as express.Request & { tenantIdFromKey?: string }).tenantIdFromKey = decision.tenantId;
    }
    next();
  })().catch(next);
}

app.post(
  "/api/post-mortem",
  rateLimit({ windowMs: 60_000, max: 12, name: "post-mortem" }),
  requireApiKey,
  (req, res, next) => {
    void enforceCaptcha(req)
      .then((captcha) => {
        if (!captcha.ok) {
          res.status(captcha.status).json({ error: captcha.error, code: captcha.code });
          return;
        }
        next();
      })
      .catch(next);
  },
  uploadFields,
  async (req, res) => {
  let reservation: ConsumeKind | null = null;
  let reservationUserId: string | undefined;
  let committed = false;
  let consumeGuestFree = false;
  let consumeIpMonth = false;
  let consumePpuIp = false;
  let clientGone = false;
  res.on("close", () => {
    if (!res.writableEnded) clientGone = true;
  });
  try {
    if (await rejectIfAnalysesBlocked(req, res)) return;
    const authUserIdEarly = (await optionalAuthUserId(req)) ?? undefined;
    const freemiumExempt = await isFreemiumExempt(req);
    if (!freemiumExempt) {
      let skipIpCeiling = false;
      if (authUserIdEarly) {
        const billingRow = await ensureBillingCustomer(authUserIdEarly);
        skipIpCeiling = !!(
          billingRow &&
          (skipsIpMonthlyCap(billingRow) || evaluateCanAnalyze(billingRow).consume === "ppu")
        );
      }
      // Peek only — failed analyses must not burn free slots.
      if (!skipIpCeiling && (await isIpDailyRateLimited(req))) {
        res.status(429).json({
          error: ipDailyLimitMessage(),
          code: "IP_DAILY_LIMIT",
        });
        return;
      }
      if (!skipIpCeiling) consumeIpMonth = true;
      if (!authUserIdEarly) {
        if (await isAnonymousGuestRateLimited(req)) {
          res.status(402).json({
            error: guestServerLimitMessage(),
            code: "GUEST_USAGE_LIMIT",
          });
          return;
        }
        consumeGuestFree = true;
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
        if (reservation === "ppu") {
          if (await isPpuIpRateLimited(req)) {
            res.status(429).json({
              error: ppuIpLimitMessage(),
              code: "PPU_IP_LIMIT",
            });
            return;
          }
          consumePpuIp = true;
        }
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
    const preferOpenWeights = preferOpenWeightsFor({
      userId: authUserIdEarly,
      consume: reservation,
      exempt: freemiumExempt,
    });
    const relevance = await classifySalesRelevance(transcript, { preferOpenWeights });
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
      preferOpenWeights,
    });

    const recurringVetoHolders = deepContext.historicalCrmContext?.length
      ? detectRecurringVetoHolders(deepContext.historicalCrmContext)
      : [];
    const dealMemorySummary = buildDealMemorySummary(
      result as unknown as Record<string, unknown>,
      recurringVetoHolders
    );

    const authUserId = authUserIdEarly;
    const tenantIdFromKey =
      (req as express.Request & { tenantIdFromKey?: string }).tenantIdFromKey ?? null;
    const sourceRef = String(req.body?.source_ref ?? "").trim();
    // Guests with no company key are not stored. Signed-in users and company keys are.
    // The response below still returns the full brief. The saved row does not keep evidence.
    const savedId =
      authUserId || tenantIdFromKey
        ? await savePostMortem({
            userId: authUserId || undefined,
            tenantIdFromKey,
            sourceRef: sourceRef || null,
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
            dealMemorySummary: dealMemorySummary as Record<string, unknown>,
          })
        : null;

    const linkedHubSpotDealId = String(req.body?.hubspot_deal_id ?? "").trim();
    const linkedSalesforceOppId = String(req.body?.salesforce_opportunity_id ?? "").trim();
    const linkWarnings: string[] = [];
    if (savedId && linkedHubSpotDealId) {
      if (!authUserId) {
        linkWarnings.push("HubSpot deal was not linked — sign in and connect HubSpot first.");
      } else {
        const owned = await userOwnsHubSpotDeal(authUserId, linkedHubSpotDealId);
        if (!owned.ok) {
          linkWarnings.push("HubSpot deal was not linked — it is not in the connected portal.");
        } else {
          await upsertCrmDealLink({
            provider: "hubspot",
            externalDealId: linkedHubSpotDealId,
            portalId: owned.portalId,
            postMortemId: savedId,
            userId: authUserId,
            accountId: deepContext.accountId,
            salesCycleDays: deepContext.salesCycleDays,
            historicalCrmContext: deepContext.historicalCrmContext,
          });
        }
      }
    }
    if (savedId && linkedSalesforceOppId) {
      if (!authUserId) {
        linkWarnings.push("Salesforce opportunity was not linked — sign in and connect Salesforce first.");
      } else {
        const owned = await userOwnsSalesforceOpportunity(authUserId, linkedSalesforceOppId);
        if (!owned.ok) {
          linkWarnings.push("Salesforce opportunity was not linked — it is not in the connected org.");
        } else {
          await upsertCrmDealLink({
            provider: "salesforce",
            externalDealId: linkedSalesforceOppId,
            portalId: owned.portalId,
            postMortemId: savedId,
            userId: authUserId,
            accountId: deepContext.accountId,
            salesCycleDays: deepContext.salesCycleDays,
            historicalCrmContext: deepContext.historicalCrmContext,
          });
        }
      }
    }

    const warnings: string[] = [];
    const addWarning = (msg: string) => {
      if (!warnings.includes(msg)) warnings.push(msg);
    };
    for (const msg of linkWarnings) addWarning(msg);
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

    if (clientGone) {
      throw new Error("client aborted before the brief was sent");
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
    if (committed) {
      if (consumeGuestFree) await consumeAnonymousGuestSlot(req);
      if (consumeIpMonth) await consumeIpMonthlySlot(req);
      if (consumePpuIp) await consumePpuIpSlot(req);
    }
  }
});

/** HubSpot deal webhook → deep-context upsert into crm_deal_links (CRM → Lazarus). */
app.post("/api/webhooks/hubspot", async (req, res) => {
  const cfg = getHubSpotConfig();
  const rawBody = (req as express.Request & { rawBody?: string }).rawBody ?? "";
  const proto = String(req.headers["x-forwarded-proto"] ?? req.protocol);
  const host = req.get("host") ?? "";
  const uri = `${proto}://${host}${req.originalUrl}`;
  const signatureOk =
    !!cfg &&
    verifyHubSpotV3Signature({
      method: req.method,
      uri,
      rawBody,
      signature: req.headers["x-hubspot-signature-v3"] as string | undefined,
      timestamp: req.headers["x-hubspot-request-timestamp"] as string | undefined,
      clientSecret: cfg.clientSecret,
    });
  if (!signatureOk) {
    res.status(401).json({ error: "Unauthorized — invalid HubSpot webhook signature" });
    return;
  }

  try {
    const mapped = mapHubSpotDealToDeepContext(req.body as HubSpotWebhookPayload);
    if (!mapped) {
      res.status(400).json({ error: "No deal payload found — expected deal or deals[]" });
      return;
    }
    const body = req.body as { portalId?: unknown; portal_id?: unknown };
    const portalId = String(body.portalId ?? body.portal_id ?? "").trim();
    const externalId = String(mapped.deal_id ?? mapped.account_id ?? "").trim();
    let linkId: string | null = null;
    if (externalId && mapped.closed) {
      const wiped = await wipeReportForClosedCrmDeal("hubspot", externalId, portalId);
      res.json({ ok: true, mapped, wiped, synced: wiped });
      return;
    }
    if (externalId) {
      const existing = await getCrmDealLinkByExternalId("hubspot", externalId, portalId);
      if (existing?.user_id) {
        await updateCrmDealLinkContext(existing.id, {
          historical_crm_context: mapped.historical_crm_context,
          sales_cycle_days: mapped.sales_cycle_days,
          last_inbound_at: new Date().toISOString(),
        });
        await stampCrmLinkTenantFromUser(existing.id, existing.user_id);
        linkId = existing.id;
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

async function allowLiveCaller(req: express.Request, res: express.Response): Promise<boolean> {
  const user = await resolveAuthUser(req);
  if (user) return true;
  const captcha = await enforceCaptcha(req);
  if (!captcha.ok) {
    res.status(captcha.status).json({ error: captcha.error, code: captcha.code });
    return false;
  }
  return true;
}

app.post(
  "/api/live/objections",
  rateLimit({ windowMs: 60_000, max: 30, name: "live-ai" }),
  requireApiKey,
  async (req, res) => {
  try {
    if (!(await allowLiveCaller(req, res))) return;
    if (await rejectIfAnalysesBlocked(req, res)) return;
    const full_transcript = String(req.body?.full_transcript ?? "");
    const existing_objections = Array.isArray(req.body?.existing_objections)
      ? req.body.existing_objections
      : [];
    const userId = (await optionalAuthUserId(req)) ?? undefined;
    const exempt = await isFreemiumExempt(req);
    const consume = await consumeForLlmRoute(userId, exempt);
    const modelTier = await resolveModelTierForUser({
      userId,
      consume,
      exempt,
    });
    const result = await scanLiveObjectionsServer({
      full_transcript,
      existing_objections,
      modelTier,
      preferOpenWeights: preferOpenWeightsFor({ userId, consume, exempt }),
    });
    res.json(result);
  } catch (err) {
    console.error("Live objection scan error:", err);
    const raw = err instanceof Error ? err.message : "Live scan failed.";
    res.status(500).json({ error: formatApiError(raw) });
  }
});

app.post(
  "/api/live/triage",
  rateLimit({ windowMs: 60_000, max: 20, name: "live-triage" }),
  requireApiKey,
  async (req, res) => {
  try {
    if (!(await allowLiveCaller(req, res))) return;
    if (await rejectIfAnalysesBlocked(req, res)) return;
    const userId = (await optionalAuthUserId(req)) ?? undefined;
    const exempt = await isFreemiumExempt(req);
    const consume = await consumeForLlmRoute(userId, exempt);
    const modelTier = await resolveModelTierForUser({
      userId,
      consume,
      exempt,
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
      preferOpenWeights: preferOpenWeightsFor({ userId, consume, exempt }),
    });
    res.json(result);
  } catch (err) {
    console.error("Live triage error:", err);
    const raw = err instanceof Error ? err.message : "Live triage failed.";
    res.status(500).json({ error: formatApiError(raw) });
  }
});

/** Record rescue loop outcome — owner of the saved analysis only. */
app.post(
  "/api/post-mortem/:id/rescue-outcome",
  requireApiKey,
  requireAuthUser,
  async (req, res) => {
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
    const ownerId = await getPostMortemUserId(req.params.id);
    const userId = getAuthUserId(req);
    if (!ownerId || !userId || ownerId !== userId) {
      res.status(403).json({ error: "Not allowed to record an outcome for this analysis." });
      return;
    }
    const savedId = await saveRescueOutcome({
      postMortemId: req.params.id,
      userId,
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

registerZoomRoutes(app);
registerGoogleMeetRoutes(app);
registerTeamsRoutes(app);
registerHubSpotRoutes(app);
registerSalesforceRoutes(app);
registerAuthRoutes(app);
registerFeedbackRoutes(app);
registerBillingRoutes(app);
registerContactRoutes(app);
registerFounderRoutes(app);
registerTenantKeyRoutes(app);
registerMeDealRoutes(app);
registerTelemetryRoutes(app);
registerTrustPackRoutes(app, publicPath);
registerSeoPageRoutes(app, publicPath);

app.get("/api/runtime", async (_req, res) => {
  try {
    const cfg = await getRuntimeConfig();
    res.json({
      analyses_paused: cfg.analyses_paused,
      pause_message: cfg.pause_message,
      captcha: publicCaptchaConfig(),
      stripe: isStripeConfigured(),
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
    sendIndexedHtml(path.join(distPath, "index.html"), res);
  });
}

const PORT = Number(process.env.PORT ?? 3001);
void Promise.all([
  hydrateGoogleTokens(),
  hydrateZoomTokens(),
  hydrateHubSpotTokens(),
  hydrateSalesforceTokens(),
  hydrateTeamsTokens(),
]).catch((err) => {
  console.warn("[oauth-tokens] hydrate failed:", err instanceof Error ? err.message : err);
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Lazarus Deal Recovery API running on http://0.0.0.0:${PORT}`);
  if (existsSync(distPath)) {
    console.log(`Serving frontend from ${distPath}`);
  }
});
