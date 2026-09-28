import { useState } from "react";
import { HERO_PRIMARY_CTA, HERO_PRIMARY_CTA_NOTE } from "../lib/cta";
import { STALLED_DEAL_SERIES, loomEmbedUrl, type StalledDealEpisode } from "../lib/site";

function verdictLabel(verdict: StalledDealEpisode["verdict"]): string {
  return verdict === "flat-no" ? "Flat no" : "Recoverable";
}

export default function StalledDealSeries({ onScan }: { onScan: () => void }) {
  const episodes = STALLED_DEAL_SERIES;
  const latest = episodes[0];
  const [activeId, setActiveId] = useState(latest?.id ?? "");
  const [playing, setPlaying] = useState(false);
  const active = episodes.find((episode) => episode.id === activeId) ?? latest;
  const older = episodes.filter((episode) => episode.id !== active?.id);

  if (!active) return null;

  return (
    <section className="marketing-simple marketing-reveal" id="see" aria-label="This week's stalled deal">
      <p className="font-[var(--mono)] text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#3dd6c6]">
        {active.week}
      </p>
      <h2>This week’s stalled deal</h2>
      <p>{active.situation}</p>
      <div className="series-layout">
        <div className="series-player-frame">
          {playing ? (
            <iframe
              key={active.loomId}
              className="series-player-swap"
              src={loomEmbedUrl(active.loomId)}
              title={active.title}
              allow="fullscreen; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <button type="button" className="series-poster" onClick={() => setPlaying(true)}>
              <span className="series-poster-kicker">{verdictLabel(active.verdict)}</span>
              <span className="series-poster-title">{active.title}</span>
              <span className="series-poster-play">Play</span>
            </button>
          )}
        </div>
        <article className="series-facts">
          <p className="series-verdict">{verdictLabel(active.verdict)}</p>
          <h3>{active.title}</h3>
          <p>
            <strong>What the evidence showed.</strong> {active.situation}
          </p>
          <p>
            <strong>Blocker.</strong> {active.blocker}
          </p>
          <p>
            <strong>Next action.</strong> {active.nextAction}
          </p>
        </article>
      </div>
      <button type="button" className="run-button marketing-inline-cta series-cta" onClick={onScan}>
        {HERO_PRIMARY_CTA}
      </button>
      <p className="series-cta-note">{HERO_PRIMARY_CTA_NOTE}</p>
      {older.length > 0 && (
        <div className="series-older" role="list">
          {older.map((episode) => (
            <button
              key={episode.id}
              type="button"
              role="listitem"
              className="series-older-card"
              aria-pressed={episode.id === active.id}
              onClick={() => setActiveId(episode.id)}
            >
              <span>{episode.week}</span>
              <strong>{episode.title}</strong>
              <em>{verdictLabel(episode.verdict)}</em>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
