/** Short enough for Salesforce NextStep and HubSpot hs_next_step. Does not change stage. */
export function reviveNextStep(input: {
  viability: number;
  status: string;
  nextAction: string;
}): string {
  const viability = Number.isFinite(input.viability) ? Math.round(input.viability) : 0;
  const status = input.status.replace(/\s+/g, " ").trim() || "Unscored";
  const action = input.nextAction.replace(/\s+/g, " ").trim();
  const head = `Lazarus ${viability} · ${status}`;
  if (!action) return head.slice(0, 255);
  const room = 255 - head.length - 3;
  if (room < 12) return head.slice(0, 255);
  return `${head} — ${action.slice(0, room)}`;
}
