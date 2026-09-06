export type ModelTier = "free" | "entry" | "team";

const FLASH_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
];

export function modelCandidatesForTier(tier: ModelTier): string[] {
  const flash = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const entry = process.env.GEMINI_MODEL_ENTRY?.trim() || "gemini-2.5-pro";
  const team = process.env.GEMINI_MODEL_TEAM?.trim() || "gemini-3.1-pro-preview";
  const flashChain = [flash, ...FLASH_CHAIN.filter((name) => name !== flash)];

  if (tier === "team") return [...new Set([team, entry, ...flashChain])];
  if (tier === "entry") return [...new Set([entry, ...flashChain])];
  return [...new Set(flashChain)];
}
