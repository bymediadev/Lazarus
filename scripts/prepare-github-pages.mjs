/**
 * Post-Vite steps for GitHub Pages:
 * - 404.html = SPA fallback so /login and /portal refresh
 * - Trust Pack HTML at /privacy/, /terms/, /dpa/, /security-overview/ (200, not SPA)
 * - .nojekyll so GitHub does not run Jekyll on the dist folder
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const indexHtml = join(dist, "index.html");

if (!existsSync(indexHtml)) {
  console.error("dist/index.html missing — run vite build first");
  process.exit(1);
}

copyFileSync(indexHtml, join(dist, "404.html"));
writeFileSync(join(dist, ".nojekyll"), "");

const trustPack = ["privacy", "terms", "dpa", "security-overview"];
for (const slug of trustPack) {
  const src = join(dist, `${slug}.html`);
  if (!existsSync(src)) {
    console.warn(`Skipping ${slug}: ${src} not found`);
    continue;
  }
  const dir = join(dist, slug);
  mkdirSync(dir, { recursive: true });
  copyFileSync(src, join(dir, "index.html"));
}

console.log("GitHub Pages dist ready (404.html, Trust Pack folders, .nojekyll)");
