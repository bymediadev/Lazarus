import type { Express, Request } from "express";
import { inviteCopy, matchKeyword, parseKeywords } from "../src/qualifier/invite.js";
import type { Arrival } from "../src/qualifier/arrival.js";
import { clientIp } from "./rateLimit.js";

const LIMIT = 30;
const WINDOW_MS = 60 * 60 * 1000;
const hits = new Map<string, { count: number; resetAt: number }>();

function limited(req: Request): boolean {
  const now = Date.now();
  const ip = clientIp(req);
  let bucket = hits.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    hits.set(ip, bucket);
  }
  if (bucket.count >= LIMIT) return true;
  bucket.count += 1;
  return false;
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 200;
}

function secretsEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function authorized(req: Request): boolean {
  const expected = (process.env.OFF_HOURS_INVITE_SECRET ?? "").trim();
  if (!expected) {
    return (process.env.NODE_ENV ?? "").trim() !== "production";
  }
  const header = String(req.headers["x-off-hours-secret"] ?? "").trim();
  const body = String(req.body?.secret ?? "").trim();
  return secretsEqual(header, expected) || secretsEqual(body, expected);
}

function channelOf(raw: string): Arrival {
  const value = raw.trim().toLowerCase();
  if (value === "linkedin" || value === "li") return "linkedin";
  if (value === "email" || value === "mail") return "email";
  return "site";
}

async function sendInviteEmail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ emailed: boolean; error?: string }> {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  if (!apiKey) return { emailed: false, error: "RESEND_API_KEY is not set." };
  const from =
    (process.env.CONTACT_FROM ?? "").trim() ||
    (process.env.FOUNDER_ALERT_FROM ?? "").trim() ||
    "Lazarus Deal Recovery <support@getldr.ca>";
  const sent = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `off-hours-invite/${input.to.toLowerCase()}/${Math.floor(Date.now() / 60_000)}`,
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!sent.ok) {
    const body = await sent.text();
    console.error("[off-hours-invite] Resend", sent.status, body.slice(0, 200));
    return { emailed: false, error: "Could not send that email." };
  }
  return { emailed: true };
}

/**
 * Keyword → qualify link.
 * Make.com / n8n: when LinkedIn or email contains a keyword, POST here.
 * Email channel sends the link with Resend. LinkedIn channel returns the reply text to post.
 */
export function registerOffHoursInviteRoutes(app: Express): void {
  app.post("/api/off-hours/invite", async (req, res) => {
    const started = Date.now();
    try {
      if (limited(req)) {
        res.status(429).json({ error: "Too many invites. Wait a bit and try again." });
        return;
      }
      if (!authorized(req)) {
        res.status(401).json({ error: "Missing or wrong invite secret." });
        return;
      }
      if (String(req.body?.company_website ?? "").trim()) {
        res.json({ ok: true, matched: false, sent: false });
        return;
      }

      const text = String(req.body?.text ?? req.body?.message ?? req.body?.keyword ?? "").trim();
      const force = String(req.body?.force ?? "").trim() === "1";
      const keywords = parseKeywords(process.env.OFF_HOURS_KEYWORDS ?? "");
      const keyword = force ? "force" : matchKeyword(text, keywords);
      if (!keyword) {
        res.json({
          ok: true,
          matched: false,
          sent: false,
          ms: Date.now() - started,
          keywords,
        });
        return;
      }

      const channel = channelOf(String(req.body?.channel ?? "email"));
      const name = String(req.body?.name ?? "").trim().slice(0, 80);
      const to = String(req.body?.to ?? req.body?.email ?? "").trim().toLowerCase();
      const copy = inviteCopy({ channel, name, keyword });

      let emailed = false;
      let emailError: string | undefined;
      if (channel === "email") {
        if (!validEmail(to)) {
          res.status(400).json({ error: "Enter a work email in to." });
          return;
        }
        const result = await sendInviteEmail({ to, subject: copy.subject, text: copy.text });
        emailed = result.emailed;
        emailError = result.error;
        if (!emailed) {
          res.status(502).json({ error: emailError || "Could not send that email." });
          return;
        }
      }

      const webhook = (process.env.OFF_HOURS_INVITE_WEBHOOK_URL ?? "").trim();
      let forwarded = false;
      if (webhook.startsWith("https://")) {
        try {
          const sent = await fetch(webhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source: "off-hours-invite",
              channel,
              keyword,
              name,
              to: channel === "email" ? to : String(req.body?.linkedin ?? "").trim().slice(0, 160),
              link: copy.link,
              reply: copy.text,
              emailed,
            }),
            signal: AbortSignal.timeout(8_000),
          });
          forwarded = sent.ok;
          if (!sent.ok) console.error("[off-hours-invite] webhook", sent.status);
        } catch (err) {
          console.error("[off-hours-invite] webhook", err instanceof Error ? err.message : err);
        }
      }

      res.json({
        ok: true,
        matched: true,
        keyword,
        channel,
        link: copy.link,
        subject: copy.subject,
        reply: copy.text,
        emailed,
        forwarded,
        ms: Date.now() - started,
      });
    } catch (err) {
      console.error("[off-hours-invite]", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Could not send that invite." });
    }
  });
}
