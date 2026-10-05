import { useState } from "react";
import { STALLED_DEAL_SERIES, loomEmbedUrl } from "../lib/site";

const STEPS = [
  {
    label: "Input",
    body: "The call or email they already have.",
  },
  {
    label: "What Lazarus sees",
    body: "A key person is missing, or procurement is the bottleneck.",
  },
  {
    label: "What they do next",
    body: "The conversation this week.",
  },
  {
    label: "What it changes",
    body: "Keep it on the forecast, or stop carrying it.",
  },
] as const;

export default function StallWalkthrough() {
  const episode = STALLED_DEAL_SERIES.find((item) => item.id === "week-2");
  const [playing, setPlaying] = useState(false);

  if (!episode) return null;

  return (
    <section className="marketing-simple marketing-reveal" id="how" aria-label="How a missing person stalls a deal">
      <h2>{episode.title}</h2>
      <p>A bigger buying group is a missing-person story.</p>
      <div className="series-layout">
        <div className="series-player-frame">
          {playing ? (
            <iframe
              className="series-player-swap"
              src={loomEmbedUrl(episode.loomId)}
              title={episode.title}
              allow="fullscreen; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <button type="button" className="series-poster" onClick={() => setPlaying(true)}>
              <span className="series-poster-kicker">Week 2</span>
              <span className="series-poster-title">{episode.title}</span>
              <span className="series-poster-play">Play</span>
            </button>
          )}
        </div>
        <ol className="stall-steps">
          {STEPS.map((step, index) => (
            <li key={step.label}>
              <span>{index + 1}</span>
              <h3>{step.label}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
