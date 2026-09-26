const FRICTION = [
  {
    kicker: "01",
    title: "The Post-Demo Ghost Town",
    body: "After the demo, the thread goes quiet. Lazarus reads the emails and the call and says whether you lost the internal champion, or a hidden detractor stepped in.",
  },
  {
    kicker: "02",
    title: "The Legal & Procurement Black Hole",
    body: "The deal is stuck in paperwork. Lazarus names the clause, objection, or review step in your evidence that is holding the block — not a generic “waiting on legal.”",
  },
  {
    kicker: "03",
    title: "The Budget Freeze Pivot",
    body: "The number did not move because the champion lost interest. Lazarus surfaces the line in the email or the call where the economic buyer’s priority shifted.",
  },
] as const;

const COMPARE = [
  {
    feature: "Stall identification",
    crm: "A red highlight on an old close date.",
    lazarus: "Names the stakeholder who is stalling the buying group.",
  },
  {
    feature: "Actionable next steps",
    crm: "Tells the rep to follow up.",
    lazarus: "The next action and the next checkpoint from the evidence. A longer path only if the deal needs one.",
  },
  {
    feature: "Data input reliability",
    crm: "Whatever the rep typed into the notes.",
    lazarus: "The transcript and email you attach, checked against the source.",
  },
] as const;

export function FrictionPoints() {
  return (
    <section className="marketing-reveal px-5 py-10 sm:px-8 lg:px-10" id="friction" aria-label="Deal-killing friction points">
      <h2 className="max-w-3xl text-2xl font-semibold tracking-tight text-white sm:text-[1.65rem]">
        The 3 Deal-Killing Friction Points Lazarus Isolates
      </h2>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {FRICTION.map((card) => (
          <article key={card.kicker} className="rounded-2xl border border-white/10 bg-[#0c1433] p-5">
            <p className="font-[var(--mono)] text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#3dd6c6]">
              {card.kicker}
            </p>
            <h3 className="mt-2 text-lg font-semibold leading-snug text-white">{card.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{card.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function RevenueChain() {
  return (
    <section className="marketing-reveal px-5 py-10 sm:px-8 lg:px-10" id="who" aria-label="Who it is for">
      <p className="font-[var(--mono)] text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#3dd6c6]">
        Purpose-built for one job: recovering stalled deals.
      </p>
      <h2 className="mt-3 max-w-3xl text-2xl font-semibold tracking-tight text-white sm:text-[1.65rem]">
        Sales leaders keep the forecast. Reps can run the deal in front of them.
      </h2>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-300">
        Same product either way. It sits on the recorder and CRM you already use. A person still
        runs the deal.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-[#3dd6c6]/40 bg-[#0c1433] p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#3dd6c6]">
            For sales leaders
          </p>
          <h3 className="mt-2 text-xl font-semibold leading-snug text-white">
            Recover stalled pipeline across your team.
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            See which rep-owned deals will close, which are recoverable, and which are a flat no
            before the forecast call.
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-[#0c1433] p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            For sales reps / agents
          </p>
          <h3 className="mt-2 text-xl font-semibold leading-snug text-white">
            Get a second set of eyes on the deal you&apos;re personally trying to save.
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            Drop the transcript or email on that one deal. Five free analyses a month. You still
            decide the next move.
          </p>
        </article>
      </div>
      <p className="mt-5 max-w-3xl text-sm leading-relaxed text-slate-300">
        You could prompt a general AI to analyze a stalled deal. Lazarus is purpose-built to make
        stalled-deal recovery a repeatable process.
      </p>
    </section>
  );
}

export function CrmComparison() {
  return (
    <section className="marketing-reveal px-5 py-10 sm:px-8 lg:px-10" id="vs-crm" aria-label="Lazarus compared with a CRM">
      <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-[1.65rem]">
        Why Traditional CRMs Fall Short
      </h2>
      <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-300">
        Your CRM can flag that a deal is inactive. Lazarus isolates the why, then gives the next
        action, the next checkpoint, and a longer path only when the evidence needs one.
      </p>
      <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
        <div className="hidden grid-cols-[1.05fr_1fr_1.25fr] bg-white/5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 md:grid">
          <div className="px-4 py-3"> </div>
          <div className="px-4 py-3">Your CRM</div>
          <div className="px-4 py-3 text-[#7dff7d]">Lazarus</div>
        </div>
        {COMPARE.map((row) => (
          <div
            key={row.feature}
            className="grid gap-2 border-t border-white/10 px-4 py-4 first:border-t-0 md:grid-cols-[1.05fr_1fr_1.25fr] md:gap-0 md:px-0 md:py-0 md:first:border-t"
          >
            <p className="font-semibold text-white md:px-4 md:py-4">{row.feature}</p>
            <p className="text-sm leading-relaxed text-slate-400 md:px-4 md:py-4">
              <span className="font-semibold text-slate-500 md:hidden">CRM · </span>
              {row.crm}
            </p>
            <p className="text-sm font-medium leading-relaxed text-[#d7fff8] md:bg-[#7dff7d]/5 md:px-4 md:py-4">
              <span className="font-semibold text-[#7dff7d] md:hidden">Lazarus · </span>
              {row.lazarus}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
