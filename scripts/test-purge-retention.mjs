/**
 * Minimal purge endpoint smoke test.
 *
 * Usage:
 *   LAZARUS_API_URL=http://localhost:3001 node scripts/test-purge-retention.mjs
 *
 * Manual test with secret (requires PURGE_CRON_SECRET on server):
 *   curl -X POST "$LAZARUS_API_URL/api/admin/purge-retention" \
 *     -H "x-cron-secret: $PURGE_CRON_SECRET"
 *
 * Skips if LAZARUS_API_URL is unset.
 */
const API = process.env.LAZARUS_API_URL;

if (!API) {
  console.log("SKIP: set LAZARUS_API_URL to run purge endpoint test");
  process.exit(0);
}

const base = API.replace(/\/$/, "");

async function main() {
  const res = await fetch(`${base}/api/admin/purge-retention`, { method: "POST" });
  if (res.status !== 401) {
    const body = await res.text();
    console.error(`Expected 401 without x-cron-secret, got ${res.status}: ${body}`);
    process.exit(1);
  }
  console.log("OK: purge endpoint returns 401 without x-cron-secret");
  console.log("\nManual test with secret:");
  console.log(
    `  curl -X POST "${base}/api/admin/purge-retention" -H "x-cron-secret: $PURGE_CRON_SECRET"`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
