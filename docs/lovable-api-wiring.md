# Lovable ↔ Lazarus Express API wiring

Wire the Lovable **frontend** to the external Lazarus Express API on Render.

**Latest pilot UI + Liam judgment-layer prompt:** paste from **`docs/lovable-prompt.md`**.

Production API base:

```
https://lazarus-4uxi.onrender.com
```

Published Lovable: `https://lazarusdealrescue.lovable.app`  
Preview: `https://id-preview--755d6740-c643-4b89-9add-52b90da08682.lovable.app`

---

## Env vars (Lovable project settings)

| Variable | Value | Notes |
|---|---|---|
| `VITE_API_URL` | `https://lazarus-4uxi.onrender.com` | **Required.** No trailing slash. Missing → “API not configured” / failed analysis. |
| `VITE_LAZARUS_API_KEY` | Same as Render `LAZARUS_API_KEY` | Only if Render has `LAZARUS_API_KEY` set. As of 2026-07-17 Render accepts unauthenticated post-mortem (no key enforced). Still send `X-Api-Key` when the Vite var is set. |

On Render, `FRONTEND_ORIGIN` must include Lovable domains, e.g.:

```
https://lazarus-4uxi.onrender.com,https://lazarusdealrescue.lovable.app,https://id-preview--755d6740-c643-4b89-9add-52b90da08682.lovable.app,http://localhost:5173
```

Local `.env` already lists those origins — keep Render dashboard in sync after any domain change.

### Operator checklist before a pilot

1. Lovable Settings → set `VITE_API_URL` (and key if Render locks API).
2. Rebuild / republish Lovable so Vite bakes env into the client.
3. Hit `https://lazarus-4uxi.onrender.com/api/health` — expect `status: ok`.
4. Path A: Load sample → Run Deal Analysis on published URL.
5. Optional Liam demo: Load demo history + `deal_stage=contractsent` → expect GATED pathway.

---

## 1. Create / keep `src/lib/api.ts`

```ts
export const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

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

export interface RunPostMortemInput {
  file?: File | null;
  transcript?: string;
  emailThread?: string;
  dealValue: string;
  fieldCapture?: boolean;
  accountId?: string;
  salesCycleDays?: number;
  dealStage?: string;
  historicalCrmContext?: unknown[];
  liveTranscriptPayload?: unknown[];
  liveSessionObjections?: unknown[];
}

/** POST /api/post-mortem — response is the report object directly (not { report }). */
export async function runPostMortem(input: RunPostMortemInput): Promise<Record<string, unknown>> {
  if (!API_BASE) throw new Error("API not configured");

  const formData = new FormData();
  if (input.file) formData.append("recording", input.file);
  const manual = input.transcript?.trim();
  if (manual) formData.append("transcript", manual);
  const email = input.emailThread?.trim();
  if (email) formData.append("email_thread", email);
  formData.append("deal_value", input.dealValue || "0");
  if (input.fieldCapture) formData.append("field_capture", "1");
  if (input.accountId) formData.append("account_id", input.accountId);
  if (input.salesCycleDays != null && input.salesCycleDays > 0) {
    formData.append("sales_cycle_days", String(input.salesCycleDays));
  }
  if (input.dealStage?.trim()) formData.append("deal_stage", input.dealStage.trim());
  if (input.historicalCrmContext?.length) {
    formData.append("historical_crm_context", JSON.stringify(input.historicalCrmContext));
  }
  if (input.liveTranscriptPayload?.length) {
    formData.append("live_transcript_payload", JSON.stringify(input.liveTranscriptPayload));
  }
  if (input.liveSessionObjections?.length) {
    formData.append("live_session_objections", JSON.stringify(input.liveSessionObjections));
  }

  const res = await fetch(`${API_BASE}/api/post-mortem`, {
    method: "POST",
    headers: apiAuthHeaders(),
    body: formData,
  });

  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? ((await res.json()) as Record<string, unknown> & { error?: string })
    : null;

  if (res.status === 401) throw new Error("Check VITE_LAZARUS_API_KEY");
  if (!res.ok) throw new Error(data?.error || `Post-mortem failed (${res.status}).`);
  if (!data) throw new Error(`API at ${API_BASE} returned a non-JSON response.`);
  return data;
}
```

---

## 2. Report fields Lovable must display (computed on Render)

| Field | UI |
|---|---|
| `action_brief` | What happened · What next · Who to contact |
| `buying_group_alignment` | Buying-group ALIGNED / PARTIAL / MISSING |
| `contract_readiness` | Pre-contract pathway + GATED banner |
| `proprietary_indices` | DRI / authority gap (existing) |
| `rescue_triage_plan` / `immediate_remediation` | Secondary plan |

Do **not** re-implement pathway / buying-group logic in Lovable.

---

## 3. Footer / Trust Pack

| Label | URL helper |
|---|---|
| Privacy | `trustPackUrl("privacy")` |
| Terms | `trustPackUrl("terms")` |
| DPA | `trustPackUrl("dpa")` |
| Security Overview | `trustPackUrl("security-overview")` |
| Security Battlecard | `trustPackUrl("battlecard")` |

Battlecard HTML (Liam objections, unified-contract talk track) lives on Render — Lovable only links.

---

## 4. Smoke checklist

1. Preview loads; no “API NOT CONFIGURED” when `VITE_API_URL` is set.
2. Health: `GET ${VITE_API_URL}/api/health` → `ok` (cold start can be slow).
3. Load sample → Run → Recovery Brief with `action_brief` cards.
4. Load demo history + `contractsent` → `contract_readiness.gate_status === "GATED"`.
5. Battlecard link opens Render document with Liam objections.
6. Wrong key (only if Render enforces key) → “Check VITE_LAZARUS_API_KEY”.

---

## Out of scope

Do not re-implement Zoom RTMS, live triage scoring, Gong, or Gemini in Lovable. Follow **`docs/lovable-prompt.md`** for the full UI pass.
