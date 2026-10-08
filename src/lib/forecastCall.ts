export const NON_VIABLE_FORECAST_LINE =
  "[⚠️ NON-VIABLE]: This deal features absolute structural lock-in. Remove from active quarterly forecast.";

export function forecastGuidance(input: {
  status?: string;
  trajectory?: string;
  recoverability?: number;
}): { removeFromForecast: boolean; line: string } {
  const status = input.status ?? "";
  const trajectory = input.trajectory ?? "";
  const recoverability = input.recoverability;

  if (status === "STALLED — HIGH RISK" && recoverability !== undefined && recoverability <= 15) {
    return { removeFromForecast: true, line: NON_VIABLE_FORECAST_LINE };
  }
  if (/locked|NON-VIABLE|DEAD/i.test(trajectory)) {
    return {
      removeFromForecast: true,
      line: "Likely flat no for forecast — do not keep sandbagging without a force change.",
    };
  }
  if (/recoverable/i.test(trajectory)) {
    return {
      removeFromForecast: false,
      line: "Recoverable with focused manager action — keep on forecast only if the plan is owned.",
    };
  }
  if (/VELOCITY|ACTIVE/i.test(trajectory)) {
    return {
      removeFromForecast: false,
      line: "Moving / healthier path — protect momentum and clear open blockers.",
    };
  }
  return {
    removeFromForecast: false,
    line: "Judge recoverable vs flat no from the blocker and ownership before the next forecast call.",
  };
}
