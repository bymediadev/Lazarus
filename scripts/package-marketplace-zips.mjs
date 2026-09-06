/**
 * Zip only the store packages each marketplace will accept, then validate
 * permissions/scopes against marketplace/allowed-scopes.json.
 *
 * Meeting platforms (do not cross-upload):
 *   Meet  → marketplace/google/lazarus-deal-recovery-widget-meet.zip    Chrome Web Store
 *   Teams → marketplace/teams/lazarus-deal-recovery-widget-teams.zip    Partner Center
 *   Zoom  → marketplace/zoom/lazarus-deal-recovery-widget-zoom.zip      listing assets only
 */
import { existsSync, mkdirSync, rmSync, cpSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { validateMarketplacePackages } from "./validate-marketplace-packages.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const allowed = JSON.parse(readFileSync(join(root, "marketplace", "allowed-scopes.json"), "utf8"));

function powershellExe() {
  return join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

function writeUtf8(path, text) {
  writeFileSync(path, text.endsWith("\n") ? text : `${text}\n`, { encoding: "utf8" });
}

function writeUtf8Json(path, value) {
  writeUtf8(path, `${JSON.stringify(value, null, 2)}\n`);
}

function zipDir(sourceDir, destZip) {
  if (existsSync(destZip)) rmSync(destZip);
  mkdirSync(dirname(destZip), { recursive: true });
  if (process.platform === "win32") {
    const ps1 = join(root, "scripts", "zip-dir.ps1");
    const result = spawnSync(
      powershellExe(),
      ["-NoProfile", "-File", ps1, "-SourceDir", sourceDir, "-DestZip", destZip],
      { encoding: "utf8" }
    );
    if (result.status !== 0) {
      console.error(result.error ?? "", result.stderr || result.stdout || `zip failed with status ${result.status}`);
      process.exit(result.status ?? 1);
    }
    return;
  }
  const result = spawnSync("zip", ["-r", destZip, "."], {
    cwd: sourceDir,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || "zip failed — install zip or run on Windows");
    process.exit(result.status ?? 1);
  }
}

function copyIfExists(from, to) {
  if (!existsSync(from)) {
    console.error(`Missing ${from}`);
    process.exit(1);
  }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}

const GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Chrome Web Store — production manifest only (never manifest.dev.json / localhost)
const cwsStaging = join(root, "marketplace", ".cws-staging");
rmSync(cwsStaging, { recursive: true, force: true });
mkdirSync(cwsStaging, { recursive: true });
const ext = join(root, "extensions", "meet-captions");
for (const name of ["manifest.json", "background.js", "meet.js", "pair.js", "icons"]) {
  copyIfExists(join(ext, name), join(cwsStaging, name));
}
if (existsSync(join(cwsStaging, "manifest.dev.json"))) {
  console.error("CWS staging must not include manifest.dev.json");
  process.exit(1);
}
const cwsZip = join(root, "marketplace", "google", "lazarus-deal-recovery-widget-meet.zip");
for (const stale of ["lazarus-meet-captions.zip"]) {
  const stalePath = join(root, "marketplace", "google", stale);
  if (existsSync(stalePath)) rmSync(stalePath);
}
zipDir(cwsStaging, cwsZip);
rmSync(cwsStaging, { recursive: true, force: true });

// Teams Store — personal tab + meeting side panel. No bot, no chat, no Graph in the zip.
const teamsStaging = join(root, "marketplace", ".teams-staging");
rmSync(teamsStaging, { recursive: true, force: true });
mkdirSync(teamsStaging, { recursive: true });
const teamsDir = join(root, "marketplace", "teams");
const teamsManifest = JSON.parse(readFileSync(join(teamsDir, "manifest.json"), "utf8"));
const entraId = (process.env.TEAMS_CLIENT_ID ?? process.env.AZURE_CLIENT_ID ?? "").trim();
if (GUID_RE.test(entraId)) {
  teamsManifest.id = entraId;
} else {
  console.warn(
    "TEAMS_CLIENT_ID is not a real Entra app GUID — Partner Center will reject this zip until you paste the Application (client) ID into marketplace/teams/manifest.json (id) and rebuild."
  );
}
writeUtf8Json(join(teamsStaging, "manifest.json"), teamsManifest);
copyIfExists(join(teamsDir, "color.png"), join(teamsStaging, "color.png"));
copyIfExists(join(teamsDir, "outline.png"), join(teamsStaging, "outline.png"));
const teamsZip = join(teamsDir, "lazarus-deal-recovery-widget-teams.zip");
for (const stale of ["lazarus-teams.zip"]) {
  const stalePath = join(teamsDir, stale);
  if (existsSync(stalePath)) rmSync(stalePath);
}
zipDir(teamsStaging, teamsZip);
rmSync(teamsStaging, { recursive: true, force: true });

// Zoom Marketplace — listing assets only. General App + RTMS is configured in the dashboard.
const zoomStaging = join(root, "marketplace", ".zoom-staging");
rmSync(zoomStaging, { recursive: true, force: true });
mkdirSync(join(zoomStaging, "icons"), { recursive: true });
mkdirSync(join(zoomStaging, "screenshots"), { recursive: true });
writeUtf8(
  join(zoomStaging, "README.txt"),
  [
    "Lazarus Deal Recovery Widget — Zoom listing assets",
    "",
    "Do NOT upload this zip to marketplace.zoom.us as an app package.",
    "Do NOT upload the Meet (Chrome) zip or the Teams zip here either.",
    "",
    "Use this packet:",
    "1. Paste fields from app-settings.json into the Zoom General App dashboard.",
    "2. Enable only the scopes in scopes.json. Remove audio/video/bot scopes.",
    "3. Upload icons/ and screenshots/ on the listing form.",
    "4. Paste listing.md (and marketplace/copy.md) as the store copy.",
    "",
    "Meet zip  -> Chrome Web Store only",
    "Teams zip -> Teams Developer Portal / Partner Center only",
    "Zoom zip  -> listing assets for the Zoom dashboard only",
  ].join("\n")
);
copyIfExists(join(root, "marketplace", "zoom", "listing.md"), join(zoomStaging, "listing.md"));
writeUtf8Json(join(zoomStaging, "scopes.json"), allowed.zoom);
writeUtf8Json(join(zoomStaging, "app-settings.json"), {
  comment: "Paste into the Zoom Marketplace dashboard. Not an uploadable app package.",
  name: "Lazarus Deal Recovery Widget",
  support: "support@getldr.ca",
  homepage: "https://www.getldr.ca",
  privacy: "https://www.getldr.ca/privacy",
  terms: "https://www.getldr.ca/terms",
  app_type: "General App + Realtime Media Streams",
  home_url: "https://lazarus-4uxi.onrender.com/",
  domain_allow_list: ["lazarus-4uxi.onrender.com"],
  oauth_redirect: "https://lazarus-4uxi.onrender.com/api/integrations/zoom/callback",
  event_notification: "https://lazarus-4uxi.onrender.com/api/webhooks/zoom",
  events: ["meeting.rtms_started", "meeting.rtms_stopped"],
  scopes: allowed.zoom,
  do_not_add: [
    "meeting:read:meeting_audio",
    "meeting:read:meeting_video",
    "meeting bot / note-taker participant",
  ],
});
copyIfExists(join(root, "marketplace", "icons", "icon-128.png"), join(zoomStaging, "icons", "icon-128.png"));
copyIfExists(join(root, "marketplace", "icons", "icon-512.png"), join(zoomStaging, "icons", "icon-512.png"));
copyIfExists(join(root, "marketplace", "screenshots", "01-home.jpg"), join(zoomStaging, "screenshots", "01-home.jpg"));
copyIfExists(
  join(root, "marketplace", "screenshots", "06-zoom-live.jpg"),
  join(zoomStaging, "screenshots", "06-zoom-live.jpg")
);
const zoomZip = join(root, "marketplace", "zoom", "lazarus-deal-recovery-widget-zoom.zip");
for (const stale of ["lazarus-zoom.zip"]) {
  const stalePath = join(root, "marketplace", "zoom", stale);
  if (existsSync(stalePath)) rmSync(stalePath);
}
zipDir(zoomStaging, zoomZip);
rmSync(zoomStaging, { recursive: true, force: true });

// HubSpot — developer project (CLI upload source). Zip is the same tree HubSpot accepts.
const hubspotStaging = join(root, "marketplace", ".hubspot-staging");
rmSync(hubspotStaging, { recursive: true, force: true });
mkdirSync(join(hubspotStaging, "src", "app"), { recursive: true });
copyIfExists(join(root, "hubspot-app", "hsproject.json"), join(hubspotStaging, "hsproject.json"));
copyIfExists(
  join(root, "hubspot-app", "src", "app", "app-hsmeta.json"),
  join(hubspotStaging, "src", "app", "app-hsmeta.json")
);
const hubspotLogo = join(root, "hubspot-app", "src", "app", "app-logo.png");
const iconFallback = join(root, "marketplace", "icons", "icon-192.png");
if (existsSync(hubspotLogo)) {
  copyIfExists(hubspotLogo, join(hubspotStaging, "src", "app", "app-logo.png"));
} else if (existsSync(iconFallback)) {
  copyIfExists(iconFallback, join(hubspotStaging, "src", "app", "app-logo.png"));
} else {
  console.error("Missing HubSpot app-logo.png — run npm run marketplace:icons");
  process.exit(1);
}
const hubspotZip = join(root, "marketplace", "hubspot", "lazarus-hubspot.zip");
zipDir(hubspotStaging, hubspotZip);
rmSync(hubspotStaging, { recursive: true, force: true });

validateMarketplacePackages({
  cwsZip,
  teamsZip,
  zoomZip,
  hubspotZip,
  teamsManifest,
  root,
});

console.log("Wrote:");
console.log("  ", cwsZip);
console.log("  ", teamsZip);
console.log("  ", zoomZip);
console.log("  ", hubspotZip);
console.log("Upload Meet → Chrome Web Store, Teams → Partner Center, Zoom zip → listing assets only.");
