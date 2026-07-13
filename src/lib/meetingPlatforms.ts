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
      "Connect Zoom for live RTMS transcripts during calls. Without OAuth, mic + paste still works.",
  },
  {
    id: "meet",
    label: "Google Meet",
    connectNote: "Meet RTMS coming after Zoom pilot. Use mic + paste for live notes today.",
  },
  {
    id: "teams",
    label: "Microsoft Teams",
    connectNote: "Teams Graph ingest coming after Zoom pilot. Use mic + paste for live notes today.",
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
