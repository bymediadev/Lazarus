import type { Express } from "express";
import { isWhiteWhaleConfigured } from "./config.js";
import {
  WhiteWhaleApiError,
  getWhiteWhaleAccounts,
  getWhiteWhaleUserOverview,
  normalizeCompanyDomain,
  uploadWhiteWhaleAccounts,
} from "./client.js";
import { mapWhiteWhaleAccountToIntel, pickBestAccount } from "./map.js";

function errorStatus(err: unknown): number {
  if (err instanceof WhiteWhaleApiError) return err.status >= 400 ? err.status : 502;
  return 500;
}

export function registerWhiteWhaleRoutes(app: Express): void {
  app.get("/api/integrations/whitewhale/status", async (_req, res) => {
    if (!isWhiteWhaleConfigured()) {
      res.json({
        configured: false,
        ok: false,
        note: "Add WHITE_WHALE_API_KEY and WHITE_WHALE_USER_EMAIL to enable account signal lookup.",
      });
      return;
    }

    try {
      const overview = (await getWhiteWhaleUserOverview()) as {
        credits_remaining?: number;
        active_accounts?: number;
        icps?: string[];
      };
      res.json({
        configured: true,
        ok: true,
        credits_remaining: overview?.credits_remaining ?? null,
        active_accounts: overview?.active_accounts ?? null,
        icps: overview?.icps ?? [],
        note: "WhiteWhale connected — look up a company domain for buying signals and Why Now context.",
      });
    } catch (err) {
      res.status(errorStatus(err)).json({
        configured: true,
        ok: false,
        error: err instanceof Error ? err.message : "WhiteWhale status check failed",
        note: "API key or user email may be invalid.",
      });
    }
  });

  app.post("/api/integrations/whitewhale/lookup", async (req, res) => {
    if (!isWhiteWhaleConfigured()) {
      res.status(503).json({ error: "WhiteWhale is not configured on the server" });
      return;
    }

    const domain = normalizeCompanyDomain(String(req.body?.domain ?? ""));
    if (!domain || !domain.includes(".")) {
      res.status(400).json({
        error: "Enter a company domain (e.g. acme.com).",
      });
      return;
    }

    try {
      const accounts = await getWhiteWhaleAccounts({
        domains: [domain],
        status: "all",
        signalData: true,
        limit: 10,
      });
      const best = pickBestAccount(accounts, domain);

      if (!best) {
        res.json({
          ok: true,
          found: false,
          domain,
          intel: null,
          note: "No WhiteWhale account for this domain yet. Use Monitor to add it for signal scoring.",
        });
        return;
      }

      const intel = mapWhiteWhaleAccountToIntel(best, domain);
      res.json({
        ok: true,
        found: true,
        domain,
        intel,
        note: intel.summary
          ? "Attach these signals to the deal so recovery analysis can use company direction and Why Now context."
          : "Signals loaded. Attach to deal before running analysis.",
      });
    } catch (err) {
      console.error("[whitewhale] lookup error:", err);
      res.status(errorStatus(err)).json({
        error: err instanceof Error ? err.message : "WhiteWhale lookup failed",
      });
    }
  });

  /**
   * Upload a domain into WhiteWhale monitoring.
   * Default farsight=true (Account Suggestions / pre-score) so credits are not burned until activated.
   */
  app.post("/api/integrations/whitewhale/monitor", async (req, res) => {
    if (!isWhiteWhaleConfigured()) {
      res.status(503).json({ error: "WhiteWhale is not configured on the server" });
      return;
    }

    const domain = normalizeCompanyDomain(String(req.body?.domain ?? ""));
    if (!domain || !domain.includes(".")) {
      res.status(400).json({ error: "Enter a company domain (e.g. acme.com)." });
      return;
    }

    const activate = Boolean(req.body?.activate);
    const icp = String(req.body?.icp ?? "Master").trim() || "Master";

    try {
      await uploadWhiteWhaleAccounts({
        domains: [domain],
        farsight: !activate,
        icp,
      });

      // Immediate re-lookup (may still be empty while Farsight scores).
      const accounts = await getWhiteWhaleAccounts({
        domains: [domain],
        status: "all",
        signalData: true,
        limit: 10,
      });
      const best = pickBestAccount(accounts, domain);
      const intel = best ? mapWhiteWhaleAccountToIntel(best, domain) : null;

      res.json({
        ok: true,
        domain,
        activated: activate,
        found: !!intel,
        intel,
        note: activate
          ? "Account uploaded as active (credits consumed). Signals may take a short time to populate."
          : "Account sent to WhiteWhale Account Suggestions for pre-scoring. Re-lookup after scoring completes, or activate in WhiteWhale.",
      });
    } catch (err) {
      console.error("[whitewhale] monitor error:", err);
      res.status(errorStatus(err)).json({
        error: err instanceof Error ? err.message : "WhiteWhale monitor upload failed",
      });
    }
  });
}
