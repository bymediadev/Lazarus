import { findRedactions, redactEvidence, redactionCounts, type RedactionSpan } from "../qualifier/redact";

export type RedactionReview = {
  sourceTranscript: string;
  sourceEmail: string;
  transcript: string;
  email: string;
  transcriptSpans: RedactionSpan[];
  emailSpans: RedactionSpan[];
  confirmed: boolean;
};

export function buildRedactionReview(transcript: string, email: string): RedactionReview {
  const next = redactEvidence({ transcript, email });
  return {
    sourceTranscript: transcript,
    sourceEmail: email,
    transcript: next.transcript.text,
    email: next.email.text,
    transcriptSpans: next.transcript.spans,
    emailSpans: next.email.spans,
    confirmed: false,
  };
}

function counted(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function Highlight({ text, spans }: { text: string; spans: RedactionSpan[] }) {
  if (!text.trim() || spans.length === 0) return null;
  const nodes = [];
  let cursor = 0;
  spans.forEach((span, index) => {
    if (span.start > cursor) nodes.push(<span key={`t${index}`}>{text.slice(cursor, span.start)}</span>);
    nodes.push(
      <mark key={`m${index}`} className={`redact-mark redact-mark-${span.kind}`}>
        {text.slice(span.start, span.end)}
      </mark>
    );
    cursor = span.end;
  });
  if (cursor < text.length) nodes.push(<span key="tail">{text.slice(cursor)}</span>);
  return <p className="redact-highlight">{nodes}</p>;
}

type Props = {
  review: RedactionReview;
  fileAttached: boolean;
  onChange: (review: RedactionReview) => void;
  onUseOriginal: () => void;
};

export default function TranscriptRedaction({ review, fileAttached, onChange, onUseOriginal }: Props) {
  const counts = redactionCounts([...review.transcriptSpans, ...review.emailSpans]);
  const leftover =
    findRedactions(review.transcript).length > 0 || findRedactions(review.email).length > 0;

  return (
    <div className="redact-review">
      <p>
        Replaced {counted(counts.name, "name", "names")}, {counted(counts.company, "company", "companies")}, and{" "}
        {counted(counts.amount, "amount", "amounts")}. Edit anything that should still be hidden. The original stays in
        the box above.
      </p>
      <Highlight text={review.sourceTranscript} spans={review.transcriptSpans} />
      {review.sourceEmail.trim() && <Highlight text={review.sourceEmail} spans={review.emailSpans} />}
      <label>
        <span>Transcript that will be sent</span>
        <textarea
          rows={6}
          value={review.transcript}
          onChange={(event) => onChange({ ...review, transcript: event.target.value, confirmed: false })}
        />
      </label>
      {review.sourceEmail.trim() && (
        <label>
          <span>Email that will be sent</span>
          <textarea
            rows={4}
            value={review.email}
            onChange={(event) => onChange({ ...review, email: event.target.value, confirmed: false })}
          />
        </label>
      )}
      {leftover && <p className="redact-leftover">A name, company, or amount may still be in the text. Read it again.</p>}
      {fileAttached && (
        <p className="redact-leftover">A recording or document is still sent as the file. This step covers pasted text.</p>
      )}
      <div className="redact-choice">
        <label className="redact-check">
          <input
            type="checkbox"
            checked={review.confirmed}
            onChange={(event) => onChange({ ...review, confirmed: event.target.checked })}
          />
          Send this redacted text. The original stays in the browser.
        </label>
        <p>{review.confirmed ? "The run sends this redacted text." : "The run sends the pasted text until you check the box."}</p>
        <button type="button" className="btn-secondary" onClick={onUseOriginal}>
          Send the original instead
        </button>
      </div>
    </div>
  );
}
