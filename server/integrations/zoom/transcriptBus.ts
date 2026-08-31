/** In-memory pub/sub for live transcript chunks → SSE clients (Zoom RTMS + Meet captions). */

import crypto from "crypto";
import { secretsEqual } from "../../cryptoSecrets.js";

export type LiveSessionPlatform = "zoom" | "meet";

export interface LiveTranscriptChunk {
  speaker: string;
  dialogue: string;
  timestamp: string;
  source: "zoom_rtms" | "meet_captions" | "manual";
}

export interface LiveSession {
  id: string;
  platform: LiveSessionPlatform;
  ownerUserId: string;
  secretHash: string;
  createdAt: number;
  subscribers: Set<(chunk: LiveTranscriptChunk) => void>;
  lastCaptionKeys: string[];
  zoomMeetingId?: string;
  zoomStreamId?: string;
}

export interface CreatedLiveSession {
  sessionId: string;
  sessionSecret: string;
}

const sessions = new Map<string, LiveSession>();
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;
const MAX_DEDUP = 24;

function pruneStaleSessions(): void {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, session] of sessions) {
    if (session.createdAt < cutoff) sessions.delete(id);
  }
}

function hashSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

function newSessionId(platform: LiveSessionPlatform): string {
  return `${platform}-${crypto.randomUUID()}`;
}

export function createLiveSession(
  platform: LiveSessionPlatform,
  ownerUserId: string
): CreatedLiveSession {
  pruneStaleSessions();
  const id = newSessionId(platform);
  const sessionSecret = crypto.randomBytes(32).toString("hex");
  sessions.set(id, {
    id,
    platform,
    ownerUserId,
    secretHash: hashSecret(sessionSecret),
    createdAt: Date.now(),
    subscribers: new Set(),
    lastCaptionKeys: [],
  });
  return { sessionId: id, sessionSecret };
}

export function createZoomLiveSession(ownerUserId: string): CreatedLiveSession {
  return createLiveSession("zoom", ownerUserId);
}

export function createMeetLiveSession(ownerUserId: string): CreatedLiveSession {
  return createLiveSession("meet", ownerUserId);
}

export function getLiveSession(sessionId: string): LiveSession | null {
  return sessions.get(sessionId) ?? null;
}

export function sessionSecretOk(session: LiveSession, secret: string): boolean {
  return secretsEqual(hashSecret(secret), session.secretHash);
}

export function subscribeLiveSession(
  sessionId: string,
  onChunk: (chunk: LiveTranscriptChunk) => void
): (() => void) | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  session.subscribers.add(onChunk);
  return () => session.subscribers.delete(onChunk);
}

function captionKey(chunk: LiveTranscriptChunk): string {
  return `${chunk.speaker}\0${chunk.dialogue}`.trim().toLowerCase();
}

/** Publish to one session. Returns false if missing or a duplicate caption. */
export function publishToSession(sessionId: string, chunk: LiveTranscriptChunk): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  const key = captionKey(chunk);
  if (session.lastCaptionKeys.includes(key)) return false;
  session.lastCaptionKeys.push(key);
  if (session.lastCaptionKeys.length > MAX_DEDUP) session.lastCaptionKeys.shift();
  for (const sub of session.subscribers) sub(chunk);
  return true;
}

/**
 * Bind an RTMS meeting/stream to exactly one Zoom live session for this owner.
 * Prefers an existing bind for the same meeting/stream; otherwise the newest unbound session.
 */
export function bindZoomRtmsToSession(
  ownerUserId: string,
  meetingId: string,
  streamId: string
): string | null {
  pruneStaleSessions();
  if (!ownerUserId) return null;
  const meeting = meetingId.trim();
  const stream = streamId.trim();
  if (!meeting && !stream) return null;

  for (const session of sessions.values()) {
    if (session.platform !== "zoom" || session.ownerUserId !== ownerUserId) continue;
    if ((stream && session.zoomStreamId === stream) || (meeting && session.zoomMeetingId === meeting)) {
      if (stream) session.zoomStreamId = stream;
      if (meeting) session.zoomMeetingId = meeting;
      return session.id;
    }
  }

  let newest: LiveSession | null = null;
  for (const session of sessions.values()) {
    if (session.platform !== "zoom" || session.ownerUserId !== ownerUserId) continue;
    if (session.zoomStreamId || session.zoomMeetingId) continue;
    if (!newest || session.createdAt > newest.createdAt) newest = session;
  }
  if (!newest) return null;
  newest.zoomMeetingId = meeting || undefined;
  newest.zoomStreamId = stream || meeting || undefined;
  return newest.id;
}

export function publishToZoomRtms(streamId: string, meetingId: string, chunk: LiveTranscriptChunk): boolean {
  const stream = streamId.trim();
  const meeting = meetingId.trim();
  for (const session of sessions.values()) {
    if (session.platform !== "zoom") continue;
    if ((stream && session.zoomStreamId === stream) || (meeting && session.zoomMeetingId === meeting)) {
      return publishToSession(session.id, chunk);
    }
  }
  return false;
}

export function unbindZoomRtms(streamId: string, meetingId: string): void {
  const stream = streamId.trim();
  const meeting = meetingId.trim();
  for (const session of sessions.values()) {
    if (session.platform !== "zoom") continue;
    if ((stream && session.zoomStreamId === stream) || (meeting && session.zoomMeetingId === meeting)) {
      session.zoomStreamId = undefined;
      session.zoomMeetingId = undefined;
    }
  }
}

export function activeZoomSessionCount(): number {
  pruneStaleSessions();
  let n = 0;
  for (const session of sessions.values()) {
    if (session.platform === "zoom") n += 1;
  }
  return n;
}
