import { useCallback, useEffect, useMemo, useState } from "react";
import AnalysisReport from "./components/AnalysisReport";
import DealProfilePanel, { parseHistoricalCrmJson } from "./components/DealProfilePanel";
import MeetingCompanion from "./components/MeetingCompanion";
import LiveTriageBrief from "./components/LiveTriageBrief";
import FieldRecorder from "./components/FieldRecorder";
import SiteFooter from "./components/SiteFooter";
import TrustPackLink from "./components/TrustPackLink";
import TrustPackModal from "./components/TrustPackModal";
import IntakeHowTo from "./components/IntakeHowTo";
import LazarusGuide from "./components/LazarusGuide";
import EmailProviderControls from "./components/EmailProviderControls";
import { useAuth } from "./components/AuthProvider";
import LoginScreen from "./components/LoginScreen";
import PasswordRecoveryScreen from "./components/PasswordRecoveryScreen";
import AccountPortal from "./components/AccountPortal";
import DealLifecyclePanel from "./components/DealLifecyclePanel";
import FounderCommandCenter from "./components/FounderCommandCenter";
import { isPasswordRecoveryPending } from "./lib/passwordRecovery";
import { pushHubSpotNote } from "./lib/hubspotIntegration";
import { pushSalesforceNote } from "./lib/salesforceIntegration";
import { TRUST_PACK_NAV, TRUST_PACK_OPEN_EVENT, type TrustPackSlug } from "./lib/trustPack";
import { API_BASE, apiTargetLabel, PostMortemApiError, runPostMortem } from "./lib/api";
import {
  captureDemoBypassFromUrl,
  GUEST_ANALYSIS_CAP,
  getGuestUsage,
  guestCapLockMessage,
  guestNearCapMessage,
  incrementGuestUsage,
  isGuestUsageLocked,
  shouldEnforceGuestCap,
} from "./lib/guestUsage";
import {
  captureCheckoutSessionFromUrl,
  claimCheckoutSession,
  claimGuestBillingCap,
  fetchBillingMe,
  peekCheckoutSessionId,
  startCheckout,
  directCheckoutReady,
  type BillingMe,
  type CheckoutPlan,
} from "./lib/billing";
import PricingGate from "./components/PricingGate";
import MarketingHome from "./components/MarketingHome";
import MarketingShell from "./components/MarketingShell";
import { fetchFounderMe } from "./lib/founderApi";
import {
  getAppRoute,
  hasOAuthReturnParams,
  isMarketingRoute,
  navigateApp,
  type AppRoute,
} from "./lib/appRoute";
import { publishOAuthComplete, subscribeOAuthComplete } from "./lib/oauthBridge";
import {
  listPendingAnalyses,
  queuePendingAnalysis,
  removePendingAnalysis,
  assembleSessionBlob,
  clearSessionChunks,
} from "./lib/offlineRecording";
import { normalizeResult, PostMortemResult, type HistoricalCrmContextEntry, type LiveTranscriptTurn } from "./types";
import type { LiveObjection } from "./lib/liveObjections";
import { fetchLiveTriage, type LiveTriageResult } from "./lib/liveTriage";
import type { MeetingPlatformId } from "./lib/meetingPlatforms";
import { loadDemoSalesTranscript } from "./lib/demoTranscript";
import { RUN_DEAL_CTA } from "./lib/cta";
import { applyDocumentMeta, SITE_DESCRIPTION, SITE_TITLE } from "./lib/site";

const ACCEPTED_EXT = [".mp3", ".wav", ".mp4", ".m4a", ".webm", ".mpeg", ".mpga"];
const ACCEPT_ATTR = ".mp3,.wav,.mp4,.m4a,.webm,audio/*,video/mp4,video/webm";
const DOCUMENT_EXT = [".pdf", ".docx"];
const DOCUMENT_ACCEPT =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const UNIFIED_UPLOAD_ACCEPT = `${ACCEPT_ATTR},${DOCUMENT_ACCEPT}`;
const TEXT_ACCEPT = ".txt,.md,.csv,text/plain,text/markdown,text/csv";
const TEXT_MAX_BYTES = 5 * 1024 * 1024;

type InputTab = "call" | "email" | "field" | "live";

function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function isAcceptedFile(file: File): boolean {
  const ext = getExtension(file.name);
  if (ACCEPTED_EXT.includes(ext)) return true;
  if (file.type.startsWith("audio/") || file.type.startsWith("video/")) return true;
  return false;
}

function isAcceptedDocument(file: File): boolean {
  const ext = getExtension(file.name);
  if (DOCUMENT_EXT.includes(ext)) return true;
  if (
    file.type === "application/pdf" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return true;
  }
  return false;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function readTextEvidence(file: File): Promise<string> {
  const ext = getExtension(file.name);
  const supported = [".txt", ".md", ".csv"].includes(ext) || file.type.startsWith("text/");
  if (!supported) throw new Error("Use a .txt, .md, or .csv text export.");
  if (file.size > TEXT_MAX_BYTES) throw new Error("Text export exceeds 5 MB.");
  const text = (await file.text()).trim();
  if (!text) throw new Error("The uploaded text file is empty.");
  return text;
}

export default function App() {
  const auth = useAuth();
  const [opsUser, setOpsUser] = useState(false);
  const [opsChecked, setOpsChecked] = useState(false);
  const [forceProductConsole, setForceProductConsole] = useState(false);
  const [activeTab, setActiveTab] = useState<InputTab>("call");
  const [guideOpen, setGuideOpen] = useState(false);
  const [accountPortalOpen, setAccountPortalOpen] = useState(false);
  const [dealsPortalOpen, setDealsPortalOpen] = useState(false);
  const [runtimePause, setRuntimePause] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginMode, setLoginMode] = useState<"signin" | "signup">("signin");
  const [route, setRoute] = useState<AppRoute>(() =>
    typeof window === "undefined" ? "home" : getAppRoute()
  );
  const [openedDealsOnLogin, setOpenedDealsOnLogin] = useState(false);
  const [guestUsage, setGuestUsage] = useState(() => {
    captureDemoBypassFromUrl();
    return getGuestUsage();
  });
  const [billing, setBilling] = useState<BillingMe | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [stripeConfigured, setStripeConfigured] = useState(true);
  const [guideHighlight, setGuideHighlight] = useState<string | null>(null);
  const [linkedHubSpotDealId, setLinkedHubSpotDealId] = useState<string | null>(null);
  const [linkedSalesforceOppId, setLinkedSalesforceOppId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [recordingSource, setRecordingSource] = useState<"upload" | "field" | null>(null);
  const [fieldSessionId, setFieldSessionId] = useState<string | null>(null);
  const [dealValue, setDealValue] = useState("52000");
  const [accountId, setAccountId] = useState("");
  const [salesCycleDays, setSalesCycleDays] = useState("");
  const [historicalCrmJson, setHistoricalCrmJson] = useState("");
  const [historicalParseError, setHistoricalParseError] = useState<string | null>(null);
  const [liveTranscriptPayload, setLiveTranscriptPayload] = useState<LiveTranscriptTurn[]>([]);
  const [liveSessionObjections, setLiveSessionObjections] = useState<
    { text: string; status: string; source: string }[]
  >([]);
  const [liveSessionActive, setLiveSessionActive] = useState(false);
  const [liveSessionPlatform, setLiveSessionPlatform] = useState<MeetingPlatformId | null>(null);
  const [liveSessionTurns, setLiveSessionTurns] = useState<LiveTranscriptTurn[]>([]);
  const [liveSessionLiveObjections, setLiveSessionLiveObjections] = useState<LiveObjection[]>([]);
  const [liveTriage, setLiveTriage] = useState<LiveTriageResult | null>(null);
  const [liveTriageLoading, setLiveTriageLoading] = useState(false);
  const [liveTriageError, setLiveTriageError] = useState<string | null>(null);
  const [callTranscript, setCallTranscript] = useState("");
  const [emailThread, setEmailThread] = useState("");
  const [demoTranscriptLoading, setDemoTranscriptLoading] = useState(false);
  const [demoTranscriptNotice, setDemoTranscriptNotice] = useState<string | null>(null);
  const [emailImportNotice, setEmailImportNotice] = useState<string | null>(null);
  const [result, setResult] = useState<PostMortemResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relevanceBlocked, setRelevanceBlocked] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [trustPack, setTrustPack] = useState<TrustPackSlug | null>(null);

  const hasAudio = !!file;
  const hasUploadedRecording = recordingSource === "upload" && hasAudio;
  const hasDocument = !!documentFile;
  const hasCallTranscript = callTranscript.trim().length > 0;
  const hasEmail = emailThread.trim().length > 0;
  const hasFieldRecording = recordingSource === "field" && hasAudio;
  const hasCallInput = hasAudio || hasCallTranscript;
  const channelCount = [
    hasUploadedRecording,
    hasCallTranscript,
    hasEmail,
    hasFieldRecording,
    hasDocument,
  ].filter(Boolean).length;
  const hasAnyInput = hasCallInput || hasEmail || hasDocument;

  const loadingMessage = useMemo(() => {
    if (channelCount >= 2) return "Stitching cross-channel context into intelligence brief...";
    if (hasAudio) return "Transcribing audio and building intelligence brief...";
    if (hasDocument) return "Extracting document and building intelligence brief...";
    if (hasEmail) return "Parsing email thread and building intelligence brief...";
    return "Analyzing deal and building intelligence brief...";
  }, [channelCount, hasAudio, hasDocument, hasEmail]);

  const headerStatus = loading
    ? "INTELLIGENCE BRIEF IN PROGRESS..."
    : result
      ? "INTELLIGENCE BRIEF READY"
      : "STANDBY";

  const runAnalysis = useCallback(
    async (payload: {
      file?: File | null;
      document?: File | null;
      transcript: string;
      emailThread: string;
      dealValue: string;
      fieldCapture?: boolean;
      accountId?: string;
      salesCycleDays?: number;
      historicalCrmContext?: HistoricalCrmContextEntry[] | null;
      liveTranscriptPayload?: LiveTranscriptTurn[];
      liveSessionObjections?: { text: string; status: string; source: string }[];
      forceAnalysis?: boolean;
      hubspotDealId?: string;
      salesforceOpportunityId?: string;
    }) => {
      const data = await runPostMortem({
        file: payload.file,
        document: payload.document,
        transcript: payload.transcript,
        emailThread: payload.emailThread,
        dealValue: payload.dealValue,
        fieldCapture: payload.fieldCapture,
        accountId: payload.accountId,
        salesCycleDays: payload.salesCycleDays,
        historicalCrmContext: payload.historicalCrmContext ?? undefined,
        liveTranscriptPayload: payload.liveTranscriptPayload,
        liveSessionObjections: payload.liveSessionObjections,
        forceAnalysis: payload.forceAnalysis,
        hubspotDealId: payload.hubspotDealId,
        salesforceOpportunityId: payload.salesforceOpportunityId,
      });
      setResult(normalizeResult({ ...data, sources: data.sources, processed_at: data.processed_at }));
      setWarnings(data.warnings ?? []);
      setRelevanceBlocked(false);
    },
    []
  );

  useEffect(() => {
    captureDemoBypassFromUrl();
    setGuestUsage(getGuestUsage());
  }, [auth.session?.access_token]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/runtime`);
        const data = (await res.json()) as {
          analyses_paused?: boolean;
          pause_message?: string;
        };
        if (cancelled) return;
        setRuntimePause(data.analyses_paused ? data.pause_message || "Analyses are paused." : null);
      } catch {
        if (!cancelled) setRuntimePause(null);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const marketingHome = route === "home" && !auth.session;
    if (marketingHome) {
      applyDocumentMeta({ title: SITE_TITLE, description: SITE_DESCRIPTION, robots: "index" });
      return;
    }
    if (route === "login") {
      applyDocumentMeta({ title: "Log in | Lazarus Deal Recovery", robots: "noindex" });
      return;
    }
    applyDocumentMeta({ title: "Deal Recovery Portal | Lazarus Deal Recovery", robots: "noindex" });
  }, [route, auth.session]);

  const refreshBilling = useCallback(async () => {
    if (!auth.session) {
      setBilling(null);
      return;
    }
    try {
      let next = await fetchBillingMe();
      if (getGuestUsage() >= GUEST_ANALYSIS_CAP) {
        next = await claimGuestBillingCap();
      }
      setBilling(next);
    } catch {
      setBilling(null);
    }
  }, [auth.session]);

  useEffect(() => {
    void refreshBilling();
  }, [refreshBilling]);

  useEffect(() => {
    if (!auth.session) return;
    const sessionId = captureCheckoutSessionFromUrl() || peekCheckoutSessionId();
    if (!sessionId) return;
    let cancelled = false;
    void claimCheckoutSession(sessionId)
      .then((next) => {
        if (cancelled || !next) return;
        setBilling(next);
        setSyncNotice("Payment received — your analyses are unlocked.");
      })
      .catch((err) => {
        if (cancelled) return;
        setBillingError(err instanceof Error ? err.message : "Could not attach payment to this account.");
      });
    return () => {
      cancelled = true;
    };
  }, [auth.session]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const billingFlag = params.get("billing");
    captureCheckoutSessionFromUrl(window.location.search);
    if (billingFlag !== "success" && billingFlag !== "cancel") return;
    const onLogin = window.location.pathname.replace(/\/+$/, "") === "/login";
    if (billingFlag === "success") {
      if (onLogin || !auth.session) {
        setLoginMode("signup");
        return;
      }
      setSyncNotice("Payment received — your analyses are unlocked.");
      void refreshBilling();
    }
    params.delete("billing");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", next);
  }, [refreshBilling, auth.session]);

  const enforceGuestCap = shouldEnforceGuestCap({
    signedIn: !!auth.session,
    opsUser,
    email: auth.user?.email ?? null,
  });
  const guestLocked = enforceGuestCap && guestUsage >= GUEST_ANALYSIS_CAP;
  const paywalled =
    enforceGuestCap &&
    (auth.session ? (billing ? billing.payment_required : guestLocked) : guestLocked);
  const guestNearCap =
    enforceGuestCap &&
    !paywalled &&
    (auth.session
      ? billing
        ? billing.free_remaining === 1 && billing.ppu_credits === 0 && !billing.unlimited
        : guestUsage === GUEST_ANALYSIS_CAP - 1
      : guestUsage === GUEST_ANALYSIS_CAP - 1);
  const canLifecycle = !enforceGuestCap || billing?.can_lifecycle === true;

  const goTo = useCallback((path: string) => {
    navigateApp(path);
    setRoute(getAppRoute());
  }, []);

  const openLogin = useCallback((mode: "signin" | "signup" = "signin") => {
    setLoginMode(mode);
    goTo(mode === "signup" ? "/login?mode=signup" : "/login");
  }, [goTo]);

  const openSignupPortal = useCallback(() => {
    setLoginMode("signup");
    if (route === "app") {
      setLoginOpen(true);
      return;
    }
    goTo("/login");
  }, [goTo, route]);

  const openTool = useCallback(
    (opts?: { sample?: boolean; tab?: InputTab; platform?: "zoom" | "meet" | "teams" }) => {
      const params = new URLSearchParams();
      if (opts?.sample) params.set("sample", "1");
      if (opts?.tab) params.set("tab", opts.tab);
      if (opts?.platform) params.set("platform", opts.platform);
      const qs = params.toString();
      goTo(qs ? `/portal?${qs}` : "/portal");
    },
    [goTo]
  );

  const handleCheckout = useCallback(
    async (plan: CheckoutPlan) => {
      setCheckoutBusy(plan);
      setBillingError(null);
      try {
        await startCheckout(plan, {
          email: auth.user?.email,
          userId: auth.user?.id,
        });
      } catch (err) {
        setBillingError(err instanceof Error ? err.message : "Checkout failed");
        setCheckoutBusy(null);
      }
    },
    [auth.user?.email, auth.user?.id]
  );

  useEffect(() => {
    let cancelled = false;
    if (!auth.session) {
      setOpsUser(false);
      setOpsChecked(true);
      setForceProductConsole(false);
      return;
    }
    setOpsChecked(false);
    void (async () => {
      try {
        const me = await fetchFounderMe();
        if (!cancelled) {
          setOpsUser(me.ops === true);
          setOpsChecked(true);
        }
      } catch {
        if (!cancelled) {
          setOpsUser(false);
          setOpsChecked(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.session?.access_token]);

  const drainPendingQueue = useCallback(async () => {
    if (!navigator.onLine || apiOnline === false) return;
    const pending = await listPendingAnalyses();
    if (!pending.length) return;

    setSyncNotice(`Syncing ${pending.length} offline capture(s)...`);
    let failures = 0;
    for (const entry of pending) {
      try {
        let file: File | null = entry.recordingFile ?? null;
        if (entry.recordingSessionId) {
          const blob = await assembleSessionBlob(entry.recordingSessionId, "audio/webm");
          if (blob) {
            file = new File([blob], `field-sync-${entry.id}.webm`, { type: "audio/webm" });
          }
        }
        await runAnalysis({
          file,
          document: entry.documentFile ?? null,
          transcript: entry.transcript,
          emailThread: entry.emailThread,
          dealValue: entry.dealValue,
          fieldCapture: !!entry.recordingSessionId,
        });
        if (entry.recordingSessionId) {
          await clearSessionChunks(entry.recordingSessionId);
        }
        await removePendingAnalysis(entry.id);
      } catch {
        failures++;
        continue;
      }
    }
    if (failures > 0) {
      setSyncNotice(
        `${pending.length - failures} of ${pending.length} synced — ${failures} failed and will retry when online.`
      );
    } else {
      setSyncNotice(null);
    }
  }, [apiOnline, runAnalysis]);

  useEffect(() => {
    const check = () => {
      fetch(`${API_BASE}/api/health`)
        .then(async (r) => {
          setApiOnline(r.ok);
          if (!r.ok) return;
          const data = (await r.json().catch(() => ({}))) as { stripe?: boolean };
          // Only disable paid CTAs when health explicitly says Stripe is off.
          // Stay enabled while the API is cold or unreachable so the first paint
          // is not "Billing not configured".
          if (data.stripe === false) setStripeConfigured(false);
          else if (data.stripe === true) setStripeConfigured(true);
        })
        .catch(() => setApiOnline(false));
    };
    check();
    const id = setInterval(check, 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const provider = params.has("google")
      ? "google"
      : params.has("teams")
        ? "teams"
        : params.has("hubspot")
          ? "hubspot"
          : params.has("salesforce")
            ? "salesforce"
            : null;
    const outcome = provider ? params.get(provider) : null;
    const reason = params.get("reason");

    const providerLabel = (name?: string) => {
      if (name === "google") return "Gmail";
      if (name === "teams") return "Outlook";
      if (name === "hubspot") return "HubSpot";
      if (name === "salesforce") return "Salesforce";
      return "Integration";
    };

    // Google often clears window.opener (COOP). Broadcast to every Lazarus tab, then close.
    if (provider && outcome) {
      publishOAuthComplete({ provider, outcome, reason });
      window.history.replaceState({}, "", window.location.pathname || "/");
      window.setTimeout(() => {
        try {
          window.close();
        } catch {
          /* browser may block */
        }
      }, 350);
    }

    return subscribeOAuthComplete((detail) => {
      if (detail.outcome === "connected") {
        setSyncNotice(
          `${providerLabel(detail.provider)} connected. Your evidence package was preserved.`
        );
        setError(null);
      } else if (detail.outcome === "error") {
        setError(
          `${providerLabel(detail.provider)} connection failed${detail.reason ? ` (${detail.reason})` : ""}.`
        );
      }
    });
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      setTrustPack((e as CustomEvent<TrustPackSlug>).detail);
    };
    window.addEventListener(TRUST_PACK_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(TRUST_PACK_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(getAppRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "signup") setLoginMode("signup");
    if (params.get("mode") === "signin") setLoginMode("signin");
  }, [route]);

  useEffect(() => {
    if (!auth.session || auth.passwordRecovery || isPasswordRecoveryPending()) return;
    if (hasOAuthReturnParams()) return;
    if (route === "home" || route === "login") {
      goTo("/portal");
    }
    if (!openedDealsOnLogin) {
      setDealsPortalOpen(true);
      setOpenedDealsOnLogin(true);
    }
  }, [auth.session, auth.passwordRecovery, route, goTo, openedDealsOnLogin]);

  useEffect(() => {
    const onOnline = () => {
      drainPendingQueue();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [drainPendingQueue]);

  const handleFieldRecordingReady = useCallback((f: File, sessionId: string) => {
    setFile(f);
    setFieldSessionId(sessionId);
    setRecordingSource("field");
    setError(null);
    setRelevanceBlocked(false);
  }, []);

  const handleFile = useCallback((f: File | undefined) => {
    if (!f) return;
    if (!isAcceptedFile(f)) {
      setError("Unsupported file type. Use .mp3, .wav, .mp4, or .m4a.");
      setRelevanceBlocked(false);
      return;
    }
    setError(null);
    setRelevanceBlocked(false);
    setFile(f);
    setRecordingSource("upload");
    setActiveTab("call");
  }, []);

  const handleDocument = useCallback((f: File | undefined) => {
    if (!f) return;
    if (!isAcceptedDocument(f)) {
      setError("Unsupported document type. Use .pdf or .docx.");
      setRelevanceBlocked(false);
      return;
    }
    if (f.size > DOCUMENT_MAX_BYTES) {
      setError("Document exceeds 10 MB limit.");
      setRelevanceBlocked(false);
      return;
    }
    setError(null);
    setRelevanceBlocked(false);
    setDocumentFile(f);
    setActiveTab("call");
  }, []);

  const handleEvidenceUpload = useCallback(
    (f: File | undefined) => {
      if (!f) return;
      if (isAcceptedDocument(f)) {
        handleDocument(f);
        return;
      }
      if (isAcceptedFile(f)) {
        handleFile(f);
        return;
      }
      setError("Unsupported file. Use .pdf, .docx, .mp3, .wav, .mp4, or .m4a.");
    },
    [handleDocument, handleFile]
  );

  const handleTextEvidence = useCallback(
    async (f: File | undefined) => {
      if (!f) return;
      try {
        const text = await readTextEvidence(f);
        const separator = `\n\n--- ${f.name} ---\n\n`;
        setCallTranscript((previous) => (previous.trim() ? `${previous}${separator}${text}` : text));
        setDemoTranscriptNotice(`Added transcript file: ${f.name}`);
        setActiveTab("call");
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not read text evidence.");
      }
    },
    []
  );

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      handleEvidenceUpload(e.dataTransfer.files[0]);
    },
    [handleEvidenceUpload]
  );

  const handleLoadDemoTranscript = async () => {
    setDemoTranscriptLoading(true);
    setDemoTranscriptNotice(null);
    setError(null);
    setRelevanceBlocked(false);
    try {
      const { text, source } = await loadDemoSalesTranscript();
      setCallTranscript((previous) =>
        previous.trim() ? `${previous}\n\n--- SAMPLE TRANSCRIPT ---\n\n${text}` : text
      );
      setActiveTab("call");
      const sourceLabel =
        source === "s3-primary"
          ? "primary S3"
          : source === "s3-fallback"
            ? "fallback S3"
            : source === "local"
              ? "local demo asset"
              : "embedded fail-safe";
      setDemoTranscriptNotice(`Demo sales transcript loaded (${sourceLabel}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load demo sales transcript.");
    } finally {
      setDemoTranscriptLoading(false);
    }
  };

  useEffect(() => {
    if (route !== "app") return;
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab === "call" || tab === "email" || tab === "field" || tab === "live") {
      setActiveTab(tab);
    }
    if (params.get("sample") !== "1") return;
    void handleLoadDemoTranscript();
    params.delete("sample");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
    window.history.replaceState({}, "", next);
  }, [route]);

  const handleRun = async (forceAnalysis = false) => {
    if (!hasAnyInput) {
      setError(
        "Add one or more evidence sources. Every recording, transcript, email thread, and document is analyzed together."
      );
      setRelevanceBlocked(false);
      return;
    }

    if (
      shouldEnforceGuestCap({
        signedIn: !!auth.session,
        opsUser,
        email: auth.user?.email ?? null,
      }) &&
      (auth.session ? billing?.payment_required === true : isGuestUsageLocked())
    ) {
      setError(guestCapLockMessage(!!auth.session));
      if (!auth.session) openSignupPortal();
      return;
    }

    const historicalCrmContext = parseHistoricalCrmJson(historicalCrmJson);
    if (historicalCrmJson.trim() && historicalCrmContext === null) {
      setError("Historical CRM context must be valid JSON array.");
      setRelevanceBlocked(false);
      return;
    }

    const cycleDaysRaw = parseInt(salesCycleDays, 10);
    const salesCycleDaysNum =
      Number.isFinite(cycleDaysRaw) && cycleDaysRaw > 0 ? cycleDaysRaw : undefined;

    const offline = !navigator.onLine || apiOnline === false;

    if (offline) {
      await queuePendingAnalysis({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        dealValue,
        transcript: callTranscript,
        emailThread,
        recordingFile: recordingSource === "upload" ? file ?? undefined : undefined,
        documentFile: documentFile ?? undefined,
        recordingSessionId: fieldSessionId ?? undefined,
      });
      // Clear all input state so the user cannot double-submit and badges reset
      setFile(null);
      setCallTranscript("");
      setEmailThread("");
      setDocumentFile(null);
      setFieldSessionId(null);
      setRecordingSource(null);
      setSyncNotice("Analysis queued — will auto-sync when connection restores.");
      return;
    }

    setLoading(true);
    setError(null);
    setWarnings([]);
    if (!forceAnalysis) setRelevanceBlocked(false);

    try {
      await runAnalysis({
        file,
        document: documentFile,
        transcript: callTranscript,
        emailThread,
        dealValue,
        fieldCapture: recordingSource === "field",
        accountId: accountId.trim() || undefined,
        salesCycleDays: salesCycleDaysNum,
        historicalCrmContext,
        liveTranscriptPayload: liveTranscriptPayload.length ? liveTranscriptPayload : undefined,
        liveSessionObjections: liveSessionObjections.length ? liveSessionObjections : undefined,
        forceAnalysis,
        hubspotDealId: linkedHubSpotDealId ?? undefined,
        salesforceOpportunityId: linkedSalesforceOppId ?? undefined,
      });
      if (
        shouldEnforceGuestCap({
          signedIn: !!auth.session,
          opsUser,
          email: auth.user?.email ?? null,
        })
      ) {
        if (!auth.session) {
          const next = incrementGuestUsage();
          setGuestUsage(next);
        } else {
          await refreshBilling();
          setSyncNotice(
            canLifecycle
              ? "Saved to your account — open My deals for timeline & CRM lifecycle."
              : "Saved to your account. Deal lifecycle is on Entry ($99/mo) and Team ($499/mo)."
          );
        }
      } else if (auth.session) {
        setSyncNotice(
          canLifecycle
            ? "Saved to your account — open My deals for timeline & CRM lifecycle."
            : "Saved to your account. Deal lifecycle is on Entry ($99/mo) and Team ($499/mo)."
        );
      }
      if (fieldSessionId) {
        await clearSessionChunks(fieldSessionId);
        setFieldSessionId(null);
      }
    } catch (err) {
      if (err instanceof PostMortemApiError && err.code === "NOT_SALES_EVIDENCE") {
        setError(err.message);
        setRelevanceBlocked(true);
      } else if (
        err instanceof PostMortemApiError &&
        (err.code === "GUEST_USAGE_LIMIT" || err.code === "PAYMENT_REQUIRED")
      ) {
        setError(err.message);
        if (!auth.session) openSignupPortal();
        void refreshBilling();
      } else if (err instanceof TypeError) {
        setRelevanceBlocked(false);
        setError(
          API_BASE
                        ? `Cannot reach API (${apiTargetLabel()}). Check VITE_API_URL and CORS.`
            : "Cannot reach API server. Run npm run dev and try again."
        );
      } else {
        setRelevanceBlocked(false);
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  };

  const tabs: { id: InputTab; label: string; dot?: boolean }[] = [
    { id: "call", label: "Upload", dot: hasCallInput },
    { id: "live", label: "Live", dot: liveSessionActive },
    { id: "email", label: "Mailbox", dot: hasEmail },
    { id: "field", label: "Field", dot: hasFieldRecording },
  ];

  const handleLiveSessionUpdate = useCallback(
    (snapshot: {
      active: boolean;
      platform: MeetingPlatformId | null;
      turns: LiveTranscriptTurn[];
      objections: LiveObjection[];
    }) => {
      setLiveSessionActive(snapshot.active);
      setLiveSessionPlatform(snapshot.platform);
      setLiveSessionTurns(snapshot.turns);
      setLiveSessionLiveObjections(snapshot.objections);
      if (!snapshot.active) {
        setLiveTriage(null);
        setLiveTriageError(null);
      }
    },
    []
  );

  const refreshLiveTriage = useCallback(async () => {
    const transcript = liveSessionTurns
      .map((t) => {
        const ts = t.timestamp ? `[${t.timestamp}] ` : "";
        return `${ts}${t.speaker}: ${t.dialogue}`;
      })
      .join("\n")
      .trim();
    if (!transcript || apiOnline === false) return;
    setLiveTriageLoading(true);
    setLiveTriageError(null);
    try {
      const next = await fetchLiveTriage({
        transcript,
        platform: liveSessionPlatform,
        dealValue,
        objections: liveSessionLiveObjections,
      });
      setLiveTriage(next);
    } catch (e) {
      setLiveTriageError(e instanceof Error ? e.message : "Live triage failed");
    } finally {
      setLiveTriageLoading(false);
    }
  }, [liveSessionTurns, liveSessionPlatform, liveSessionLiveObjections, dealValue, apiOnline]);

  useEffect(() => {
    if (!liveSessionActive || liveSessionTurns.length < 2 || apiOnline === false) return;
    const id = window.setInterval(() => {
      void refreshLiveTriage();
    }, 28000);
    return () => window.clearInterval(id);
  }, [liveSessionActive, liveSessionTurns.length, apiOnline, refreshLiveTriage]);

  const handleLiveSessionEnd = useCallback(
    (
      turns: LiveTranscriptTurn[],
      formattedTranscript: string,
      objections: LiveObjection[]
    ) => {
      if (!turns.length && !formattedTranscript.trim()) return;

      if (turns.length) {
        setLiveTranscriptPayload(turns);
      }
      if (objections.length) {
        setLiveSessionObjections(
          objections.map((o) => ({
            text: o.text,
            status: o.status,
            source: o.source,
          }))
        );
      }

      const text = formattedTranscript.trim();
      if (text) {
        setCallTranscript((prev) =>
          prev.trim() ? `${prev}\n\n--- LIVE SESSION ---\n${text}` : text
        );
      }
      setActiveTab("call");
      setError(null);
    },
    []
  );

  useEffect(() => {
    if (!guideHighlight) {
      document.querySelectorAll(".guide-target-active").forEach((el) => {
        el.classList.remove("guide-target-active");
      });
      return;
    }
    document.querySelectorAll(".guide-target-active").forEach((el) => {
      el.classList.remove("guide-target-active");
    });
    document.querySelectorAll(`[data-guide-target="${guideHighlight}"]`).forEach((el) => {
      el.classList.add("guide-target-active");
    });
  }, [guideHighlight]);

  const showSite = isMarketingRoute(route) && !auth.session && !auth.loading;
  const showLoginPage = route === "login" && !auth.session;

  return (
    <div className={`app${guideHighlight ? ` guide-highlighting` : ""}`}>
      {runtimePause && (
        <div className="warning-banner ops-runtime-banner" role="status">
          <p>{runtimePause}</p>
        </div>
      )}
      {trustPack && <TrustPackModal slug={trustPack} onClose={() => setTrustPack(null)} />}
      {auth.session && (auth.passwordRecovery || isPasswordRecoveryPending()) ? (
        <PasswordRecoveryScreen />
      ) : auth.loading && (isMarketingRoute(route) || route === "login") ? (
        <div className="login-screen">
          <p className="login-sub">Loading…</p>
        </div>
      ) : auth.session && !opsChecked ? (
        <div className="login-screen">
          <p className="login-sub">Loading…</p>
        </div>
      ) : auth.session && opsUser && !forceProductConsole ? (
        <FounderCommandCenter
          opsEmail={auth.user?.email ?? null}
          onOpenProduct={() => {
            setForceProductConsole(true);
            goTo("/portal");
          }}
        />
      ) : showLoginPage ? (
        <LoginScreen
          initialMode={loginMode}
          onClose={() => goTo("/")}
          onContinueGuest={() => goTo("/portal")}
        />
      ) : showSite ? (
        <MarketingShell
          onHome={() => goTo("/")}
          onPortal={() => openTool()}
          onLogin={() => openLogin("signin")}
        >
          <MarketingHome
            onSignup={() => openLogin("signup")}
            onPortal={() => openTool()}
            onCheckout={(plan) => void handleCheckout(plan)}
            stripeConfigured={directCheckoutReady() || stripeConfigured}
            checkoutBusy={checkoutBusy}
            checkoutError={billingError}
          />
        </MarketingShell>
      ) : (
        <>
      <header className="header">
        <button type="button" className="header-brand" onClick={() => goTo(auth.session ? "/portal" : "/")}>
          <img src="/logo.png" alt="Lazarus Deal Recovery" className="header-logo" />
          <div className="header-brand-copy">
            <span className="header-product-name">Lazarus Deal Recovery</span>
            <span className="tag">Forecast &amp; Deal Recovery</span>
          </div>
        </button>
        <div className="header-right">
          <span className="header-status" aria-live="polite">
            {headerStatus}
            {apiOnline === false &&
              (API_BASE
                ? ` · API OFFLINE (${apiTargetLabel()})`
                : " · API OFFLINE — run npm run dev")}
            {apiOnline === true && API_BASE && ` · API: ${apiTargetLabel()}`}
          </span>
          {opsUser && (
            <button
              type="button"
              className="btn-primary header-ops-underhood"
              onClick={() => setForceProductConsole(false)}
              title="Open Founder Ops — system health, issues, user lookup, under the hood"
            >
              Under the hood
            </button>
          )}
          {auth.configured && !auth.session && !auth.loading && (
            <div className="header-auth-links">
              <button
                type="button"
                className="btn-secondary header-auth-login"
                onClick={() => {
                  setLoginMode("signin");
                  setLoginOpen(true);
                }}
              >
                Log In
              </button>
              <button
                type="button"
                className="btn-primary header-auth-signup"
                onClick={() => {
                  setLoginMode("signup");
                  setLoginOpen(true);
                }}
              >
                Sign Up
              </button>
            </div>
          )}
          {auth.session && (
            <>
              <button
                type="button"
                className="btn-secondary header-ops-underhood"
                onClick={() => setDealsPortalOpen(false)}
                title="Start a new deal analysis"
              >
                New analysis
              </button>
              <button
                type="button"
                className="btn-primary header-ops-underhood"
                onClick={() => setDealsPortalOpen(true)}
                title={
                  canLifecycle
                    ? "Saved runs, CRM hooks, and deal lifecycle"
                    : "Deal lifecycle is on Entry and Team plans"
                }
              >
                My deals
              </button>
              <button
                type="button"
                className="btn-secondary header-logout"
                onClick={() => setAccountPortalOpen(true)}
              >
                Account
              </button>
            </>
          )}
        </div>
      </header>

      <div className="app-main">
        <div className="workspace">
          <section className="panel panel-left intake-viewport">
            <IntakeHowTo
              hasInput={hasAnyInput}
              hasResult={!!result}
              loading={loading}
              sourceCount={channelCount}
              demoLoading={demoTranscriptLoading}
              onLoadDemo={handleLoadDemoTranscript}
              onOpenGuide={() => setGuideOpen(true)}
            />

            <div className="intake-run-cta" aria-label="Primary analysis action">
              <button
                className="run-button run-button-above-fold"
                data-guide-target="guide-run-analysis"
                onClick={() => void handleRun(false)}
                disabled={loading || paywalled}
              >
                {loading
                  ? "Analyzing…"
                  : paywalled
                    ? "Payment required"
                    : `${RUN_DEAL_CTA}${channelCount ? ` (${channelCount})` : ""}`}
              </button>

              {enforceGuestCap && !paywalled && (
                <p className="guest-usage-meta">
                  {auth.session && billing
                    ? billing.analyses_remaining_label
                    : `Free analyses: ${Math.max(0, GUEST_ANALYSIS_CAP - guestUsage)} of ${GUEST_ANALYSIS_CAP} left`}
                  {!auth.session && " · Sign up to save results"}
                </p>
              )}

              {guestNearCap && (
                <div className="warning-banner guest-usage-banner">
                  <p>{guestNearCapMessage()}</p>
                  {!auth.session && (
                    <button type="button" className="btn-secondary" onClick={openSignupPortal}>
                      Sign up
                    </button>
                  )}
                </div>
              )}

              {paywalled && (
                <PricingGate
                  signedIn={!!auth.session}
                  configured={
                    directCheckoutReady() ||
                    (auth.session ? billing?.configured !== false : stripeConfigured)
                  }
                  pastDue={billing?.past_due === true}
                  message={guestCapLockMessage(!!auth.session)}
                  busy={checkoutBusy}
                  error={billingError}
                  onSignIn={openSignupPortal}
                  onCheckout={(plan) => void handleCheckout(plan)}
                  checkoutContext={{
                    email: auth.user?.email,
                    userId: auth.user?.id,
                  }}
                />
              )}
            </div>

            <DealProfilePanel
              accountId={accountId}
              salesCycleDays={salesCycleDays}
              historicalJson={historicalCrmJson}
              onAccountIdChange={setAccountId}
              onSalesCycleDaysChange={setSalesCycleDays}
              onHistoricalJsonChange={setHistoricalCrmJson}
              onParseError={setHistoricalParseError}
              onCrmNotice={(message) => {
                setSyncNotice(message);
                setError(null);
              }}
              onCrmError={(message) => {
                setError(message);
              }}
              onLinkedHubSpotDeal={setLinkedHubSpotDealId}
              onLinkedSalesforceOpp={setLinkedSalesforceOppId}
            />

            <div className="console-tabs" role="tablist" aria-label="Additive evidence channels">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={`console-tab${activeTab === tab.id ? " console-tab-active" : ""}`}
                  data-guide-target={
                    tab.id === "call"
                      ? "guide-upload-tab"
                      : tab.id === "live"
                        ? "guide-live-tab"
                        : undefined
                  }
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                  {tab.dot && <span className="console-tab-dot" aria-label="Has content" />}
                </button>
              ))}
            </div>

            <div className="console-tab-panel" role="tabpanel">
              {activeTab === "call" && (
                <div className="console-tab-audio">
                  <p className="console-tab-hint">
                    Drop a Word doc, PDF, or call recording here. Add a transcript below if you have
                    one.
                  </p>
                  <div
                    className={`dropzone dropzone-tab dropzone-unified ${dragOver ? "drag-over" : ""} ${hasUploadedRecording || hasDocument ? "has-file" : ""}`}
                  >
                    <input
                      id="evidence-upload"
                      className="dropzone-file-input"
                      type="file"
                      accept={UNIFIED_UPLOAD_ACCEPT}
                      onDragEnter={onDragEnter}
                      onDragOver={onDragOver}
                      onDragLeave={onDragLeave}
                      onDrop={onDrop}
                      onChange={(e) => {
                        handleEvidenceUpload(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                    <div className="dropzone-content">
                      <span className="dropzone-icon">
                        {hasUploadedRecording || hasDocument ? "✓" : "⬆"}
                      </span>
                      <span className="dropzone-text">
                        {hasUploadedRecording || hasDocument
                          ? "File attached — drop another to add or replace"
                          : "Upload Word, PDF, or call recording"}
                      </span>
                      <span className="dropzone-hint">
                        .docx · .pdf · .mp3 · .wav · .mp4 · max 10 MB for documents
                      </span>
                    </div>
                  </div>
                  {(hasUploadedRecording || hasDocument) && (
                    <ul className="upload-attachment-list" aria-label="Attached files">
                      {hasDocument && documentFile && (
                        <li>
                          <div>
                            <strong>Document</strong>
                            <span>
                              {documentFile.name} · {formatFileSize(documentFile.size)}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="file-clear-btn"
                            onClick={() => setDocumentFile(null)}
                          >
                            Remove
                          </button>
                        </li>
                      )}
                      {hasUploadedRecording && file && (
                        <li>
                          <div>
                            <strong>Recording</strong>
                            <span>
                              {file.name} · {formatFileSize(file.size)}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="file-clear-btn"
                            onClick={() => {
                              setFile(null);
                              setRecordingSource(null);
                            }}
                          >
                            Remove
                          </button>
                        </li>
                      )}
                    </ul>
                  )}
                  <div className="input-group" style={{ marginTop: "1rem" }}>
                    <label htmlFor="deal-value">Estimated Deal Value ($)</label>
                    <input
                      id="deal-value"
                      type="number"
                      min="0"
                      value={dealValue}
                      onChange={(e) => setDealValue(e.target.value)}
                      placeholder="52000"
                    />
                  </div>
                  <div className="input-group input-group-grow">
                    <div className="input-label-row">
                      <label htmlFor="call-transcript">Call Transcript</label>
                      <div className="input-label-actions">
                        <label className="btn-secondary text-upload-control">
                          Upload text
                          <input
                            type="file"
                            accept={TEXT_ACCEPT}
                            onChange={(e) => {
                              void handleTextEvidence(e.target.files?.[0]);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                    </div>
                    <textarea
                      id="call-transcript"
                      className="transcript-textarea"
                      value={callTranscript}
                      onChange={(e) => {
                        setCallTranscript(e.target.value);
                        setRelevanceBlocked(false);
                      }}
                      placeholder="Paste call transcript or meeting notes..."
                    />
                    {demoTranscriptNotice && (
                      <p className="demo-transcript-notice">{demoTranscriptNotice}</p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "email" && (
                <div className="console-tab-transcript">
                  <EmailProviderControls
                    onImportThread={(thread, notice) => {
                      setEmailThread((previous) =>
                        previous.trim()
                          ? `${previous}\n\n--- IMPORTED EMAILS ---\n\n${thread}`
                          : thread
                      );
                      setEmailImportNotice(notice);
                      setError(null);
                      setRelevanceBlocked(false);
                    }}
                    onError={(message) => {
                      setError(message);
                      setEmailImportNotice(null);
                    }}
                    hasEmailEvidence={hasEmail}
                    onClearEmailEvidence={() => {
                      setEmailThread("");
                      setEmailImportNotice(null);
                    }}
                  />
                  {emailImportNotice && (
                    <p className="demo-transcript-notice">{emailImportNotice}</p>
                  )}
                </div>
              )}

              {activeTab === "live" && (
                <MeetingCompanion
                  dealValue={dealValue}
                  apiOnline={apiOnline}
                  onLiveUpdate={handleLiveSessionUpdate}
                  onEndSession={handleLiveSessionEnd}
                />
              )}

              {activeTab === "field" && (
                <FieldRecorder
                  hasRecording={hasFieldRecording}
                  onRecordingReady={handleFieldRecordingReady}
                  onClear={() => {
                    if (recordingSource === "field") {
                      if (fieldSessionId) clearSessionChunks(fieldSessionId);
                      setFile(null);
                      setRecordingSource(null);
                      setFieldSessionId(null);
                    }
                  }}
                />
              )}
            </div>

            {hasAnyInput && (
              <div className="input-badges">
                {hasAudio && recordingSource === "upload" && (
                  <span className="input-badge input-badge-audio">Call recording loaded</span>
                )}
                {hasCallTranscript && (
                  <span className="input-badge input-badge-text">Call transcript attached</span>
                )}
                {hasEmail && (
                  <span className="input-badge input-badge-email">
                    Connected mailbox thread attached
                  </span>
                )}
                {hasDocument && (
                  <span className="input-badge input-badge-text">PDF/DOCX attached</span>
                )}
                {hasFieldRecording && (
                  <span className="input-badge input-badge-field">Field capture attached</span>
                )}
                {channelCount >= 2 && (
                  <span className="input-badge input-badge-merge">
                    All {channelCount} sources analyze together
                  </span>
                )}
                {liveTranscriptPayload.length > 0 && (
                  <span className="input-badge input-badge-text">
                    Live session ({liveTranscriptPayload.length} turns)
                  </span>
                )}
                {liveSessionObjections.length > 0 && (
                  <span className="input-badge input-badge-email">
                    {liveSessionObjections.length} live objection(s)
                  </span>
                )}
              </div>
            )}

            <p className="upload-consent">
              Only upload content you’re authorized to use.{" "}
              {TRUST_PACK_NAV.filter((l) => l.slug === "terms" || l.slug === "privacy").map(
                ({ slug, label }, i) => (
                  <span key={slug}>
                    {i > 0 && " · "}
                    <TrustPackLink slug={slug}>{label}</TrustPackLink>
                  </span>
                )
              )}
            </p>

            {syncNotice && <div className="warning-banner"><p>{syncNotice}</p></div>}

            {warnings.length > 0 && (
              <div className="warning-banner">
                {warnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </div>
            )}

            {error && (
              <div className="error-banner">
                <p>{error}</p>
                {relevanceBlocked && (
                  <button
                    type="button"
                    className="btn-secondary relevance-override-btn"
                    onClick={() => void handleRun(true)}
                    disabled={loading || paywalled}
                  >
                    Analyze anyway
                  </button>
                )}
              </div>
            )}
            {historicalParseError && !error && (
              <div className="error-banner">{historicalParseError}</div>
            )}
          </section>

          <section className="panel panel-right">
            <div className={`panel-label ${result ? "report-panel-label" : ""}`}>
              Deal Score &amp; Recovery Brief
            </div>

            {loading ? (
              <div className="loading-overlay">
                <div className="spinner" />
                <span>{loadingMessage}</span>
              </div>
            ) : liveSessionActive ? (
              <LiveTriageBrief
                active={liveSessionActive}
                platform={liveSessionPlatform}
                turns={liveSessionTurns}
                objections={liveSessionLiveObjections}
                triage={liveTriage}
                triageLoading={liveTriageLoading}
                triageError={liveTriageError}
                onRefresh={() => void refreshLiveTriage()}
              />
            ) : result ? (
              <AnalysisReport
                result={result}
                sources={result.sources}
                linkedHubSpotDealId={linkedHubSpotDealId}
                linkedSalesforceOppId={linkedSalesforceOppId}
                onPushHubSpot={async (dealId, noteBody) => {
                  await pushHubSpotNote(dealId, noteBody, result.id);
                }}
                onPushSalesforce={async (oppId, noteBody) => {
                  await pushSalesforceNote(oppId, noteBody, result.id);
                }}
              />
            ) : (
              <LiveTriageBrief
                active={false}
                platform={null}
                turns={[]}
                objections={[]}
                triage={null}
                triageLoading={false}
                triageError={null}
                onRefresh={() => undefined}
              />
            )}
          </section>
        </div>
      </div>

      <SiteFooter />

      <LazarusGuide
        open={guideOpen}
        onClose={() => {
          setGuideOpen(false);
          setGuideHighlight(null);
        }}
        onHighlightTarget={setGuideHighlight}
        onSelectTab={setActiveTab}
      />

      <AccountPortal open={accountPortalOpen} onClose={() => setAccountPortalOpen(false)} />
      <DealLifecyclePanel
        open={dealsPortalOpen}
        locked={!canLifecycle}
        billingConfigured={directCheckoutReady() || billing?.configured !== false}
        checkoutBusy={checkoutBusy}
        onClose={() => setDealsPortalOpen(false)}
        onCheckout={(plan) => void handleCheckout(plan)}
        onOpenRun={({ analysis, hubspotDealId, salesforceOppId }) => {
          setResult(
            normalizeResult({
              ...(analysis as PostMortemResult),
              id: String(analysis.id ?? ""),
            })
          );
          if (hubspotDealId) setLinkedHubSpotDealId(hubspotDealId);
          if (salesforceOppId) setLinkedSalesforceOppId(salesforceOppId);
          setError(null);
          setSyncNotice("Opened a saved run from your account.");
          setLiveSessionActive(false);
        }}
      />
      {loginOpen && (
        <LoginScreen
          initialMode={loginMode}
          onClose={() => setLoginOpen(false)}
          onContinueGuest={() => setLoginOpen(false)}
        />
      )}
        </>
      )}
    </div>
  );
}
