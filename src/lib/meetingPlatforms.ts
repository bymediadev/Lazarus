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
    connectNote: "Start a session, then speak or paste. Connect Zoom only if you want automatic transcripts.",
  },
  {
    id: "meet",
    label: "Google Meet",
    connectNote: "Start a session, then speak or paste beside Meet. Connect Google is optional for this test.",
  },
  {
    id: "teams",
    label: "Microsoft Teams",
    connectNote: "Start a session, then speak or paste beside Teams. Connect Teams is optional for this test.",
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
