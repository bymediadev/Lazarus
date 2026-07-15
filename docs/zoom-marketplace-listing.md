# Zoom App Marketplace — parked

**Status: skipped for now.** We are not submitting Lazarus to the public Zoom Marketplace.

Reason: early testing should stay low-friction (paste transcript + live mic/paste). Marketplace review adds time and compliance work without helping private end-to-end tests.

**Use instead:** [`e2e-live-meeting.md`](./e2e-live-meeting.md)  
**Zoom developer app (private OAuth / RTMS only):** [`zoom-rtms-setup.md`](./zoom-rtms-setup.md)

The draft listing copy below is kept only if we revisit publishing later.

---

<details>
<summary>Archived listing draft (do not submit yet)</summary>

## App Listing — paste these values (future)

| Field | Value |
|-------|-------|
| **App name** | Lazarus |
| **Short description** | Live deal recovery intelligence for Zoom sales calls — risk, root cause, and next action while the meeting is still running. |
| **Company name** | Lazarus Revenue Intelligence |
| **Developer contact** | privacy@lazarusrevenue.com |
| **Home URL** | `https://lazarus-4uxi.onrender.com/` |
| **Privacy Policy URL** | `https://lazarus-4uxi.onrender.com/api/trust-pack/privacy` |
| **Terms of Use URL** | `https://lazarus-4uxi.onrender.com/api/trust-pack/terms` |
| **Deauthorization Notification Endpoint** | `https://lazarus-4uxi.onrender.com/api/webhooks/zoom` |

### Scope justifications

| Scope | Justification |
|-------|----------------|
| `user:read:user` | Identify the authorizing user for connection status and deauthorization. |
| `meeting:read:meeting_transcripts` | Receive RTMS live transcript payloads for Meeting Companion. |
| `meeting:update:participant_rtms_app_status` | Required by Zoom RTMS for stream participation. |

</details>
