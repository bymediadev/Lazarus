import type { Express, Request } from "express";

export const CONTACT_TOPICS = ["feedback", "sales", "technical", "support"] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

const TOPIC_LABEL: Record<ContactTopic, string> = {
  feedback: "Feedback",
  sales: "Sales",
  technical: "Technical",
  support: "Support",
};

const CONTACT_LIMIT = 6;
const CONTACT_WINDOW_MS = 60 * 60 * 1000;
const hits = new Map<string, { count: number; resetAt: number }>();

function isContactTopic(value: unknown): value is ContactTopic {
  return CONTACT_TOPICS.includes(String(value) as ContactTopic);
}

export function isContactConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY ?? "").trim();
}

function destinationFor(topic: ContactTopic): string {
  const envKey =
    topic === "feedback"
      ? "CONTACT_EMAIL_FEEDBACK"
      : topic === "sales"
        ? "CONTACT_EMAIL_SALES"
        : topic === "technical"
          ? "CONTACT_EMAIL_TECHNICAL"
          : "CONTACT_EMAIL_SUPPORT";
  const override = (process.env[envKey] ?? "").trim();
  if (override) return override;
  if (topic === "feedback") return "joshua@getldr.ca";
  if (topic === "sales") return "sales@getldr.ca";
  return "support@getldr.ca";
}

function fromAddress(): string {
  return (
    (process.env.CONTACT_FROM ?? "").trim() ||
    (process.env.FOUNDER_ALERT_FROM ?? "").trim() ||
    "Lazarus Deal Recovery <onboarding@resend.dev>"
  );
}

function clientIp(req: Request): string {
  const xf = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  return xf || req.socket.remoteAddress || "unknown";
}

function isRateLimited(req: Request): boolean {
  const now = Date.now();
  if (hits.size > 2000) {
    for (const [key, bucket] of hits) {
      if (bucket.resetAt <= now) hits.delete(key);
    }
  }
  const ip = clientIp(req);
  let bucket = hits.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + CONTACT_WINDOW_MS };
    hits.set(ip, bucket);
  }
  if (bucket.count >= CONTACT_LIMIT) return true;
  bucket.count += 1;
  return false;
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 200;
}

export function registerContactRoutes(app: Express): void {
  app.post("/api/contact", async (req, res) => {
    try {
      if (!isContactConfigured()) {
        res.status(503).json({
          error: "Contact form is not configured yet. Email support@getldr.ca.",
        });
        return;
      }
      if (isRateLimited(req)) {
        res.status(429).json({ error: "Too many messages. Wait a bit and try again." });
        return;
      }

      const honeypot = String(req.body?.company_website ?? "").trim();
      if (honeypot) {
        res.json({ ok: true });
        return;
      }

      const topicRaw = req.body?.topic;
      if (!isContactTopic(topicRaw)) {
        res.status(400).json({ error: "Choose feedback, sales, technical, or support." });
        return;
      }
      const topic = topicRaw;
      const name = String(req.body?.name ?? "").trim().slice(0, 120);
      const email = String(req.body?.email ?? "").trim().toLowerCase();
      const message = String(req.body?.message ?? "").trim();

      if (!validEmail(email)) {
        res.status(400).json({ error: "Enter a valid work email." });
        return;
      }
      if (message.length < 10) {
        res.status(400).json({ error: "Add a bit more detail (at least 10 characters)." });
        return;
      }
      if (message.length > 4000) {
        res.status(400).json({ error: "Keep the note under 4,000 characters." });
        return;
      }

      const to = destinationFor(topic);
      const label = TOPIC_LABEL[topic];
      const who = name || email;
      const text = [
        `Topic: ${label}`,
        `From: ${who} <${email}>`,
        `Sent: ${new Date().toISOString()}`,
        "",
        message,
      ].join("\n");

      const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
      const sent = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress(),
          to: [to],
          reply_to: email,
          subject: `[${label}] Lazarus contact from ${who}`,
          text,
        }),
      });
      if (!sent.ok) {
        const body = await sent.text();
        console.error("[contact] Resend", sent.status, body.slice(0, 200));
        res.status(502).json({ error: "Could not send that note. Email support@getldr.ca." });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("[contact]", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Could not send that note." });
    }
  });
}
