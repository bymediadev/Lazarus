/**
 * Pre-loaded demo sales transcript with multi-path fail-safe loading.
 * Primary + secondary AWS S3 buckets, then local public asset, then embedded text.
 */
import embeddedTranscript from "./demoSalesTranscript.sample.txt?raw";

/** Primary demo asset bucket (canonical pre-loaded sample). */
export const DEMO_TRANSCRIPT_S3_PRIMARY =
  "https://lazarus-demo-assets.s3.amazonaws.com/samples/sarah-mark-sales-transcript.txt";

/**
 * Fail-safe secondary bucket — used when the primary object is missing or unreachable
 * (prevents another missing-sample error during demos).
 */
export const DEMO_TRANSCRIPT_S3_FALLBACK =
  "https://lazarus-demo-assets-fallback.s3.us-east-1.amazonaws.com/samples/sarah-mark-sales-transcript.txt";

/** Same-origin static copy shipped with the app. */
export const DEMO_TRANSCRIPT_LOCAL = "/demo/sample-sales-transcript.txt";

const FETCH_TIMEOUT_MS = 4000;

export type DemoTranscriptSource =
  | "s3-primary"
  | "s3-fallback"
  | "local"
  | "embedded";

export interface DemoTranscriptResult {
  text: string;
  source: DemoTranscriptSource;
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      mode: url.startsWith("/") ? "same-origin" : "cors",
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Load the demo sales transcript, trying primary S3 → secondary S3 → local → embedded.
 */
export async function loadDemoSalesTranscript(): Promise<DemoTranscriptResult> {
  const primary = await fetchText(DEMO_TRANSCRIPT_S3_PRIMARY);
  if (primary) return { text: primary, source: "s3-primary" };

  const secondary = await fetchText(DEMO_TRANSCRIPT_S3_FALLBACK);
  if (secondary) return { text: secondary, source: "s3-fallback" };

  const local = await fetchText(DEMO_TRANSCRIPT_LOCAL);
  if (local) return { text: local, source: "local" };

  const embedded = embeddedTranscript.trim();
  if (!embedded) {
    throw new Error("Demo sales transcript unavailable from all sources.");
  }
  return { text: embedded, source: "embedded" };
}
