import type { Express, Request } from "express";
import { preCallBrief } from "../src/qualifier/brief.js";
import { isOpenSlot } from "../src/qualifier/slots.js";
import { readCompanyProfile } from "./companyProfile.js";
import { clientIp } from "./rateLimit.js";

const LIMIT = 6;
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

function lines(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, max);
}

/**
 * Morning-booking handoff for the off-hours widget.
 * Forwards a summary to OFF_HOURS_WEBHOOK_URL (Make.com or n8n) when that URL is set.
 * Does not run the deal engine and does not attach a transcript.
 */
export function registerOffHoursLeadRoutes(app: Express): void {
  app.post("/api/off-hours/lead", async (req, res) => {
    try {
      if (limited(req)) {
        res.status(429).json({ error: "Too many bookings. Wait a bit and try again." });
        return;
      }
      if (String(req.body?.company_website ?? "").trim()) {
        res.json({ ok: true, forwarded: false });
        return;
      }

      const email = String(req.body?.email ?? "").trim().toLowerCase();
      const name = String(req.body?.name ?? "").trim().slice(0, 120);
      const company = String(req.body?.company ?? "").trim().slice(0, 160);
      const slotIso = String(req.body?.slot_iso ?? "").trim();
      const slotLabel = String(req.body?.slot_label ?? "").trim().slice(0, 80);
      const view = req.body?.view === "walkthrough" ? "walkthrough" : "results";
      const when = new Date(slotIso);

      if (!validEmail(email)) {
        res.status(400).json({ error: "Enter a valid work email." });
        return;
      }
      if (Number.isNaN(when.getTime()) || !isOpenSlot(when) || when.getTime() < Date.now() - 5 * 60 * 1000) {
        res.status(400).json({
          error: "Pick a weekday morning. Saturday and Sunday are closed.",
        });
        return;
      }

      const accountName = String(req.body?.account_name ?? "").trim().slice(0, 160);
      const acvPlain = String(req.body?.acv_plain ?? "").trim().slice(0, 40);
      const verdict = String(req.body?.verdict ?? "").trim().slice(0, 80);
      const blocker = String(req.body?.blocker ?? "").trim().slice(0, 500);
      const lookedUp = await readCompanyProfile(String(req.body?.company_url ?? ""));
      const briefing = preCallBrief({
        domain: lookedUp.domain,
        profile: lookedUp.profile,
        account: accountName,
        acv: acvPlain,
        owner: name,
        forecastLabel: String(req.body?.forecast_label ?? "").trim().slice(0, 80),
        slotLabel,
        verdict,
        blocker,
      }).slice(0, 2000);

      const payload = {
        source: "off-hours",
        name,
        email,
        company,
        slot_iso: when.toISOString(),
        slot_label: slotLabel,
        view,
        verdict,
        risk: req.body?.risk == null ? null : Number(req.body.risk),
        blocker,
        quote: String(req.body?.quote ?? "").trim().slice(0, 500),
        this_week: lines(req.body?.this_week, 6),
        fit: String(req.body?.fit ?? "").trim().slice(0, 800),
        account_name: accountName,
        acv_plain: acvPlain,
        company_url: lookedUp.domain,
        company_profile: lookedUp.profile,
        briefing,
        transcript_attached: false,
      };

      const webhook = (process.env.OFF_HOURS_WEBHOOK_URL ?? "").trim();
      let forwarded = false;
      if (webhook.startsWith("https://")) {
        try {
          const sent = await fetch(webhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(8_000),
          });
          forwarded = sent.ok;
          if (!sent.ok) console.error("[off-hours] webhook", sent.status);
        } catch (err) {
          console.error("[off-hours] webhook", err instanceof Error ? err.message : err);
        }
      }

      res.json({ ok: true, forwarded, domain: lookedUp.domain, profile: lookedUp.profile });
    } catch (err) {
      console.error("[off-hours]", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Could not save that booking." });
    }
  });
}
