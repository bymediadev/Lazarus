import { useEffect, useState } from "react";
import { HERO_PRIMARY_CTA, HERO_PRIMARY_CTA_NOTE } from "../lib/cta";
import { usePrefersReducedMotion } from "../lib/usePrefersReducedMotion";

const BEATS = [
  {
    title: "What this deal is",
    body: (
      <>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#7dff7d]">Recoverable</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-200">
          The deal is still alive — it is not a flat no.
        </p>
      </>
    ),
  },
  {
    title: "Core blocker",
    body: (
      <>
        <p className="text-sm leading-relaxed text-slate-200">
          Procurement wants a security review. The champion has not scheduled it.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          <strong className="text-white">Detractor.</strong> The champion has not scheduled the
          security review.
        </p>
      </>
    ),
  },
  {
    title: "Next action",
    body: (
      <>
        <p className="text-sm leading-relaxed text-slate-200">
          This week (0–7 days): get the champion to book the security review.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          <strong className="text-white">Next checkpoint.</strong> Inside 30 days: send the one-pager
          they can forward internally.
        </p>
      </>
    ),
  },
] as const;

export default function HeroSampleBrief({ onScan }: { onScan: () => void }) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(reduced ? BEATS.length : 0);

  useEffect(() => {
    if (reduced) {
      setShown(BEATS.length);
      return;
    }
    setShown(0);
    const timers = BEATS.map((_, index) =>
      window.setTimeout(() => setShown(index + 1), 120 * (index + 1))
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [reduced]);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0c1433] p-4 sm:p-5">
      <p className="font-[var(--mono)] text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#3dd6c6]">
        Recovery brief
      </p>
      <h2 className="mt-1.5 text-lg font-semibold leading-snug text-white">
        Here is the shape of one recoverable deal.
      </h2>
      <div className="mt-4 grid gap-3" aria-live="polite">
        {BEATS.slice(0, shown).map((beat) => (
          <article key={beat.title} className="hero-brief-beat rounded-xl border border-white/10 bg-black/25 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              {beat.title}
            </h3>
            <div className="mt-2">{beat.body}</div>
          </article>
        ))}
      </div>
      <button
        type="button"
        onClick={onScan}
        className="mt-4 w-full rounded-lg border border-[#5cdb5c]/70 bg-gradient-to-b from-[#7dff7d] to-[#3da832] px-4 py-3 text-base font-bold text-[#04140a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7dff7d]"
      >
        {HERO_PRIMARY_CTA}
      </button>
      <p className="mt-2 text-center text-sm text-slate-400">{HERO_PRIMARY_CTA_NOTE}</p>
    </div>
  );
}
