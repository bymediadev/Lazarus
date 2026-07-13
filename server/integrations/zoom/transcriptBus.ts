/** In-memory pub/sub for live Zoom RTMS transcript chunks → SSE clients. */

export interface LiveTranscriptChunk {
  speaker: string;
  dialogue: string;
  timestamp: string;
  source: "zoom_rtms" | "manual";
}

export interface LiveSession {
  id: string;
  platform: "zoom";
  createdAt: number;
  subscribers: Set<(chunk: LiveTranscriptChunk) => void>;
}

const sessions = new Map<string, LiveSession>();
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

function pruneStaleSessions(): void {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, session] of sessions) {
    if (session.createdAt < cutoff) sessions.delete(id);
  }
}

export function createZoomLiveSession(): string {
  pruneStaleSessions();
  const id = `zoom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  sessions.set(id, {
    id,
    platform: "zoom",
    createdAt: Date.now(),
    subscribers: new Set(),
  });
  return id;
}

export function getLiveSession(sessionId: string): LiveSession | null {
  return sessions.get(sessionId) ?? null;
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

export function publishToActiveZoomSessions(chunk: LiveTranscriptChunk): void {
  pruneStaleSessions();
  for (const session of sessions.values()) {
    for (const sub of session.subscribers) {
      sub(chunk);
    }
  }
}

export function activeZoomSessionCount(): number {
  pruneStaleSessions();
  return sessions.size;
}
