import type { Express, Request } from "express";
import { sendResendEmail } from "./founderAlerts.js";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const HOUR_MS = 60 * 60 * 1000;
const MAX_PER_HOUR = 8;
const MAX_MESSAGE = 4000;

function clientIp(req: Request): string {
  const xf = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  return xf || req.socket.remoteAddress || "unknown";
}

function isLimited(ip: string): boolean {
  const now = Date.now();
  let bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + HOUR_MS };
    buckets.set(ip, bucket);
  }
  if (bucket.count >= MAX_PER_HOUR) return true;
  bucket.count += 1;
  return false;
}

function feedbackRecipients(): string[] {
  const raw = (
    process.env.FOUNDER_ALERT_EMAILS ||
    process.env.FOUNDER_EMAILS ||
    "joshua.bennett003@gmail.com"
  ).trim();
  return [...new Set(raw.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

export function registerFeedbackRoutes(app: Express): void {
  app.post("/api/feedback", async (req, res) => {
    if (isLimited(clientIp(req))) {
      res.status(429).json({ error: "Too many messages. Try again in a bit." });
      return;
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (String(body.company_website ?? "").trim()) {
      res.json({ ok: true });
      return;
    }

    const message = String(body.message ?? "").trim();
    const email = String(body.email ?? "").trim().slice(0, 200);
    if (message.length < 8) {
      res.status(400).json({ error: "Write a little more so we can act on it." });
      return;
    }
    if (message.length > MAX_MESSAGE) {
      res.status(400).json({ error: "Keep it under 4,000 characters." });
      return;
    }

    const to = feedbackRecipients();
    const text = [
      email ? `From: ${email}` : "From: (not left)",
      `Page: ${String(body.page ?? "").trim().slice(0, 300) || "/"}`,
      "",
      message,
    ].join("\n");

    const sent = await sendResendEmail(to, "Lazarus website feedback", text);
    if (!sent.ok) {
      console.warn("[feedback]", sent.error, text.slice(0, 500));
    }

    res.json({ ok: true });
  });
}
