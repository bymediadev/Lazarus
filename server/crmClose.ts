/** True when HubSpot or Salesforce has marked the deal finished. */
export function isCrmDealComplete(
  stage: string | undefined,
  isClosedFlag?: boolean | string | null
): boolean {
  if (isClosedFlag === true || isClosedFlag === "true") return true;
  const compact = String(stage ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!compact) return false;
  return (
    compact === "closedwon" ||
    compact === "closedlost" ||
    compact === "complete" ||
    compact === "completed"
  );
}
