import { FormEvent, useState } from "react";
import { CONTACT_TOPICS, sendContactNote, type ContactTopic } from "../lib/contact";
import { BOOKING_URL } from "../lib/site";

export default function ContactSection() {
  const [topic, setTopic] = useState<ContactTopic>("sales");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const hint = CONTACT_TOPICS.find((t) => t.id === topic)?.hint;
  const showBooking = topic === "sales";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendContactNote({ topic, name, email, message, company_website: honeypot });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send that note.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="marketing-page marketing-band marketing-reveal" id="contact">
      <p className="hero-trust-eyebrow">Contact</p>
      <h2>Talk to a person</h2>
      <p className="marketing-page-lead">
        Sales, support, a technical question, or product feedback. We’ll reply.
      </p>
      {sent ? (
        <div className="marketing-contact-thanks" role="status">
          <p>Received. We’ll get back to you.</p>
          {showBooking && (
            <a
              className="btn-secondary"
              href={BOOKING_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Book a 30-minute look
            </a>
          )}
        </div>
      ) : (
        <form className="marketing-contact-form" onSubmit={(e) => void onSubmit(e)}>
          <label className="login-field">
            <span>Topic</span>
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value as ContactTopic)}
              aria-describedby="contact-topic-hint"
            >
              {CONTACT_TOPICS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <span id="contact-topic-hint" className="marketing-contact-hint">
              {hint}
            </span>
          </label>
          {showBooking && (
            <p className="marketing-contact-book">
              <a
                className="btn-secondary"
                href={BOOKING_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Book a 30-minute look
              </a>
            </p>
          )}
          <label className="login-field">
            <span>Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="Your name"
            />
          </label>
          <label className="login-field">
            <span>Work email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@company.com"
            />
          </label>
          <label className="login-field marketing-contact-hp" aria-hidden="true">
            <span>Company website</span>
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </label>
          <label className="login-field">
            <span>Message</span>
            <textarea
              required
              minLength={10}
              maxLength={4000}
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What do you need?"
            />
          </label>
          {error && <div className="error-banner">{error}</div>}
          <button type="submit" className="run-button" disabled={busy}>
            {busy ? "Sending…" : "Send"}
          </button>
        </form>
      )}
    </section>
  );
}
