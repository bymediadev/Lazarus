export interface TriggerLikelihood {
  label: "Low" | "Medium" | "High" | "Not stated";
  /** Model estimates are not a validated probability model. */
  basis: "uncalibrated_model_estimate";
  showsNumericProbability: false;
}

export function preserveTriggerEstimate(probability: unknown): number | string {
  if (typeof probability === "string") {
    const word = probability.trim().toLowerCase().replace(/%$/, "");
    if (word === "low" || word === "medium" || word === "high") return word;
    if (!word) return "";
    const numeric = Number(word);
    if (!Number.isFinite(numeric)) return "";
    return Math.min(100, Math.max(0, Math.round(numeric)));
  }
  if (typeof probability === "number" && Number.isFinite(probability)) {
    return Math.min(100, Math.max(0, Math.round(probability)));
  }
  return "";
}

function band(value: number): TriggerLikelihood["label"] {
  if (value >= 70) return "High";
  if (value >= 40) return "Medium";
  return "Low";
}

/**
 * Reactivation figures come from the model. There is no calibrated probability
 * model behind them, so the report shows a qualitative label only.
 */
export function triggerLikelihood(probability: number | string | null | undefined): TriggerLikelihood {
  const basis = "uncalibrated_model_estimate" as const;
  if (probability == null || probability === "") {
    return { label: "Not stated", basis, showsNumericProbability: false };
  }
  if (typeof probability === "string") {
    const word = probability.trim().toLowerCase();
    if (word === "low" || word === "medium" || word === "high") {
      const label = (word.charAt(0).toUpperCase() + word.slice(1)) as TriggerLikelihood["label"];
      return { label, basis, showsNumericProbability: false };
    }
    const numeric = Number(word.replace(/%$/, ""));
    if (!Number.isFinite(numeric)) {
      return { label: "Not stated", basis, showsNumericProbability: false };
    }
    return { label: band(numeric), basis, showsNumericProbability: false };
  }
  if (!Number.isFinite(probability)) {
    return { label: "Not stated", basis, showsNumericProbability: false };
  }
  return { label: band(probability), basis, showsNumericProbability: false };
}

export const TRIGGER_ESTIMATE_NOTE =
  "These labels are uncalibrated model estimates. They are not measured probabilities.";
