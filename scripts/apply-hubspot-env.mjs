/**
 * Upsert HubSpot OAuth vars into local .env (never prints secrets).
 *
 * Usage:
 *   node scripts/apply-hubspot-env.mjs --id <client_id> --secret <client_secret>
 *   node scripts/apply-hubspot-env.mjs --id <client_id> --secret <client_secret> --prod-redirect
 *
 * Default redirect: http://localhost:3001/api/integrations/hubspot/callback
 * --prod-redirect:  https://lazarus-4uxi.onrender.com/api/integrations/hubspot/callback
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(ROOT, ".env");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1];
}

const clientId = (argValue("--id") ?? process.env.HUBSPOT_CLIENT_ID ?? "").trim();
const clientSecret = (argValue("--secret") ?? process.env.HUBSPOT_CLIENT_SECRET ?? "").trim();
const useProdRedirect = process.argv.includes("--prod-redirect");
const redirectUri =
  (argValue("--redirect") ?? "").trim() ||
  (useProdRedirect
    ? "https://lazarus-4uxi.onrender.com/api/integrations/hubspot/callback"
    : "http://localhost:3001/api/integrations/hubspot/callback");

if (!clientId || !clientSecret) {
  console.error(
    "Usage: node scripts/apply-hubspot-env.mjs --id <client_id> --secret <client_secret> [--prod-redirect]"
  );
  process.exit(1);
}

if (!existsSync(ENV_PATH)) {
  console.error("Missing .env — copy .env.example to .env first.");
  process.exit(1);
}

const pairs = {
  HUBSPOT_CLIENT_ID: clientId,
  HUBSPOT_CLIENT_SECRET: clientSecret,
  HUBSPOT_REDIRECT_URI: redirectUri,
};

let text = readFileSync(ENV_PATH, "utf8");
if (!text.endsWith("\n")) text += "\n";

for (const [key, value] of Object.entries(pairs)) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) {
    text = text.replace(re, line);
  } else {
    text += `${line}\n`;
  }
}

writeFileSync(ENV_PATH, text, "utf8");
console.log("Updated .env:");
console.log("  HUBSPOT_CLIENT_ID=SET");
console.log("  HUBSPOT_CLIENT_SECRET=SET");
console.log(`  HUBSPOT_REDIRECT_URI=${redirectUri}`);
console.log("Restart the API (npm run dev) so HubSpot status flips to configured.");
