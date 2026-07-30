import { useMemo, useState } from "react";
import {
  computePipelineLeak,
  DEFAULT_PIPELINE_INPUTS,
  formatNum,
  formatUsd,
  type PipelineLeakInputs,
} from "../lib/pipelineLeakCalc";

function Field({
  id,
  label,
  value,
  onChange,
  suffix,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
}) {
  return (
    <div className="leak-field">
      <label htmlFor={id}>{label}</label>
      <div className="leak-field-input-wrap">
        <input
          id={id}
          type="number"
          min={0}
          step={suffix === "%" ? 0.1 : 1}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        />
        {suffix && <span className="leak-field-suffix">{suffix}</span>}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
  sub,
}: {
  label: string;
  value: string;
  tone?: "leak" | "rescue" | "neutral";
  sub?: string;
}) {
  return (
    <div className={`leak-metric leak-metric-${tone}`}>
      <span className="leak-metric-label">{label}</span>
      <span className="leak-metric-value">{value}</span>
      {sub && <span className="leak-metric-sub">{sub}</span>}
    </div>
  );
}

export default function PipelineLeakCalculator({ embedded = false }: { embedded?: boolean }) {
  const [inputs, setInputs] = useState<PipelineLeakInputs>(DEFAULT_PIPELINE_INPUTS);

  const set = <K extends keyof PipelineLeakInputs>(key: K, value: PipelineLeakInputs[K]) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  };

  const r = useMemo(() => computePipelineLeak(inputs), [inputs]);
  const rescuePct = inputs.rescueRate ?? 10;

  const funnelSteps = [
    { label: "Outreach", count: inputs.totalCalls, pct: 100 },
    {
      label: "Conversations",
      count: r.totalConversations,
      pct: inputs.totalCalls ? (r.totalConversations / inputs.totalCalls) * 100 : 0,
    },
    {
      label: "Meetings",
      count: r.totalMeetings,
      pct: inputs.totalCalls ? (r.totalMeetings / inputs.totalCalls) * 100 : 0,
    },
    {
      label: "Closed won",
      count: r.dealsClosed,
      pct: inputs.totalCalls ? (r.dealsClosed / inputs.totalCalls) * 100 : 0,
    },
  ];

  return (
    <section
      className={`pipeline-leak-calc${embedded ? " pipeline-leak-calc-embedded" : ""}`}
      id={embedded ? undefined : "pipeline-leak-calculator"}
    >
      <div className="pipeline-leak-header">
        {!embedded && (
          <span className="pipeline-leak-eyebrow">Pipeline Leak Calculator</span>
        )}
        <h2>{embedded ? "Pipeline leak model" : "See where revenue dies — and what Lazarus Deal Recovery rescues"}</h2>
        <p>
          Model your outbound funnel leaks, then quantify company revenue and rep commission
          recovered when automation saves {rescuePct}% of stalled conversations and meetings.
        </p>
      </div>

      <div className="pipeline-leak-grid">
        <div className="pipeline-leak-inputs card card-neutral">
          <h3 className="card-title">Your funnel inputs</h3>
          <div className="leak-input-grid">
            <Field
              id="plc-deal-size"
              label="Average deal size"
              value={inputs.dealSize}
              onChange={(n) => set("dealSize", n)}
              suffix="$"
            />
            <Field
              id="plc-commission"
              label="Rep commission"
              value={inputs.commissionPct}
              onChange={(n) => set("commissionPct", n)}
              suffix="%"
            />
            <Field
              id="plc-staff"
              label="Sales staff on floor"
              value={inputs.salesStaffCount}
              onChange={(n) => set("salesStaffCount", Math.max(1, Math.round(n)))}
            />
            <Field
              id="plc-calls"
              label="Outreach per rep"
              value={inputs.totalCalls}
              onChange={(n) => set("totalCalls", n)}
            />
            <Field
              id="plc-pickup"
              label="Pickup / response rate"
              value={inputs.pickupPct}
              onChange={(n) => set("pickupPct", n)}
              suffix="%"
            />
            <Field
              id="plc-meeting"
              label="Meeting booking rate"
              value={inputs.meetingPct}
              onChange={(n) => set("meetingPct", n)}
              suffix="%"
            />
            <Field
              id="plc-close"
              label="Closed-won rate (from meetings)"
              value={inputs.closePct}
              onChange={(n) => set("closePct", n)}
              suffix="%"
            />
          </div>
        </div>

        <div className="pipeline-leak-visual card card-amber">
          <h3 className="card-title">Funnel leak map</h3>
          <div className="leak-funnel">
            {funnelSteps.map((step, i) => (
              <div key={step.label} className="leak-funnel-step">
                <div className="leak-funnel-bar-track">
                  <div
                    className="leak-funnel-bar-fill"
                    style={{ width: `${Math.max(step.pct, 2)}%` }}
                  />
                </div>
                <div className="leak-funnel-meta">
                  <span>{step.label}</span>
                  <span>{formatNum(step.count, step.count < 10 ? 1 : 0)}</span>
                </div>
                {i < funnelSteps.length - 1 && (
                  <div className="leak-funnel-drop">
                    ↓ leak{" "}
                    {i === 0
                      ? formatNum(r.lostConversations, 1)
                      : formatNum(r.lostMeetings, 1)}{" "}
                    {i === 0 ? "unbooked conversations" : "unclosed meetings"}
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="leak-funnel-total">
            <strong>{formatNum(r.totalLeakedDeals, 1)}</strong> leaked per rep ·{" "}
            <strong>{formatNum(r.teamLeakedDeals, 1)}</strong> across{" "}
            {r.salesStaffCount} reps ({formatNum(r.teamOutreach, 0)} total outreach)
          </p>
        </div>

        <div className="pipeline-leak-outputs">
          <Metric
            label="Value per call (per rep)"
            value={formatUsd(r.valuePerCall)}
            sub={`${formatUsd(r.totalCommission)} commission per rep ÷ ${inputs.totalCalls.toLocaleString()} calls`}
          />
          <Metric
            label={`Floor leaked deals (${r.salesStaffCount} reps)`}
            value={formatNum(r.teamLeakedDeals, 1)}
            tone="leak"
            sub={`${formatNum(r.totalLeakedDeals, 1)} per rep · ${formatNum(r.lostConversations, 1)} + ${formatNum(r.lostMeetings, 1)} leak types`}
          />
          <Metric
            label={`Floor rescue — company revenue (${rescuePct}%)`}
            value={formatUsd(r.teamRevenueSaved)}
            tone="rescue"
            sub={`${formatUsd(r.revenueSaved)} per rep × ${r.salesStaffCount} staff`}
          />
          <Metric
            label={`Floor rescue — rep commission (${rescuePct}%)`}
            value={formatUsd(r.teamCommissionSaved)}
            tone="rescue"
            sub={`${formatUsd(r.commissionSaved)} per rep · ${formatUsd(r.teamTotalCommission)} total commission pool`}
          />
        </div>
      </div>
    </section>
  );
}
