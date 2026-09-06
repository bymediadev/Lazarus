# $0 LLM failover (Gemini → OpenRouter)

When Gemini is 429, 503, or down, Lazarus tries **OpenRouter `:free` models** next. Scoring stays local.

Do **not** commit keys. Paste them into local `.env` and the Render Dashboard only.

## What to use (no spend)

**OpenRouter** is the $0 spare. You already have a local `OPENROUTER_API_KEY`. Add the same key on Render.

Skip:

- **Cerebras** — paid / card required. Code will use a key if one exists; do not sign up for it on this budget.
- **Groq** — GitHub login can loop. Optional only.
- **GitHub Models** — retired July 2026.

Keep `GEMINI_API_KEY`. When Google is up, **signed-in** analyses still try Gemini first.

**The 5 free runs** (no signup, or Free plan): **OpenRouter only.** Gemini is not called, so those analyses still run when Google is down. Paid plans stay Gemini-first, with OpenRouter as failover.

## Render env

```
GEMINI_API_KEY=...
OPENROUTER_API_KEY=...
```

After saving, wait for the service to restart. `/api/health` should show `"openrouter": true`.

Optional model overrides (comma-separated):

```
OPENROUTER_MODEL_AUTOPSY=meta-llama/llama-3.3-70b-instruct:free,mistralai/mistral-small-3.1-24b-instruct:free
OPENROUTER_MODEL_LIVE=meta-llama/llama-3.1-8b-instruct:free,mistralai/mistral-small-3.1-24b-instruct:free
```

Do **not** use `openrouter/free` (thinking models break JSON).

## What uses which models

| Job | Paid (Gemini if up) | 5 free runs |
|-----|---------------------|-------------|
| Full post-mortem | Flash / Pro / 3.1 Pro by plan | OpenRouter `:free` only |
| Relevance gate, live triage, objections | Flash | OpenRouter small `:free` only |

## Honest limits

- Failover quality is weaker than Gemini 2.5 Pro / 3.1 Pro. Grounding still strips invented forces.
- OpenRouter `:free` can 429. Coverage is “works most of the time,” not an SLA.
- Rotate any key that was pasted into chat.

## Local

```bash
cp .env.example .env
# add GEMINI_API_KEY and OPENROUTER_API_KEY
npm run dev
```
