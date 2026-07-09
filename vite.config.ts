import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createReadStream, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TRUST_PACK_FILES: Record<string, string> = {
  battlecard: "security-battlecard.html",
  "security-overview": "security-overview.html",
  privacy: "privacy.html",
  terms: "terms.html",
  dpa: "dpa.html",
};

const LEGACY_TRUST_PACK_HTML: Record<string, string> = Object.fromEntries(
  Object.entries(TRUST_PACK_FILES).map(([slug, file]) => [`/${file}`, `/api/trust-pack/${slug}`])
);

/** Serve Trust Pack HTML via /api/trust-pack; redirect legacy *.html paths. */
function attachTrustPackMiddleware(server: { middlewares: { use: Function } }) {
  server.middlewares.use((req: { url?: string }, res: { statusCode: number; setHeader: Function; end: Function }, next: () => void) => {
    const pathname = req.url?.split("?")[0] ?? "";
    const legacyRedirect = LEGACY_TRUST_PACK_HTML[pathname];
    if (legacyRedirect) {
      res.statusCode = 301;
      res.setHeader("Location", legacyRedirect);
      res.end();
      return;
    }

    const match = req.url?.match(/^\/api\/trust-pack\/([\w-]+)(?:\?.*)?$/);
    if (!match) {
      next();
      return;
    }
    const file = TRUST_PACK_FILES[match[1]];
    if (!file) {
      res.statusCode = 404;
      res.end("Trust pack document not found");
      return;
    }
    const filePath = path.join(__dirname, "public", file);
    if (!existsSync(filePath)) {
      res.statusCode = 404;
      res.end("Trust pack file missing");
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    createReadStream(filePath).pipe(res);
  });
}

function trustPackDevPlugin(): Plugin {
  return {
    name: "trust-pack-dev",
    configureServer: attachTrustPackMiddleware,
    configurePreviewServer: attachTrustPackMiddleware,
  };
}

export default defineConfig({
  plugins: [react(), trustPackDevPlugin()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL || "http://localhost:3001",
        changeOrigin: true,
        bypass(req) {
          if (req.url?.startsWith("/api/trust-pack/")) {
            return req.url;
          }
        },
      },
    },
  },
  preview: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL || "http://localhost:3001",
        changeOrigin: true,
        bypass(req) {
          if (req.url?.startsWith("/api/trust-pack/")) {
            return req.url;
          }
        },
      },
    },
  },
});
