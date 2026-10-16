import { readPurchaseMoney, type MoneyContext } from "./reportMatrix";

export interface CommercialBaseline {
  fee: string | null;
  owner: string | null;
  target: string | null;
  /** Dollars the call named that are not the qualified purchase value. */
  context?: MoneyContext[];
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

function feeFromQualifiedBudget(budget: string): string | null {
  const match = budget.match(/\$\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|m|million)?/i);
  if (!match) return null;
  let amount = Number(match[1].replace(/,/g, ""));
  const unit = (match[2] ?? "").toLowerCase();
  if (unit === "k") amount *= 1_000;
  if (unit === "m" || unit === "million") amount *= 1_000_000;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const formatted = `$${Math.round(amount).toLocaleString("en-US")}`;
  return /annual platform fee|platform fee|annual platform budget|annual contract/i.test(budget)
    ? `${formatted} Annual Platform Fee`
    : formatted;
}

/** Qualified purchase value from the transcript. Other dollars stay in context. */
export function commercialBaselineFromText(text: string): CommercialBaseline {
  const money = readPurchaseMoney(text ?? "");
  return {
    fee: money.qualifiedFee,
    owner: findOwner(text ?? ""),
    target: findTarget(text ?? ""),
    context: money.context,
  };
}

function keptContext(raw: CommercialBaseline["context"]): MoneyContext[] {
  if (!Array.isArray(raw)) return [];
  const out: MoneyContext[] = [];
  for (const item of raw) {
    if (!item || typeof item.label !== "string" || !/^\$[\d,]+/.test(item.label)) continue;
    if (item.kind !== "seller_revenue" && item.kind !== "rejected" && item.kind !== "deal_value" && item.kind !== "buyer_budget") {
      continue;
    }
    out.push({
      kind: item.kind,
      label: item.label,
      note: typeof item.note === "string" ? item.note.slice(0, 160) : "",
    });
    if (out.length === 4) break;
  }
  return out;
}

/**
 * The headline uses one reading.
 * A stored fee is ignored when the transcript or the budget line does not qualify it.
 * Stored context is the classification saved with the row. It is not rebuilt from the fee.
 */
export function presentCommercialBaseline(input: {
  transcript?: string | null;
  stored?: CommercialBaseline | null;
  diagnosticBudget?: string | null;
}): CommercialBaseline {
  if (input.transcript?.trim()) {
    return commercialBaselineFromText(input.transcript);
  }
  const budget = input.diagnosticBudget ?? "";
  const rejected = /not qualified/i.test(budget);
  const qualified = /qualified for this purchase/i.test(budget);
  const fee = rejected ? null : qualified ? feeFromQualifiedBudget(budget) : input.stored?.fee ?? null;
  return {
    fee,
    owner: input.stored?.owner ?? null,
    target: input.stored?.target ?? null,
    context: keptContext(input.stored?.context),
  };
}
