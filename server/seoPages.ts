import type { Express, Request, Response } from "express";
import { existsSync, readFileSync } from "fs";
import path from "path";

/** Clean public URLs that must return real HTML, not the SPA shell. */
export const CRAWLABLE_HTML_PAGES: Record<string, string> = {
  "/how-to-recover-a-stalled-b2b-deal": "how-to-recover-a-stalled-b2b-deal.html",
  "/deal-recovery": "deal-recovery.html",
  "/integrations": "integrations.html",
};

/** Short entry paths that 301 to the canonical indexed pages. */
export const SEO_PAGE_ALIASES: Record<string, string> = {
  "/security": "/security-overview",
  "/stalled-deal-framework": "/how-to-recover-a-stalled-b2b-deal",
  "/framework": "/how-to-recover-a-stalled-b2b-deal",
};

const VERIFICATION_TOKEN = /^[A-Za-z0-9_-]{8,128}$/;

export function googleSiteVerificationMeta(): string {
  const token = (process.env.GOOGLE_SITE_VERIFICATION ?? "").trim();
  if (!VERIFICATION_TOKEN.test(token)) return "";
  return `<meta name="google-site-verification" content="${token}" />\n    `;
}

export function sendIndexedHtml(filePath: string, res: Response): void {
  if (!existsSync(filePath)) {
    res.status(404).type("text").send("Not found");
    return;
  }
  const meta = googleSiteVerificationMeta();
  if (!meta) {
    res.type("html").sendFile(filePath);
    return;
  }
  const html = readFileSync(filePath, "utf8");
  if (html.includes('name="google-site-verification"')) {
    res.type("html").send(html);
    return;
  }
  res.type("html").send(html.replace("<head>", `<head>\n    ${meta}`));
}

export function registerSeoPageRoutes(app: Express, publicPath: string): void {
  for (const [from, to] of Object.entries(SEO_PAGE_ALIASES)) {
    app.get(from, (_req: Request, res: Response) => {
      res.redirect(301, to);
    });
    app.get(`${from}.html`, (_req: Request, res: Response) => {
      res.redirect(301, to);
    });
  }
  for (const [url, file] of Object.entries(CRAWLABLE_HTML_PAGES)) {
    const filePath = path.join(publicPath, file);
    app.get(url, (_req: Request, res: Response) => {
      sendIndexedHtml(filePath, res);
    });
    app.get(`${url}.html`, (_req: Request, res: Response) => {
      res.redirect(301, url);
    });
  }
}
