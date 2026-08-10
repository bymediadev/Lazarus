import type { WhiteWhaleAccountIntel } from "../../../shared/whitewhaleTypes.js";
import { isWhiteWhaleConfigured } from "./config.js";
import {
  getWhiteWhaleAccounts,
  normalizeCompanyDomain,
} from "./client.js";
import { mapWhiteWhaleAccountToIntel, pickBestAccount } from "./map.js";

/** True when the value looks like a hostname (has a dot, not just a slug). */
export function looksLikeCompanyDomain(raw: string): boolean {
  const domain = normalizeCompanyDomain(raw);
  if (!domain || !domain.includes(".")) return false;
  // Reject obvious emails
  if (domain.includes("@")) return false;
  return /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(domain);
}

/**
 * Soft-fail WhiteWhale lookup for post-mortem enrichment.
 * Returns null when not configured, domain invalid, no account, or API error.
 */
export async function lookupWhiteWhaleIntelForAccount(
  accountId: string | undefined
): Promise<WhiteWhaleAccountIntel | null> {
  if (!isWhiteWhaleConfigured() || !accountId?.trim()) return null;
  if (!looksLikeCompanyDomain(accountId)) return null;

  const domain = normalizeCompanyDomain(accountId);
  try {
    const accounts = await getWhiteWhaleAccounts({
      accounts: [domain],
      include_signals: true,
      include_people: false,
    });
    const best = pickBestAccount(accounts, domain);
    if (!best) return null;
    return mapWhiteWhaleAccountToIntel(best, domain);
  } catch (err) {
    console.warn(
      "[whitewhale] post-mortem lookup soft-failed:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
