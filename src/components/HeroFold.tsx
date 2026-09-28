import { useId, type ReactNode } from "react";
import HeroSampleBrief from "./HeroSampleBrief";

const BENEFITS = [
  "Find deals worth saving",
  "Understand why they're stuck",
  "Identify the real blocker",
  "Get a deal-specific recovery plan",
  "Focus sales time where it can have the most impact",
] as const;

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

export function BenefitsList() {
  return (
    <section className="marketing-reveal px-5 pb-2 sm:px-8 lg:px-10" aria-label="What you get">
      <ul className="grid gap-2">
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
    </section>
  );
}

export default function HeroFold({ onScan }: { onScan: () => void }) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="grid items-start gap-6 px-5 py-6 sm:px-8 md:grid-cols-2 md:gap-8 md:py-8 lg:gap-10 lg:px-10"
    >
      <div>
        <p className="mb-2 font-[var(--mono)] text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#3dd6c6]">
          Purpose-built stalled-deal recovery
        </p>
        <h1
          id={headingId}
          className="text-[clamp(1.7rem,2.8vw,2.65rem)] font-bold leading-[1.12] tracking-tight text-white"
        >
          Find out which stalled deals are worth saving — and exactly what to do next.
        </h1>
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
      <HeroSampleBrief onScan={onScan} />
    </section>
  );
}
