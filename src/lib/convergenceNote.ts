export interface ViabilityCycleDisplay {
  intermediate: number | null;
  final: number | null;
  note: string | null;
}

/**
 * Resolution cycles are a fixed three-step derivation. "Converged" means that
 * calculation finished on the frozen state. Equilibrium and trajectory are
 * separate deal-state labels.
 */
export function convergenceExplanation(input: {
  convergenceStatus?: string | null;
  totalCycles?: number | null;
  equilibrium?: string | null;
  trajectory?: string | null;
}): string | null {
  const status = (input.convergenceStatus ?? "").trim();
  if (!status) return null;
  const equilibrium = input.equilibrium?.trim();
  const trajectory = input.trajectory?.trim();
  const dealState = [equilibrium ? `Equilibrium stays ${equilibrium}` : null, trajectory ? `trajectory stays ${trajectory}` : null]
    .filter((part): part is string => Boolean(part))
    .join(", and ");
  if (status.toLowerCase() !== "converged") {
    return `Model status: ${status}. This describes the calculation, not buyer approval.${dealState ? ` ${dealState}.` : ""}`;
  }
  const cycles =
    input.totalCycles && input.totalCycles > 0
      ? `${input.totalCycles} calculation cycles finish on the frozen state`
      : "the derivation finishes on the frozen state";
  return `Model convergence: ${cycles}. Converged means the calculation is complete. It does not mean the buyer approved the deal or that the deal advanced.${dealState ? ` ${dealState}.` : ""}`;
}

export function viabilityCycleDisplay(
  cycles: { state_snapshot?: { viability_score?: number }; state_change?: string }[] | null | undefined,
  finalScore: number | null | undefined
): ViabilityCycleDisplay {
  const final = typeof finalScore === "number" ? finalScore : null;
  const first = cycles?.[0];
  const intermediate =
    cycles && cycles.length > 1 && typeof first?.state_snapshot?.viability_score === "number"
      ? first.state_snapshot.viability_score
      : null;
  if (final == null || intermediate == null || intermediate === final) {
    return { intermediate: null, final, note: null };
  }
  return {
    intermediate,
    final,
    note: `Cycle 1 viability ${intermediate} is an intermediate calculation step. Final derived viability is ${final}.`,
  };
}
