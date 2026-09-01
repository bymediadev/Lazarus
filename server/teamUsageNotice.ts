import { alertEmailAllowlist, serviceRoleClient } from "./founderAuth.js";

/** Team is unlimited. These counts send a heads-up, not a cutoff. */
export function teamUsageNoticeLevels(): number[] {
  const raw = (process.env.TEAM_USAGE_NOTICE_LEVELS ?? "100,200,400").trim();
  const parsed = raw
    .split(",")
    .map((n) => parseInt(n.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return [...new Set(parsed.length ? parsed : [100, 200, 400])].sort((a, b) => a - b);
}

export function teamUsageBanner(used: number): string | null {
  const first = teamUsageNoticeLevels()[0] ?? 100;
  if (used < first) return null;
  return `You’ve run ${used} analyses this billing period. Team is unlimited — this is a usage heads-up, not a cutoff.`;
}

function noticeIssueKey(userId: string, periodStart: string | null, level: number): string {
  return `team_usage:${userId}:${periodStart ?? "none"}:${level}`;
}

async function alreadySent(issueKey: string): Promise<boolean> {
  const supabase = serviceRoleClient();
  if (!supabase) return false;
  const { data } = await supabase
    .from("founder_alert_state")
    .select("last_sent_at")
    .eq("issue_key", issueKey)
    .maybeSingle();
  return !!data?.last_sent_at;
}

async function markSent(issueKey: string, meta: Record<string, unknown>): Promise<void> {
  const supabase = serviceRoleClient();
  if (!supabase) return;
  await supabase.from("founder_alert_state").upsert({
    issue_key: issueKey,
    severity: "warning",
    last_sent_at: new Date().toISOString(),
    meta,
  });
}

async function userEmail(userId: string): Promise<string | null> {
  const supabase = serviceRoleClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user?.email) return null;
  return data.user.email;
}

async function sendResend(to: string[], subject: string, text: string, from: string): Promise<void> {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  if (!apiKey || to.length === 0) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.warn("[team-usage] email failed:", res.status, body.slice(0, 200));
  }
}

/**
 * Fire-and-forget: email the customer and founder when Team usage crosses 100 / 200 / 400.
 * Never blocks the analysis. Team stays unlimited.
 */
export async function maybeNotifyTeamUsage(
  userId: string,
  used: number,
  periodStart: string | null
): Promise<void> {
  if (!serviceRoleClient()) return;
  const levels = teamUsageNoticeLevels()
    .filter((level) => used >= level)
    .sort((a, b) => a - b);
  let level: number | null = null;
  for (const candidate of levels) {
    const key = noticeIssueKey(userId, periodStart, candidate);
    if (await alreadySent(key)) continue;
    level = candidate;
    break;
  }
  if (level == null) return;

  const issueKey = noticeIssueKey(userId, periodStart, level);
  const email = await userEmail(userId);
  const customerFrom =
    (process.env.CONTACT_FROM ?? "").trim() ||
    (process.env.FOUNDER_ALERT_FROM ?? "").trim() ||
    "Lazarus Deal Recovery <support@getldr.ca>";
  const founderFrom = (process.env.FOUNDER_ALERT_FROM ?? customerFrom).trim();

  if (email) {
    await sendResend(
      [email],
      `Lazarus Team usage: ${used} analyses this period`,
      [
        `You’ve run ${used} analyses on Team this billing period.`,
        "",
        "Team is unlimited — you can keep going. This note is just a heads-up so the volume does not sneak up on you.",
        "",
        "If this was not you, write support@getldr.ca.",
      ].join("\n"),
      customerFrom
    );
  }

  const founders = alertEmailAllowlist();
  if (founders.length) {
    await sendResend(
      founders,
      `Team usage notice — ${email ?? userId} at ${used}`,
      [
        `Team account ${email ?? userId} has run ${used} analyses this billing period (threshold ${level}).`,
        "Plan is unlimited; this is an abuse / cost heads-up, not a cutoff.",
        `user_id=${userId}`,
        `period_start=${periodStart ?? "none"}`,
      ].join("\n"),
      founderFrom
    );
  }

  await markSent(issueKey, { userId, used, level, email });
}
