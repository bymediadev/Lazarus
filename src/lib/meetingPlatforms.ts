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
    connectNote: "Live companion runs beside your Zoom window. One-click OAuth ingest is on the roadmap.",
  },
  {
    id: "meet",
    label: "Google Meet",
    connectNote: "Keep Meet open — float the Lazarus panel in the corner. Workspace connect coming next.",
  },
  {
    id: "teams",
    label: "Microsoft Teams",
    connectNote: "Works alongside Teams desktop or web. Graph API auto-ingest is on the roadmap.",
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
