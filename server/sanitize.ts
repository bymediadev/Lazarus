const METADATA_LINE =
  /^\s*(---\s*)?(CRM NOTE|OPPORTUNITY STAGE|DEAL STATUS|STAGE:|CLOSED WON|CLOSED LOST|STATUS:|\[CRM\]|\[METADATA\])/i;

/** Strip CRM labels and rep annotations so the model classifies from dialogue only. */
export function stripOutcomeMetadata(text: string): string {
  return text
    .split("\n")
    .filter((line) => !METADATA_LINE.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
