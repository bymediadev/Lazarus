/**
 * Post-Vite steps for GitHub Pages:
 * - 404.html = SPA fallback so unknown client routes still load the app
 * - Trust Pack + SEO HTML at /{slug}/ (200, not SPA)
 * - /login, /portal, /app folders with noindex copies of the SPA shell
 * - .nojekyll so GitHub does not run Jekyll on the dist folder
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const indexHtml = join(dist, "index.html");
const SITE = "https://www.getldr.ca";

if (!existsSync(indexHtml)) {
  console.error("dist/index.html missing — run vite build first");
  process.exit(1);
}

copyFileSync(indexHtml, join(dist, "404.html"));
writeFileSync(join(dist, ".nojekyll"), "");

function applyNoindex(filePath, canonicalPath) {
  if (!existsSync(filePath)) return;
  let html = readFileSync(filePath, "utf8");
  html = html.replace(/content="index, follow[^"]*"/g, 'content="noindex, nofollow"');
  html = html.replace(
    /<meta name="googlebot" content="index, follow" \/>/,
    '<meta name="googlebot" content="noindex, nofollow" />'
  );
  html = html.replace(
    /<link rel="canonical" href="https:\/\/www\.getldr\.ca\/" \/>/,
    `<link rel="canonical" href="${SITE}${canonicalPath}" />`
  );
  html = html.replace(
    /<meta property="og:url" content="https:\/\/www\.getldr\.ca\/" \/>/,
    `<meta property="og:url" content="${SITE}${canonicalPath}" />`
  );
  html = html.replace(
    /<meta name="twitter:url" content="https:\/\/www\.getldr\.ca\/" \/>/,
    `<meta name="twitter:url" content="${SITE}${canonicalPath}" />`
  );
  writeFileSync(filePath, html);
}

/** SPA fallback must boot the app, but must not look like an indexable homepage duplicate. */
function applySpaFallback404(filePath) {
  if (!existsSync(filePath)) return;
  let html = readFileSync(filePath, "utf8");
  html = html.replace(/content="index, follow[^"]*"/g, 'content="noindex, nofollow"');
  html = html.replace(
    /<meta name="googlebot" content="index, follow" \/>/,
    '<meta name="googlebot" content="noindex, nofollow" />'
  );
  html = html.replace(/\s*<link rel="canonical" href="https:\/\/www\.getldr\.ca\/" \/>/, "");
  html = html.replace(/\s*<meta property="og:url" content="https:\/\/www\.getldr\.ca\/" \/>/, "");
  html = html.replace(/\s*<meta name="twitter:url" content="https:\/\/www\.getldr\.ca\/" \/>/, "");
  html = html.replace(
    /\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    ""
  );
  html = html.replace(
    /<noscript>[\s\S]*?<\/noscript>/,
    '<noscript><p>Page not found. <a href="https://www.getldr.ca/">Lazarus Deal Recovery</a></p></noscript>'
  );
  writeFileSync(filePath, html);
}

for (const slug of ["login", "portal", "app"]) {
  mkdirSync(join(dist, slug), { recursive: true });
  copyFileSync(indexHtml, join(dist, slug, "index.html"));
  copyFileSync(indexHtml, join(dist, `${slug}.html`));
  applyNoindex(join(dist, slug, "index.html"), `/${slug}`);
  applyNoindex(join(dist, `${slug}.html`), `/${slug}`);
}

applySpaFallback404(join(dist, "404.html"));

const staticHtmlFolders = [
  "privacy",
  "terms",
  "dpa",
  "security-overview",
  "security",
  "how-to-recover-a-stalled-b2b-deal",
  "how-do-i-recover-this-deal",
  "stalled-deal-framework",
  "framework",
  "deal-recovery",
  "deal-recovery-software",
  "stalled-deal-recovery",
  "closed-lost-deal-recovery",
  "deal-recovery-plan",
  "integrations",
  "hubspot-and-salesforce",
];
for (const slug of staticHtmlFolders) {
  const src = join(dist, `${slug}.html`);
  if (!existsSync(src)) {
    console.warn(`Skipping ${slug}: ${src} not found`);
    continue;
  }
  const dir = join(dist, slug);
  mkdirSync(dir, { recursive: true });
  copyFileSync(src, join(dir, "index.html"));
}

console.log(
  "GitHub Pages dist ready (404.html noindex, /login /portal /app noindex, Trust Pack + SEO folders, .nojekyll)"
);
