import "dotenv/config";
import { purgeExpiredTranscripts } from "./supabase.js";

async function main() {
  const days = process.argv[2] ? parseInt(process.argv[2], 10) : undefined;
  console.log("Lazarus retention purge — nulling transcript_text older than policy window...");

  const result = await purgeExpiredTranscripts(days);
  if (!result) {
    console.error("Purge aborted — check Supabase env vars.");
    process.exit(1);
  }

  console.log(
    `Done. Nulled ${result.purged} transcript(s). Deleted ${result.reportsDeleted} finished report(s). Retention window: ${result.retentionDays} days.`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
