import { existsSync, readFileSync } from "fs";
import "dotenv/config";

if (!existsSync(".env")) {
  if (process.env.CI || process.env.GITHUB_ACTIONS) {
    console.log("No .env in CI — skipping local env check");
    process.exit(0);
  }
  console.error("Missing .env — copy .env.example to .env and add your keys");
  process.exit(1);
}

const raw = readFileSync(".env", "utf8");
const geminiLines = raw.split(/\r?\n/).filter((l) => /^\s*GEMINI_API_KEY\s*=/.test(l));

function isGeminiKeyFormat(key) {
  return /^AIza/.test(key) || /^AQ\./.test(key);
}

console.log("GEMINI_API_KEY lines in .env:", geminiLines.length);
for (const line of geminiLines) {
  const val = line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
  const kind = /^AIza/.test(val) ? "legacy (AIza)" : /^AQ\./.test(val) ? "auth (AQ.)" : "UNKNOWN";
  console.log("  prefix:", val.slice(0, 6), "| length:", val.length, "| format:", kind);
}

const loaded = (process.env.GEMINI_API_KEY ?? "").trim();
const valid = isGeminiKeyFormat(loaded);
console.log(
  "dotenv loaded prefix:",
  loaded.slice(0, 6),
  "| valid Gemini format:",
  valid ? "true" : "false"
);

if (/^AQ\./.test(loaded)) {
  console.log("");
  console.log("Note: AQ. keys are Google's new auth keys (2026). They are valid.");
  console.log("Server must start with: npm run dev  (uses node --use-system-ca for Windows TLS)");
}
