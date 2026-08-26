import type { NextFunction, Request, Response } from "express";
import type { Express } from "express";
import { existsSync } from "fs";
import path from "path";
import { resolveAuthUser } from "./founderAuth.js";
import { isFounderUnlimitedEmail } from "./guestRateLimit.js";

/** slug → source file in public/ */
export const TRUST_PACK_FILES: Record<string, string> = {
  battlecard: "security-battlecard.html",
  "security-overview": "security-overview.html",
  privacy: "privacy.html",
  terms: "terms.html",
  dpa: "dpa.html",
};

/** Founder sales enablement — not a public customer Trust Pack doc. */
export const FOUNDER_ONLY_TRUST_PACK = new Set(["battlecard"]);

/** Customer-facing docs at /privacy, /terms, /dpa, /security-overview. */
export const PUBLIC_TRUST_PACK_SLUGS = ["privacy", "terms", "dpa", "security-overview"] as const;

const TRUST_PACK_HTML = new Set(Object.values(TRUST_PACK_FILES));

export function canonicalTrustPackPath(slug: string): string {
  if (FOUNDER_ONLY_TRUST_PACK.has(slug)) return `/api/trust-pack/${slug}`;
  if ((PUBLIC_TRUST_PACK_SLUGS as readonly string[]).includes(slug)) return `/${slug}`;
  return `/api/trust-pack/${slug}`;
}

export function publicTrustPackSlugFromPath(reqPath: string): string | undefined {
  const slug = reqPath.replace(/\/+$/, "").replace(/^\//, "").split("?")[0];
  if ((PUBLIC_TRUST_PACK_SLUGS as readonly string[]).includes(slug)) return slug;
  return undefined;
}

export function trustPackSlugFromPath(reqPath: string): string | undefined {
  const file = reqPath.replace(/^\//, "").split("?")[0];
  for (const [slug, name] of Object.entries(TRUST_PACK_FILES)) {
    if (name === file) return slug;
  }
  return undefined;
}

export function isTrustPackHtmlPath(reqPath: string): boolean {
  const file = reqPath.replace(/^\//, "").split("?")[0];
  return TRUST_PACK_HTML.has(file);
}

/** Must run before express.static(public) so legacy *.html paths 301 to canonical URLs. */
export function redirectLegacyTrustPack(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== "GET" && req.method !== "HEAD") {
    next();
    return;
  }
  const slug = trustPackSlugFromPath(req.path);
  if (slug) {
    res.redirect(301, canonicalTrustPackPath(slug));
    return;
  }
  next();
}

async function authorizeFounderTrustPack(req: Request, res: Response): Promise<boolean> {
  const user = await resolveAuthUser(req);
  if (!user || !isFounderUnlimitedEmail(user.email)) {
    res
      .status(403)
      .type("html")
      .send(
        `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Forbidden</title></head>` +
          `<body style="font-family:system-ui;padding:2rem;max-width:36rem">` +
          `<h1>Founder access required</h1>` +
          `<p>The Security Battlecard (SEC-002) is an internal sales enablement artifact for the ` +
          `Lazarus founder account (<code>joshua.bennett003@gmail.com</code>). ` +
          `Sign in with that account and open it from Founder Ops.</p>` +
          `<p><a href="/">Return to Lazarus</a></p></body></html>`
      );
    return false;
  }
  return true;
}

export function registerTrustPackRoutes(app: Express, publicPath: string): void {
  app.use(redirectLegacyTrustPack);

  for (const slug of PUBLIC_TRUST_PACK_SLUGS) {
    app.get(`/${slug}`, (_req, res) => {
      const file = TRUST_PACK_FILES[slug];
      const filePath = path.join(publicPath, file);
      if (!existsSync(filePath)) {
        res.status(404).type("html").send("Trust pack file missing on server");
        return;
      }
      res.type("html").sendFile(filePath);
    });
  }

  app.get("/api/trust-pack/:slug", (req, res) => {
    void (async () => {
      const slug = req.params.slug;
      const file = TRUST_PACK_FILES[slug];
      if (!file) {
        res.status(404).json({ error: "Trust pack document not found" });
        return;
      }

      if (FOUNDER_ONLY_TRUST_PACK.has(slug)) {
        const ok = await authorizeFounderTrustPack(req, res);
        if (!ok) return;
      }

      const filePath = path.join(publicPath, file);
      if (!existsSync(filePath)) {
        res.status(404).json({ error: "Trust pack file missing on server" });
        return;
      }
      res.type("html").sendFile(filePath);
    })().catch((err) => {
      console.error("[trust-pack]", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Trust pack failed to load" });
      }
    });
  });
}
