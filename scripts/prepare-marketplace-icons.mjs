/**
 * Resize public/logo.png into marketplace + extension + Teams icon sizes.
 * Windows: System.Drawing. Other platforms: copies the source logo as a stand-in.
 */
import { existsSync, mkdirSync, copyFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "public", "logo.png");
const outDir = join(root, "marketplace", "icons");

const sizes = [16, 32, 48, 128, 192, 512];

if (!existsSync(src)) {
  console.error("Missing public/logo.png");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

function copyFallback() {
  for (const size of sizes) {
    copyFileSync(src, join(outDir, `icon-${size}.png`));
  }
}

const powershellExe = join(
  process.env.SystemRoot ?? "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe"
);

if (process.platform === "win32") {
  const result = spawnSync(
    powershellExe,
    [
      "-NoProfile",
      "-File",
      join(root, "scripts", "resize-icons.ps1"),
      "-SourcePng",
      src,
      "-OutDir",
      outDir,
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    console.warn(result.stderr || result.stdout || result.error);
    copyFallback();
  }
} else {
  copyFallback();
}

const extIcons = join(root, "extensions", "meet-captions", "icons");
mkdirSync(extIcons, { recursive: true });
for (const size of [16, 48, 128]) {
  copyFileSync(join(outDir, `icon-${size}.png`), join(extIcons, `icon${size}.png`));
}

const teamsDir = join(root, "marketplace", "teams");
copyFileSync(join(outDir, "icon-192.png"), join(teamsDir, "color.png"));
const outline = spawnSync(
  powershellExe,
  [
    "-NoProfile",
    "-File",
    join(root, "scripts", "make-teams-outline.ps1"),
    "-SourcePng",
    src,
    "-DestPng",
    join(teamsDir, "outline.png"),
  ],
  { encoding: "utf8" }
);
if (outline.status !== 0) {
  console.error(outline.stderr || outline.stdout || outline.error);
  process.exit(outline.status ?? 1);
}

const hubspotLogo = join(root, "hubspot-app", "src", "app");
mkdirSync(hubspotLogo, { recursive: true });
copyFileSync(join(outDir, "icon-192.png"), join(hubspotLogo, "app-logo.png"));

console.log("Wrote marketplace/icons, extension icons, Teams color/outline pngs, and HubSpot app-logo.png");
