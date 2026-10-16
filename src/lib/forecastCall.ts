export const NON_VIABLE_FORECAST_LINE =
  "[⚠️ NON-VIABLE]: This deal features absolute structural lock-in. Remove from active quarterly forecast.";

export const DEFER_FORECAST_LINE =
  "Defer from the active quarterly forecast. The evidence does not support a close this quarter, and it does not show that recovery is impossible.";

export const NOT_A_PURCHASE_FORECAST_LINE =
  "Not a deal. Keep any step already promised, and keep it off the forecast.";

export function forecastGuidance(input: {
  status?: string;
  trajectory?: string;
  recoverability?: number;
  viabilityState?: string;
}): { removeFromForecast: boolean; line: string; showRecoveryPlan: boolean } {
  const status = input.status ?? "";
  const trajectory = input.trajectory ?? "";
  const recoverability = input.recoverability;
  const viabilityState = input.viabilityState ?? "";
  const dead =
    /NON-VIABLE/i.test(viabilityState) ||
    trajectory === "NON-VIABLE / DEAD" ||
    /NON-VIABLE\s*\/\s*DEAD/i.test(trajectory);

  if (/MOTION NOT ESTABLISHED/i.test(status)) {
    return {
      removeFromForecast: true,
      showRecoveryPlan: false,
      line: "Motion not established. Keep this off the forecast until the speakers can be read.",
    };
  }
  if (/NOT A (PURCHASE|DEAL)/i.test(status)) {
    return { removeFromForecast: true, showRecoveryPlan: true, line: NOT_A_PURCHASE_FORECAST_LINE };
  }
  if (dead) {
    return { removeFromForecast: true, showRecoveryPlan: false, line: NON_VIABLE_FORECAST_LINE };
  }
  if (
    /locked/i.test(trajectory) ||
    (status === "STALLED — HIGH RISK" && recoverability !== undefined && recoverability <= 15)
  ) {
    return { removeFromForecast: true, showRecoveryPlan: true, line: DEFER_FORECAST_LINE };
  }
  if (/recoverable/i.test(trajectory)) {
    if (recoverability !== undefined && recoverability <= 20) {
      return { removeFromForecast: true, showRecoveryPlan: true, line: DEFER_FORECAST_LINE };
    }
    return {
      removeFromForecast: false,
      showRecoveryPlan: true,
      line: "Recoverable with focused manager action — keep on forecast only if the plan is owned.",
    };
  }
  if (/VELOCITY|ACTIVE/i.test(trajectory)) {
    return {
      removeFromForecast: false,
      showRecoveryPlan: true,
      line: "Moving / healthier path — protect momentum and clear open blockers.",
    };
  }
  return {
    removeFromForecast: false,
    showRecoveryPlan: true,
    line: "Judge recoverable vs flat no from the blocker and ownership before the next forecast call.",
  };
}
