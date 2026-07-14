export type MeetingPlatformId = "zoom" | "meet" | "teams";

export interface MeetingPlatform {
  id: MeetingPlatformId;
  label: string;
  connectNote: string;
}

export const MEETING_PLATFORMS: MeetingPlatform[] = [
  {
    id: "zoom",
    label: "Zoom",
    connectNote:
      "Connect Zoom for RTMS live transcripts. Mic + paste also feeds the live Recovery Brief.",
  },
  {
    id: "meet",
    label: "Google Meet",
    connectNote:
      "Connect Google for Meet/Workspace. Live caption ingest next — mic + paste feeds the same Recovery Brief today.",
  },
  {
    id: "teams",
    label: "Microsoft Teams",
    connectNote:
      "Connect Teams via Microsoft Entra ID. Graph transcript pull next — mic + paste feeds the same Recovery Brief today.",
  },
];

const STORAGE_KEY = "lazarus-meeting-platform";

export function getLinkedPlatform(): MeetingPlatformId | null {
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "zoom" || v === "meet" || v === "teams") return v;
  return null;
}

export function setLinkedPlatform(id: MeetingPlatformId): void {
  localStorage.setItem(STORAGE_KEY, id);
}

export function clearLinkedPlatform(): void {
  localStorage.removeItem(STORAGE_KEY);
}
