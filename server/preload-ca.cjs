// Must load BEFORE any HTTPS requests. Used via: node -r ./server/preload-ca.cjs
const { existsSync } = require("fs");
const { join } = require("path");

const caBundle = join(process.cwd(), "windows-extra-cas.pem");

if (existsSync(caBundle)) {
  process.env.NODE_EXTRA_CA_CERTS = caBundle;
} else if (!process.env.NODE_EXTRA_CA_CERTS) {
  console.warn(
    "[Lazarus] windows-extra-cas.pem not found. Run: powershell -File scripts/export-windows-cas.ps1"
  );
}
