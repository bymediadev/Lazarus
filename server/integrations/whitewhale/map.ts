import type { WhiteWhaleAccountIntel, WhiteWhaleSignal } from "../../../shared/whitewhaleTypes.js";
import type { WhiteWhaleRawAccount, WhiteWhaleRawSignal } from "./client.js";

function formatAnswer(answer: unknown): string {
  if (answer == null) return "";
  if (typeof answer === "string" || typeof answer === "number" || typeof answer === "boolean") {
    return String(answer);
  }
  try {
    return JSON.stringify(answer);
  } catch {
    return String(answer);
  }
}

function isPositiveSignal(signal: WhiteWhaleRawSignal): boolean {
  const raw = signal.answer;
  if (typeof raw === "boolean") return raw;
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!s) return false;
  if (s === "no" || s === "false" || s === "0" || s === "n" || s === "none") return false;
  return true;
}

function mapSignal(signal: WhiteWhaleRawSignal): WhiteWhaleSignal {
  const sources = (signal.top_articles ?? [])
    .filter((a): a is NonNullable<typeof a> => !!a)
    .map((article) => ({
      source: article.source ?? null,
      headline: article.article_summary?.headline ?? null,
      quotes: (article.article_summary?.quotes ?? []).filter(Boolean).map(String),
      one_sentence_summary: article.article_summary?.one_sentence_summary ?? null,
    }));

  return {
    name: String(signal.trace_name ?? "").trim() || "Signal",
    question: String(signal.question ?? "").trim(),
    answer: formatAnswer(signal.answer),
    long_answer: signal.long_answer ?? null,
    probability: signal.prob ?? null,
    date: signal.date ?? null,
    sources,
  };
}

/** Prefer active over farsight/archived when multiple rows match a domain. */
export function pickBestAccount(
  accounts: WhiteWhaleRawAccount[],
  domain: string
): WhiteWhaleRawAccount | null {
  if (!accounts.length) return null;
  const needle = domain.toLowerCase();
  const matched = accounts.filter((a) => {
    const name = String(a.name ?? "").toLowerCase();
    return name === needle || name.endsWith(`.${needle}`) || name.includes(needle);
  });
  const pool = matched.length ? matched : accounts;
  const rank = (status: string) =>
    status === "active" ? 0 : status === "farsight" ? 1 : status === "archived" ? 2 : 3;
  return [...pool].sort((a, b) => {
    const statusDiff = rank(a.status) - rank(b.status);
    if (statusDiff !== 0) return statusDiff;
    return (b.scaled_score ?? 0) - (a.scaled_score ?? 0);
  })[0];
}

export function mapWhiteWhaleAccountToIntel(
  account: WhiteWhaleRawAccount,
  domain: string
): WhiteWhaleAccountIntel {
  const rawSignals = account.signals ?? [];
  const positive = rawSignals.filter(isPositiveSignal);
  const signals = (positive.length ? positive : rawSignals).map(mapSignal);

  const signalNames =
    (account.signal_list ?? []).filter(Boolean).map(String).length > 0
      ? (account.signal_list ?? []).filter(Boolean).map(String)
      : signals.map((s) => s.name);

  const data = account.account_data;

  return {
    domain,
    account_id: account.id,
    name: data?.full_name ?? account.name ?? null,
    status: account.status ?? null,
    scaled_score: account.scaled_score ?? null,
    summary: account.summary ?? data?.background ?? null,
    industry: data?.industry ?? data?.li_industry ?? null,
    employees: data?.li_employees ?? null,
    linkedin_url: data?.linkedin_url ?? null,
    signal_names: signalNames,
    signals,
    source: "whitewhale",
  };
}
