import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { decryptSecretJson, encryptSecretJson } from "../cryptoSecrets.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../../.data");

type Envelope<T> = { users: Record<string, T> };

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export function createUserTokenStore<T extends { access_token?: string }>(filename: string) {
  const filePath = path.join(DATA_DIR, filename);
  let memory: Record<string, T> = {};
  let loaded = false;

  function persist(): void {
    ensureDataDir();
    writeFileSync(filePath, encryptSecretJson({ users: memory } satisfies Envelope<T>), "utf8");
  }

  function hydrate(): void {
    if (loaded) return;
    loaded = true;
    if (!existsSync(filePath)) return;
    try {
      const raw = readFileSync(filePath, "utf8").trim();
      if (!raw) return;
      const parsed = decryptSecretJson<Envelope<T> | T>(raw);
      if (parsed && typeof parsed === "object" && "users" in parsed && parsed.users) {
        memory = parsed.users;
        return;
      }
      // Legacy singleton file — keep unreadable to callers (no user id).
    } catch (err) {
      console.warn(`[tokens] ${filename} hydrate failed:`, err instanceof Error ? err.message : err);
    }
  }

  return {
    load(userId: string): T | null {
      if (!userId) return null;
      hydrate();
      return memory[userId] ?? null;
    },
    save(userId: string, record: T): void {
      if (!userId) return;
      hydrate();
      memory[userId] = record;
      persist();
    },
    clear(userId: string): void {
      if (!userId) return;
      hydrate();
      delete memory[userId];
      persist();
    },
    hasAny(): boolean {
      hydrate();
      return Object.values(memory).some((row) => !!row?.access_token);
    },
    findUserId(predicate: (record: T, userId: string) => boolean): string | null {
      hydrate();
      for (const [userId, record] of Object.entries(memory)) {
        if (predicate(record, userId)) return userId;
      }
      return null;
    },
  };
}
