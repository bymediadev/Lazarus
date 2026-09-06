import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { optionalAuthUserId } from "./authMiddleware.js";
import { resolveFrontendOrigin } from "./integrations/oauthShared.js";

export type WidgetHostId = "zoom" | "meet" | "teams";

type LaunchRecord = {
  userId: string;
  email: string;
  tokenHash: string | null;
  emailOtp: string | null;
  widget: WidgetHostId;
  exp: number;
};

const TTL_MS = 10 * 60 * 1000;
const tickets = new Map<string, LaunchRecord>();

function isWidget(value: unknown): value is WidgetHostId {
  return value === "zoom" || value === "meet" || value === "teams";
}

function prune(): void {
  const now = Date.now();
  for (const [id, rec] of tickets) {
    if (rec.exp <= now) tickets.delete(id);
  }
}

export function createLaunchTicket(record: Omit<LaunchRecord, "exp">): string {
  prune();
  const id = crypto.randomBytes(24).toString("hex");
  tickets.set(id, { ...record, exp: Date.now() + TTL_MS });
  return id;
}

export function consumeLaunchTicket(id: string | undefined): LaunchRecord | null {
  if (!id) return null;
  prune();
  const rec = tickets.get(id);
  if (!rec) return null;
  tickets.delete(id);
  if (rec.exp <= Date.now()) return null;
  return rec;
}

function adminAuth() {
  const url = (process.env.SUPABASE_URL ?? "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireAuthUser(
  req: Request
): Promise<{ id: string; email: string } | null> {
  const userId = await optionalAuthUserId(req);
  if (!userId) return null;
  const header = req.headers.authorization?.trim() ?? "";
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return null;
  const url = (process.env.SUPABASE_URL ?? "").trim();
  const anon = (process.env.SUPABASE_ANON_KEY ?? "").trim();
  if (!url || !anon) return null;
  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  const email = data.user?.email?.trim();
  if (error || !email || data.user?.id !== userId) return null;
  return { id: userId, email };
}

async function mintMagicProperties(email: string) {
  const admin = adminAuth();
  if (!admin) throw new Error("Widget launch requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${resolveFrontendOrigin()}/portal` },
  });
  if (link.error) throw link.error;
  const props = link.data.properties as {
    hashed_token?: string;
    email_otp?: string;
  };
  return {
    tokenHash: props.hashed_token ?? null,
    emailOtp: props.email_otp ?? null,
  };
}

export function registerWidgetLaunchRoutes(app: Express): void {
  app.post("/api/integrations/widget/launch-link", async (req: Request, res: Response) => {
    const user = await requireAuthUser(req);
    if (!user) {
      res.status(401).json({ error: "Sign in on getldr.ca first." });
      return;
    }
    const widget = req.body?.widget;
    if (!isWidget(widget)) {
      res.status(400).json({ error: "widget must be zoom, meet, or teams." });
      return;
    }
    try {
      const props = await mintMagicProperties(user.email);
      if (!props.tokenHash && !props.emailOtp) {
        res.status(500).json({ error: "Could not mint a widget launch session." });
        return;
      }
      const launch = createLaunchTicket({
        userId: user.id,
        email: user.email,
        tokenHash: props.tokenHash,
        emailOtp: props.emailOtp,
        widget,
      });
      const origin = resolveFrontendOrigin();
      const url = `${origin}/portal?widget=${widget}&launch=${launch}`;
      res.json({
        url,
        widget,
        expires_in_sec: Math.floor(TTL_MS / 1000),
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Could not mint widget launch link",
      });
    }
  });

  app.post("/api/integrations/widget/launch-consume", (req: Request, res: Response) => {
    const rec = consumeLaunchTicket(String(req.body?.launch ?? "").trim());
    if (!rec) {
      res.status(400).json({ error: "Launch link is invalid or expired." });
      return;
    }
    res.json({
      widget: rec.widget,
      email: rec.email,
      token_hash: rec.tokenHash,
      email_otp: rec.emailOtp,
    });
  });
}
