import type { MeetingPlatformId } from "./meetingPlatforms";

const viteEnv = (
  import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }
).env;

export const TEAMS_STORE_APP_ID = "7f48e5c6-6e16-47ea-a5a4-513fd4989e0c";

export const WIDGET_LISTING_NAME = "Lazarus Deal Recovery Widget";

function envUrl(key: string): string | null {
  const raw = (viteEnv?.[key] ?? "").trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
  return raw;
}

export interface WidgetStoreSpec {
  id: MeetingPlatformId;
  label: string;
  storeLabel: string;
  listingUrl: string | null;
  pendingHint: string;
  enableNote: string;
}

export const WIDGET_STORES: Record<MeetingPlatformId, WidgetStoreSpec> = {
  meet: {
    id: "meet",
    label: "Google Meet",
    storeLabel: "Chrome Web Store",
    listingUrl: envUrl("VITE_CWS_LISTING_URL"),
    pendingHint: "Chrome Web Store listing is in review. Sideload extensions/meet-captions for demos.",
    enableNote: "Turn Captions on in Meet after you enable the widget.",
  },
  zoom: {
    id: "zoom",
    label: "Zoom",
    storeLabel: "Zoom Marketplace",
    listingUrl: envUrl("VITE_ZOOM_MARKETPLACE_URL"),
    pendingHint: "Zoom Marketplace listing is in review. Use the existing General App + RTMS connect.",
    enableNote: "Zoom enable is the RTMS General App — not a separate sidebar product.",
  },
  teams: {
    id: "teams",
    label: "Microsoft Teams",
    storeLabel: "Teams store",
    listingUrl:
      envUrl("VITE_TEAMS_STORE_URL") ??
      `https://teams.microsoft.com/l/app/${TEAMS_STORE_APP_ID}`,
    pendingHint: "Import marketplace/teams zip in Teams Developer Portal until the store listing is live.",
    enableNote: "The Teams tab opens this same Lazarus portal beside the meeting.",
  },
};

export function isWidgetHostFramed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.parent !== window;
  } catch {
    return true;
  }
}

export function widgetFromSearch(search = window.location.search): MeetingPlatformId | null {
  const params = new URLSearchParams(search);
  const raw = (params.get("widget") ?? params.get("platform") ?? "").trim();
  if (raw === "zoom" || raw === "meet" || raw === "teams") return raw;
  return null;
}
