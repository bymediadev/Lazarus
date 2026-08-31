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
const TTL_MS = 5 * 60 * 1000;

function prune(): void {
  const now = Date.now();
  for (const [id, ticket] of tickets) {
    if (ticket.exp <= now) tickets.delete(id);
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
  const ticket = tickets.get(key);
  if (!ticket) return null;
  tickets.delete(key);
  if (!ticket.userId || !ticket.access_token) return null;
  const { exp: _exp, ...session } = ticket;
  return session;
}
