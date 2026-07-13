import crypto from "crypto";
import { getZoomConfig } from "./config.js";
import { publishToActiveZoomSessions, type LiveTranscriptChunk } from "./transcriptBus.js";

type RtmsClient = {
  onTranscriptData: (
    cb: (data: Buffer | string, size: number, timestamp: number, metadata: { userName?: string }) => void
  ) => void;
  join: (payload: unknown) => void;
  leave?: () => void;
};

type RtmsModule = {
  default: {
    Client: new () => RtmsClient;
  };
};

const activeClients = new Map<string, RtmsClient>();

function decodeTranscript(data: Buffer | string): string {
  if (typeof data === "string") return data.trim();
  return data.toString("utf8").trim();
}

function formatTimestamp(ts: number): string {
  const totalSec = Math.max(0, Math.floor(ts / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function publishChunk(speaker: string, dialogue: string, timestamp: number): void {
  const text = dialogue.trim();
  if (!text) return;
  const chunk: LiveTranscriptChunk = {
    speaker: speaker || "Speaker",
    dialogue: text,
    timestamp: formatTimestamp(timestamp),
    source: "zoom_rtms",
  };
  publishToActiveZoomSessions(chunk);
}

async function loadRtmsModule(): Promise<RtmsModule | null> {
  const cfg = getZoomConfig();
  if (!cfg?.rtmsSupported) return null;
  try {
    return (await import("@zoom/rtms")) as RtmsModule;
  } catch (err) {
    console.warn("[zoom-rtms] SDK not available:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function handleZoomRtmsStarted(payload: Record<string, unknown>): Promise<void> {
  const rtms = await loadRtmsModule();
  if (!rtms) {
    console.warn(
      "[zoom-rtms] Live transcript requires Linux (Render) — mic/paste fallback active on Windows"
    );
    return;
  }

  const streamId = String(payload.rtms_stream_id ?? payload.meeting_uuid ?? Date.now());
  const existing = activeClients.get(streamId);
  existing?.leave?.();

  const client = new rtms.default.Client();
  client.onTranscriptData((data, _size, timestamp, metadata) => {
    publishChunk(metadata?.userName ?? "Speaker", decodeTranscript(data), timestamp);
  });

  try {
    client.join(payload);
    activeClients.set(streamId, client);
    console.log("[zoom-rtms] joined stream", streamId);
  } catch (err) {
    console.error("[zoom-rtms] join failed:", err);
  }
}

export function handleZoomRtmsStopped(payload: Record<string, unknown>): void {
  const streamId = String(payload.rtms_stream_id ?? payload.meeting_uuid ?? "");
  const client = activeClients.get(streamId);
  if (client) {
    client.leave?.();
    activeClients.delete(streamId);
    console.log("[zoom-rtms] left stream", streamId);
  }
}

/** Zoom endpoint.url_validation challenge. */
export function zoomWebhookValidationResponse(
  plainToken: string,
  secret: string
): { plainToken: string; encryptedToken: string } {
  const encryptedToken = crypto.createHmac("sha256", secret).update(plainToken).digest("hex");
  return { plainToken, encryptedToken };
}

export function verifyZoomWebhookSignature(
  rawBody: string,
  signature: string | undefined,
  timestamp: string | undefined,
  secret: string
): boolean {
  if (!signature || !timestamp || !secret) return false;
  const message = `v0:${timestamp}:${rawBody}`;
  const hash = crypto.createHmac("sha256", secret).update(message).digest("hex");
  return signature === `v0=${hash}`;
}

export function rtmsPlatformNote(): string {
  const cfg = getZoomConfig();
  if (!cfg) return "Zoom OAuth not configured — add ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET.";
  if (!cfg.rtmsSupported) {
    return "Zoom RTMS live transcripts run on Render (Linux). Local Windows dev uses mic/paste fallback.";
  }
  return "Zoom RTMS ready — connect OAuth and enable RTMS in your Zoom app.";
}
