import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { HERO_PRIMARY_CTA, HERO_PRIMARY_CTA_NOTE } from "../lib/cta";

const ACV_MIN = 5_000;
const ACV_MAX = 250_000;
const ACV_STEP = 1_000;
const DEALS_MIN = 10;
const DEALS_MAX = 1_000;
const STALL_MIN = 10;
const STALL_MAX = 80;
const RECOVERY_RATE = 0.15;

const BENEFITS = [
  "Find deals worth saving",
  "Understand why they're stuck",
  "Identify the real blocker",
  "Get a deal-specific recovery plan",
  "Focus sales time where it can have the most impact",
] as const;

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** Revenue leakage = annual deals × stall rate × average deal size. */
function revenueLeakage(deals: number, stallPct: number, acv: number): number {
  return deals * (stallPct / 100) * acv;
}

/** Conservative Lazarus impact: 15% of leaked revenue. */
function recoverableRevenue(leakage: number): number {
  return leakage * RECOVERY_RATE;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

function useAnimatedNumber(target: number, reduced: boolean): number {
  const [value, setValue] = useState(target);
  const valueRef = useRef(target);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }
    const from = valueRef.current;
    if (from === target) return;
    const start = performance.now();
    const duration = 180;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setValue(from + (target - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, reduced]);

  return reduced ? target : value;
}

function RangeNumberField({
  id,
  label,
  value,
  min,
  max,
  step,
  prefix,
  suffix,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  prefix?: string;
  suffix?: string;
  hint?: string;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);
  const labelId = `${id}-label`;

  const commit = (raw: string) => {
    const next = clamp(Number(raw), min, max);
    onChange(next);
    setDraft(null);
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-end justify-between gap-3">
        <label id={labelId} htmlFor={id} className="text-sm font-medium leading-snug text-slate-200">
          {label}
        </label>
        <div className="flex shrink-0 items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1">
          {prefix && (
            <span className="text-sm font-semibold text-slate-400" aria-hidden="true">
              {prefix}
            </span>
          )}
          <input
            id={id}
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={step}
            value={shown}
            autoComplete="off"
            className="w-[7.25rem] bg-transparent text-right text-sm font-semibold tabular-nums text-white outline-none"
            onChange={(e) => {
              const raw = e.target.value;
              setDraft(raw);
              if (raw.trim() === "") return;
              const n = Number(raw);
              if (!Number.isFinite(n)) return;
              onChange(clamp(n, min, max));
            }}
            onBlur={() => commit(shown)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit(shown);
              }
            }}
          />
          {suffix && (
            <span className="text-sm font-semibold text-slate-400" aria-hidden="true">
              {suffix}
            </span>
          )}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={clamp(value, min, max)}
        aria-labelledby={labelId}
        className="h-5 w-full cursor-pointer accent-[#5cdb5c]"
        onChange={(e) => {
          onChange(Number(e.target.value));
          setDraft(null);
        }}
      />
      {hint && <p className="text-xs leading-snug text-slate-400">{hint}</p>}
    </div>
  );
}

function TrustBadge({ children }: { children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-2 rounded-full border border-[#3dd6c6]/35 bg-[#3dd6c6]/10 px-3 py-1.5 text-xs font-semibold text-[#d7fff8]">
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-[#3dd6c6]" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 1.2 2.4 3.4v4.1c0 3.2 2.3 5.5 5.6 6.9 3.3-1.4 5.6-3.7 5.6-6.9V3.4L8 1.2Zm-.7 9.1L4.8 7.8l.9-.9 1.6 1.6 3-3 .9.9-3.9 3.9Z"
        />
      </svg>
      {children}
    </li>
  );
}

export default function HeroFold({ onScan }: { onScan: () => void }) {
  const [acv, setAcv] = useState(50_000);
  const [deals, setDeals] = useState(100);
  const [stallPct, setStallPct] = useState(40);
  const reducedMotion = usePrefersReducedMotion();
  const headingId = useId();
  const noteId = useId();

  const leakage = revenueLeakage(deals, stallPct, acv);
  const recoverable = recoverableRevenue(leakage);
  const animatedLeakage = useAnimatedNumber(leakage, reducedMotion);
  const animatedRecoverable = useAnimatedNumber(recoverable, reducedMotion);

  const money = (n: number) => usd.format(Math.round(n));

  return (
    <section
      aria-labelledby={headingId}
      className="grid items-start gap-6 px-5 py-6 sm:px-8 md:grid-cols-2 md:gap-8 md:py-8 lg:gap-10 lg:px-10"
    >
      <div className="max-w-xl">
        <p className="mb-2 font-[var(--mono)] text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#3dd6c6]">
          Purpose-built stalled-deal recovery
        </p>
        <h1
          id={headingId}
          className="text-[clamp(1.7rem,2.8vw,2.65rem)] font-bold leading-[1.12] tracking-tight text-white"
        >
          Find out which stalled deals are worth saving — and exactly what to do next.
        </h1>
        <ul className="mt-4 grid gap-2" aria-label="What you get">
          {BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2 text-[0.95rem] font-medium text-white">
              <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-[#7dff7d]" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M6.2 11.2 2.9 7.9l1.1-1.1 2.2 2.2 5-5 1.1 1.1-6.1 6.1Z"
                />
              </svg>
              {benefit}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm leading-relaxed text-slate-300">
          Your CRM already shows which deals have stalled. Lazarus reads the evidence and scores it
          with fixed rules, so the same deal does not get a different answer the next time you ask.
        </p>
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Secure CRM integration">
          <TrustBadge>Encrypted in transit and at rest</TrustBadge>
          <TrustBadge>HubSpot and Salesforce</TrustBadge>
          <TrustBadge>Not used to train public models</TrustBadge>
        </ul>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0c1433] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.45)] sm:p-5">
        <p className="font-[var(--mono)] text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#3dd6c6]">
          Quick business case
        </p>
        <h2 className="mt-1.5 text-lg font-semibold leading-snug text-white">
          How much pipeline could be worth recovering?
        </h2>

        <div className="mt-3 grid gap-3">
          <RangeNumberField
            id="hero-acv"
            label="Average deal size"
            value={acv}
            min={ACV_MIN}
            max={ACV_MAX}
            step={ACV_STEP}
            prefix="$"
            hint="What one opportunity is worth."
            onChange={setAcv}
          />
          <RangeNumberField
            id="hero-deals"
            label="Deals in the pipeline"
            value={deals}
            min={DEALS_MIN}
            max={DEALS_MAX}
            step={1}
            hint="Opportunities the team is working this year."
            onChange={(n) => setDeals(Math.round(n))}
          />
          <RangeNumberField
            id="hero-stall"
            label="Deals that stall"
            value={stallPct}
            min={STALL_MIN}
            max={STALL_MAX}
            step={1}
            suffix="%"
            hint="No real next step, or the close date has been pushed twice."
            onChange={(n) => setStallPct(Math.round(n))}
          />
        </div>

        <p className="sr-only" aria-live="polite">
          Stalled pipeline {money(leakage)}. Worth recovering {money(recoverable)}.
        </p>
        <div className="mt-3 grid gap-2.5 rounded-xl border border-white/10 bg-black/25 p-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              Stalled pipeline
            </p>
            <p
              className="mt-1 text-2xl font-semibold tabular-nums text-white"
              data-revenue-leakage={Math.round(leakage)}
            >
              {money(animatedLeakage)}
            </p>
            <p className="mt-1 text-sm leading-snug text-slate-400">
              {deals.toLocaleString("en-US")} deals × {stallPct}% × {money(acv)}. Sitting still.
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7dff7d]">
              Worth recovering
            </p>
            <p
              className="mt-1 text-[clamp(1.85rem,3.2vw,2.7rem)] font-extrabold leading-none tabular-nums text-[#7dff7d] drop-shadow-[0_0_22px_rgba(125,255,125,0.35)]"
              data-recoverable-revenue={Math.round(recoverable)}
            >
              {money(animatedRecoverable)}
            </p>
            <p className="mt-2 text-sm leading-snug text-slate-300">
              15% of stalled pipeline. A conservative planning baseline.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onScan}
          aria-describedby={noteId}
          className="mt-3 w-full rounded-lg border border-[#5cdb5c]/70 bg-gradient-to-b from-[#7dff7d] to-[#3da832] px-4 py-3 text-base font-bold text-[#04140a] shadow-[0_0_28px_rgba(92,219,92,0.35)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7dff7d]"
        >
          {HERO_PRIMARY_CTA}
        </button>
        <p id={noteId} className="mt-2 text-center text-sm text-slate-400">
          {HERO_PRIMARY_CTA_NOTE}
        </p>
      </div>
    </section>
  );
}
