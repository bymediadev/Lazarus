/**
 * Fail the package step if a store zip asks for more than marketplace/allowed-scopes.json
 * or if meeting-platform zips contain each other's files.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

function fail(message) {
  console.error(`FAIL marketplace package: ${message}`);
  process.exit(1);
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sameSet(actual, expected) {
  const a = [...actual].sort();
  const e = [...expected].sort();
  return a.length === e.length && a.every((v, i) => v === e[i]);
}

function normalizeZipName(name) {
  return name.replace(/\\/g, "/").replace(/^\.\//, "");
}

function zipEntryNames(zipPath) {
  if (process.platform === "win32") {
    const ps = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const result = spawnSync(
      ps,
      [
        "-NoProfile",
        "-Command",
        `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::OpenRead('${zipPath.replace(/'/g, "''")}').Entries | ForEach-Object { $_.FullName }`,
      ],
      { encoding: "utf8" }
    );
    if (result.status !== 0) fail(`could not read zip ${zipPath}: ${result.stderr || result.stdout}`);
    return (result.stdout || "")
      .split(/\r?\n/)
      .map((s) => normalizeZipName(s.trim()))
      .filter(Boolean);
  }
  const result = spawnSync("zipinfo", ["-1", zipPath], { encoding: "utf8" });
  if (result.status !== 0) fail(`could not read zip ${zipPath}`);
  return (result.stdout || "")
    .split(/\r?\n/)
    .map((s) => normalizeZipName(s.trim()))
    .filter(Boolean);
}

function requireEntries(names, required, label) {
  for (const file of required) {
    if (!names.some((n) => n === file || n.endsWith(`/${file}`))) {
      fail(`${label} zip missing ${file}`);
    }
  }
}

export function validateMarketplacePackages({ cwsZip, teamsZip, zoomZip, hubspotZip, teamsManifest, root }) {
  const allowed = loadJson(join(root, "marketplace", "allowed-scopes.json"));
  const chromeManifest = loadJson(join(root, "extensions", "meet-captions", "manifest.json"));
  const hubspotMeta = loadJson(join(root, "hubspot-app", "src", "app", "app-hsmeta.json"));

  if (chromeManifest.manifest_version !== 3) fail("Chrome manifest must be MV3");
  if (!sameSet(chromeManifest.permissions ?? [], allowed.chrome.permissions)) {
    fail(`Chrome permissions must be exactly ${JSON.stringify(allowed.chrome.permissions)}`);
  }
  if (!sameSet(chromeManifest.host_permissions ?? [], allowed.chrome.host_permissions)) {
    fail(`Chrome host_permissions must be exactly ${JSON.stringify(allowed.chrome.host_permissions)}`);
  }
  const chromeText = JSON.stringify(chromeManifest);
  for (const forbidden of allowed.chrome.forbidden_permissions) {
    if (chromeText.includes(forbidden) && forbidden !== "storage") {
      fail(`Chrome package must not request ${forbidden}`);
    }
  }
  if (/localhost|127\.0\.0\.1|manifest\.dev/.test(chromeText)) {
    fail("Chrome production package must not include localhost or manifest.dev");
  }
  const matches = (chromeManifest.content_scripts ?? []).flatMap((s) => s.matches ?? []);
  if (!sameSet(matches, allowed.chrome.content_script_hosts)) {
    fail(`Chrome content_scripts.matches must be exactly ${JSON.stringify(allowed.chrome.content_script_hosts)}`);
  }

  const cwsNames = zipEntryNames(cwsZip);
  requireEntries(cwsNames, ["manifest.json", "background.js", "meet.js", "pair.js"], "CWS");
  if (cwsNames.some((n) => /manifest\.dev|localhost|color\.png|outline\.png|app-settings\.json/i.test(n))) {
    fail("CWS zip contains a Teams/Zoom or dev-only file");
  }

  if (teamsManifest.permissions && teamsManifest.permissions.length > 0) {
    fail("Teams zip must not declare identity/messageTeamMembers — this app does not use Teams SSO or chat");
  }
  if (teamsManifest.bots) fail("Teams zip must not include a bot");
  if (teamsManifest.webApplicationInfo) fail("Teams zip must not declare SSO webApplicationInfo until Teams SSO ships");
  if (teamsManifest.configurableTabs) {
    fail("Teams zip must not declare channel/team configurableTabs (July 2026 channel-app schema)");
  }
  const domains = teamsManifest.validDomains ?? [];
  if (domains.some((d) => /zoom|hubspot|salesforce|force\.com/i.test(d))) {
    fail("Teams validDomains must only be Lazarus hosts");
  }
  if (!domains.includes("www.getldr.ca") || !domains.includes("getldr.ca")) {
    fail("Teams validDomains must include www.getldr.ca and getldr.ca");
  }
  const teamsNames = zipEntryNames(teamsZip);
  const teamsBase = teamsNames.map((n) => n.split("/").pop());
  if (!["manifest.json", "color.png", "outline.png"].every((f) => teamsBase.includes(f))) {
    fail("Teams zip must contain manifest.json, color.png, outline.png");
  }
  if (teamsNames.some((n) => /meet\.js|pair\.js|background\.js|app-settings\.json|scopes\.json/i.test(n))) {
    fail("Teams zip must not include Meet extension or Zoom listing files");
  }
  if (teamsNames.length > 6) fail("Teams zip has unexpected extra files");

  if (!zoomZip || !existsSync(zoomZip)) fail("Zoom listing zip was not written");
  const zoomNames = zipEntryNames(zoomZip);
  requireEntries(
    zoomNames,
    [
      "README.txt",
      "listing.md",
      "app-settings.json",
      "scopes.json",
      "icons/icon-128.png",
      "icons/icon-512.png",
      "screenshots/01-home.jpg",
      "screenshots/06-zoom-live.jpg",
    ],
    "Zoom"
  );
  if (zoomNames.some((n) => /meet\.js|pair\.js|color\.png|outline\.png|manifest\.json/i.test(n))) {
    fail("Zoom listing zip must not include the Meet extension or Teams app package");
  }
  if (!Array.isArray(allowed.zoom) || allowed.zoom.length !== 3) {
    fail("Zoom allowed-scopes.json must list exactly the three RTMS transcript scopes");
  }

  const hubSpotScopes = hubspotMeta.config?.auth?.requiredScopes ?? [];
  if (!sameSet(hubSpotScopes, allowed.hubspot)) {
    fail(`HubSpot requiredScopes must be exactly ${JSON.stringify(allowed.hubspot)}`);
  }
  if (hubspotMeta.config?.distribution !== "marketplace") fail("HubSpot distribution must be marketplace");
  if (hubspotMeta.config?.auth?.type !== "oauth") fail("HubSpot auth must be oauth");
  const extraHubSpot = hubSpotScopes.filter((s) => /contacts|companies|tickets|content/i.test(s));
  if (extraHubSpot.length) fail(`HubSpot zip requests out-of-scope scopes: ${extraHubSpot.join(", ")}`);
  if (!existsSync(hubspotZip)) fail("HubSpot zip was not written");

  console.log("Marketplace packages match allowed-scopes.json (Meet / Teams / Zoom kept separate)");
}
