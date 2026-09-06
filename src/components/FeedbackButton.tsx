import { FormEvent, useState } from "react";
import { API_BASE } from "../lib/api";

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          message,
          company_website: honeypot,
          page: window.location.pathname,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setStatus("error");
        setError(data.error || "Could not send. Try again.");
        return;
      }
      setStatus("sent");
      setMessage("");
    } catch {
      setStatus("error");
      setError("Could not reach the server. Try again in a moment.");
    }
  }

  return (
    <div className="feedback-widget">
      {open && (
        <div className="feedback-panel" role="dialog" aria-labelledby="feedback-title">
          <div className="feedback-panel-head">
            <h2 id="feedback-title">Feedback</h2>
            <button type="button" className="feedback-close" onClick={() => setOpen(false)} aria-label="Close">
              ×
            </button>
          </div>
          {status === "sent" ? (
            <p className="feedback-thanks">Got it. We’ll read this and use it.</p>
          ) : (
            <form onSubmit={onSubmit}>
              <p className="feedback-lead">What should we change on this site or in the product?</p>
              <label className="feedback-honeypot">
                Company website
                <input value={honeypot} onChange={(e) => setHoneypot(e.target.value)} tabIndex={-1} autoComplete="off" />
              </label>
              <label>
                Message
                <textarea
                  required
                  minLength={8}
                  maxLength={4000}
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What’s confusing, missing, or wrong?"
                />
              </label>
              <label>
                Email (optional)
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="If you want a reply"
                />
              </label>
              {error && <p className="feedback-error">{error}</p>}
              <button type="submit" className="btn-primary" disabled={status === "sending"}>
                {status === "sending" ? "Sending…" : "Send"}
              </button>
            </form>
          )}
        </div>
      )}
      <button
        type="button"
        className="feedback-launch"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          if (status === "sent") setStatus("idle");
        }}
      >
        Feedback
      </button>
    </div>
  );
}
