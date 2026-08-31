import crypto from "crypto";

function keyMaterial(): string {
  return (
    (process.env.TOKEN_ENCRYPTION_KEY ?? "").trim() ||
    (process.env.OAUTH_STATE_SECRET ?? "").trim() ||
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim()
  );
}

export function secretsEqual(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function aesKey(): Buffer | null {
  const material = keyMaterial();
  if (!material) return null;
  return crypto.createHash("sha256").update(`lazarus-oauth-tokens:${material}`).digest();
}

export function encryptSecretJson(value: unknown): string {
  const key = aesKey();
  const json = JSON.stringify(value);
  if (!key) return json;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

export function decryptSecretJson<T>(raw: string): T {
  if (!raw.startsWith("enc:v1:")) {
    return JSON.parse(raw) as T;
  }
  const key = aesKey();
  if (!key) throw new Error("Cannot decrypt OAuth tokens — TOKEN_ENCRYPTION_KEY is missing");
  const parts = raw.split(":");
  if (parts.length !== 5) throw new Error("Invalid encrypted token blob");
  const iv = Buffer.from(parts[2], "base64url");
  const tag = Buffer.from(parts[3], "base64url");
  const data = Buffer.from(parts[4], "base64url");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const json = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  return JSON.parse(json) as T;
}
