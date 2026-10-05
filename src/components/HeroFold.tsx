import { useId } from "react";
import { HERO_PRIMARY_CTA, HERO_PRIMARY_CTA_NOTE } from "../lib/cta";

const OUTCOMES = [
  {
    title: "Recover more existing pipeline",
    body: "A stalled deal is revenue you already started. Find the ones still worth saving.",
  },
  {
    title: "Spend time where it can still close",
    body: "See which deals deserve the next call before the forecast.",
  },
  {
    title: "Stop working a flat no",
    body: "Cut the deal that will not move, instead of carrying it another quarter.",
  },
  {
    title: "Walk in with the next conversation",
    body: "Sales leadership gets a concrete path, not another summary of the call.",
  },
] as const;

export default function HeroFold({ onScan }: { onScan: () => void }) {
  const headingId = useId();

  return (
    <section
      id="outcomes"
      aria-labelledby={headingId}
      className="px-5 py-8 sm:px-8 md:py-10 lg:px-10"
    >
      <p className="mb-2 font-[var(--mono)] text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#3dd6c6]">
        The problem
      </p>
      <p className="mb-4 max-w-2xl text-base leading-relaxed text-slate-300">
        A deal that used to clear with a few people now waits on a crowd. The CRM still shows one
        close date. It does not show who is missing, who can block it, or whether it is still worth
        the next call.
      </p>
      <h1
        id={headingId}
        className="max-w-3xl text-[clamp(1.85rem,3.2vw,2.85rem)] font-bold leading-[1.12] tracking-tight text-white"
      >
        Recover more of the pipeline you already have.
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-200">
        Lazarus helps sales teams turn stalled pipeline into recovery work you can assign. Instead
        of letting a $100,000 deal sit untouched, it tells you whether it is recoverable, what is
        blocking it, and what to do next.
      </p>
      <ul className="mt-6 grid list-none gap-3 p-0 sm:grid-cols-2" aria-label="What this changes">
        {OUTCOMES.map((item) => (
          <li key={item.title} className="rounded-2xl border border-[#3dd6c6]/30 bg-[#0c1433] p-4">
            <h2 className="text-base font-semibold leading-snug text-white">{item.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{item.body}</p>
          </li>
        ))}
      </ul>
      <button type="button" className="run-button marketing-inline-cta mt-6" onClick={onScan}>
        {HERO_PRIMARY_CTA}
      </button>
      <p className="mt-2 text-sm text-slate-400">{HERO_PRIMARY_CTA_NOTE}</p>
    </section>
  );
}
