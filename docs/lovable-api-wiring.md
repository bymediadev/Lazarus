# Lovable ↔ Lazarus Express API wiring

Wire the Lovable **frontend** to the external Lazarus Express API on Render.

**Latest pilot UI prompt (Path A / Path B self-serve guide):** paste from **`docs/lovable-prompt.md`**.

Production API base (default):

```
https://lazarus-4uxi.onrender.com
```

---

## Env vars (Lovable project settings)

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://lazarus-4uxi.onrender.com` (no trailing slash) |
| `VITE_LAZARUS_API_KEY` | Same value as Render `LAZARUS_API_KEY` |

On Render, ensure `FRONTEND_ORIGIN` includes the Lovable preview/publish domain(s), e.g.:

```
https://lazarus-4uxi.onrender.com,https://YOUR-LOVABLE-APP.lovable.app,http://localhost:5173
```

Also keep production CORS happy for the Lovable origin after publish.

---

## 1. Create `src/lib/api.ts`

```ts
export const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

/** Sent as X-Api-Key when VITE_LAZARUS_API_KEY is set (must match server LAZARUS_API_KEY). */
export function apiAuthHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = {};
  const key = (import.meta.env.VITE_LAZARUS_API_KEY ?? "").trim();
  if (key) headers["X-Api-Key"] = key;
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

export type TrustPackSlug =
  | "privacy"
  | "terms"
  | "dpa"
  | "security-overview"
  | "battlecard";

export function trustPackUrl(slug: TrustPackSlug): string {
  return `${API_BASE}/api/trust-pack/${slug}`;
}

export async function checkHealth(): Promise<{
  status: string;
  gemini?: boolean;
  assemblyai?: boolean;
  supabase?: boolean;
  zoom?: boolean;
}> {
  const res = await fetch(`${API_BASE}/api/health`);
  return res.json();
}

export interface RunPostMortemInput {
  file?: File | null;
  transcript?: string;
  dealValue: string;
}

/** POST /api/post-mortem — response is the report object directly (not { report }). */
export async function runPostMortem(input: RunPostMortemInput): Promise<Record<string, unknown>> {
  if (!API_BASE) {
    throw new Error("API not configured");
  }

  const formData = new FormData();
  if (input.file) formData.append("recording", input.file);
  const manual = input.transcript?.trim();
  if (manual) formData.append("transcript", manual);
  formData.append("deal_value", input.dealValue || "0");

  const res = await fetch(`${API_BASE}/api/post-mortem`, {
    method: "POST",
    headers: apiAuthHeaders(),
    body: formData,
  });

  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? ((await res.json()) as Record<string, unknown> & { error?: string })
    : null;

  if (res.status === 401) {
    throw new Error("Check VITE_LAZARUS_API_KEY");
  }

  if (!res.ok) {
    throw new Error(data?.error || `Post-mortem failed (${res.status}).`);
  }

  if (!data) {
    throw new Error(`API at ${API_BASE} returned a non-JSON response.`);
  }

  return data;
}
```

---

## 2. Update `src/routes/index.tsx` (API calls only)

### Replace analyze call

- Replace `fetch("/api/analyze")` with `runPostMortem({ file, transcript, dealValue })`.
- API returns the **report object directly** (not wrapped in `{ report }`).
- Do **not** unwrap `.report`.

### Audio tab

- If the user has **both** a recording and a transcript, send **both**.
- The Express API merges them server-side.

### Health

- On mount, poll `checkHealth()`.
- When `status === "ok"`, show **"Engine online"**.
- If `VITE_API_URL` is unset / `API_BASE` empty, show **"API not configured"**.

### Errors & warnings

- On **401**, show **"Check VITE_LAZARUS_API_KEY"**.
- If the response includes `warnings[]`, render them as **amber banners above the report**.

### Do not touch

- Visual design / layout / styling.
- The local `/api/analyze` route can remain in the project but **must not be called**.

---

## 3. Footer Trust Pack links

Point footer links at the external API Trust Pack URLs and open in a new tab:

| Label | Call |
|---|---|
| Privacy | `trustPackUrl("privacy")` |
| Terms | `trustPackUrl("terms")` |
| DPA | `trustPackUrl("dpa")` |
| Security Overview | `trustPackUrl("security-overview")` |
| Security Battlecard | `trustPackUrl("battlecard")` |

Example:

```tsx
<a href={trustPackUrl("privacy")} target="_blank" rel="noopener noreferrer">
  Privacy Policy
</a>
```

---

## 4. Smoke checklist (after wiring)

1. Lovable preview loads without changing the look.
2. Health shows **Engine online** (Render may sleep cold — first hit can be slow).
3. Paste a fixture transcript → Run Analysis → report renders.
4. With API key locked on Render, wrong key → **Check VITE_LAZARUS_API_KEY**.
5. Footer trust links open Render `/api/trust-pack/*` documents.

---

## Out of scope for basic API wiring

For a wiring-only pass, do not re-implement Zoom RTMS, live triage, Gong, or scoring in Lovable.

For the **pilot-ready UI pass**, follow **`docs/lovable-prompt.md`** instead (DemoTestGuide + Path A/B + simplified Live Meeting) — still no second analysis engine; Express remains the brain.

---

## Integration roadmap (same pipeline later)

| Episode | Sources | Still goes through |
|---|---|---|
| Today | Zoom live / OAuth | Express API |
| Tomorrow | Google Meet + Teams scaffolds | Express API |
| Wednesday | Gong + Otter import | Express → `/api/post-mortem` |

When those land on Express, Lovable only needs new thin API helpers — not a second brain.
