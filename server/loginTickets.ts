import crypto from "crypto";

export type LoginTicketProvider = "google" | "hubspot" | "salesforce";

export type LoginCodeSession = {
  userId: string;
  email: string;
  provider: LoginTicketProvider;
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

type Ticket = LoginCodeSession & { exp: number };

const tickets = new Map<string, Ticket>();
const recentlyConsumed = new Map<string, { session: LoginCodeSession; exp: number }>();
const TTL_MS = 5 * 60 * 1000;
/** Popup + opener can both exchange the same code after Google clears window.opener. */
const REPLAY_MS = 20_000;

function prune(): void {
  const now = Date.now();
  for (const [id, ticket] of tickets) {
    if (ticket.exp <= now) tickets.delete(id);
  }
  for (const [id, replay] of recentlyConsumed) {
    if (replay.exp <= now) recentlyConsumed.delete(id);
  }
}

/** One-time, user-bound code issued from the OAuth callback. */
export function issueLoginCode(session: LoginCodeSession): string {
  prune();
  const id = crypto.randomBytes(32).toString("hex");
  tickets.set(id, { ...session, exp: Date.now() + TTL_MS });
  return id;
}

export function consumeLoginCode(id: string | undefined): LoginCodeSession | null {
  prune();
  const key = String(id ?? "").trim();
  if (!key) return null;
  const replay = recentlyConsumed.get(key);
  if (replay) return replay.session;
  const ticket = tickets.get(key);
  if (!ticket) return null;
  tickets.delete(key);
  if (!ticket.userId || !ticket.access_token) return null;
  const { exp: _exp, ...session } = ticket;
  recentlyConsumed.set(key, { session, exp: Date.now() + REPLAY_MS });
  return session;
}
