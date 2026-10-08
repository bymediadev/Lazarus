export interface CommercialBaseline {
  fee: string | null;
  owner: string | null;
  target: string | null;
}

function formatDollars(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

function findFee(text: string): string | null {
  const matches = [...text.matchAll(/\$\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|m|million)?/gi)];
  if (!matches.length) return null;
  let best: { amount: number; annual: boolean } | null = null;
  for (const match of matches) {
    let amount = Number(match[1].replace(/,/g, ""));
    const unit = (match[2] ?? "").toLowerCase();
    if (unit === "k") amount *= 1000;
    if (unit === "m" || unit === "million") amount *= 1_000_000;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const window = text.slice(Math.max(0, (match.index ?? 0) - 48), (match.index ?? 0) + match[0].length + 48);
    const annual = /annual|platform fee|per year/i.test(window);
    if (!best || (annual && !best.annual) || (annual === best.annual && amount > best.amount)) {
      best = { amount, annual };
    }
  }
  if (!best) return null;
  const formatted = formatDollars(best.amount);
  return best.annual ? `${formatted} Annual Platform Fee` : formatted;
}

function findOwner(text: string): string | null {
  const labeled = text.match(
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*\([^)]*\)\s*[–—-]\s*Account Executive/i
  );
  if (labeled) return labeled[1];
  const roleFirst = text.match(
    /Account Executive[,:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/
  );
  return roleFirst?.[1] ?? null;
}

function findTarget(text: string): string | null {
  if (/month-end|month end/i.test(text)) return "Post Month-End Access";
  return null;
}

export function commercialBaselineFromText(text: string): CommercialBaseline {
  return {
    fee: findFee(text),
    owner: findOwner(text),
    target: findTarget(text),
  };
}
