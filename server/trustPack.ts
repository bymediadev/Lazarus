import type { NextFunction, Request, Response } from "express";
import type { Express } from "express";
import { existsSync } from "fs";
import path from "path";

/** slug → source file in public/ */
export const TRUST_PACK_FILES: Record<string, string> = {
  battlecard: "security-battlecard.html",
  "security-overview": "security-overview.html",
  privacy: "privacy.html",
  terms: "terms.html",
  dpa: "dpa.html",
};

const TRUST_PACK_HTML = new Set(Object.values(TRUST_PACK_FILES));

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
    res.redirect(301, `/api/trust-pack/${slug}`);
    return;
  }
  next();
}

export function registerTrustPackRoutes(app: Express, publicPath: string): void {
  app.use(redirectLegacyTrustPack);

  app.get("/api/trust-pack/:slug", (req, res) => {
    const file = TRUST_PACK_FILES[req.params.slug];
    if (!file) {
      res.status(404).json({ error: "Trust pack document not found" });
      return;
    }
    const filePath = path.join(publicPath, file);
    if (!existsSync(filePath)) {
      res.status(404).json({ error: "Trust pack file missing on server" });
      return;
    }
    res.type("html").sendFile(filePath);
  });
}
