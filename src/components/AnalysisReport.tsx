import { useState } from "react";
import { saveRescueOutcome } from "../lib/api";
import ConciseDiagnostic from "./ConciseDiagnostic";
import {
  CausalForce,
  ForceCoupling,
  normalizeResult,
  PostMortemResult,
  TranscriptSources,
  statusTagClass,
  trajectoryTagClass,
  viabilityTagClass,
  equilibriumTagClass,
  blockerTagClass,
  forceTypeClass,
  driTagClass,
} from "../types";

interface Props {
  result: PostMortemResult;
  sources?: TranscriptSources;
}

function CrmField({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="crm-field">
      <span className="crm-label">{label}</span>
      <span className="crm-value">{value}</span>
    </div>
  );
}

function ForceCard({ force }: { force: CausalForce }) {
  const border = forceTypeClass(force.type);
  return (
    <div className={`force-card force-${border}`}>
      <div className="force-header">
        <span className={`force-type force-type-${border}`}>{force.type}</span>
        <div className="force-meta">
          {force.role && <span className="force-role">{force.role}</span>}
          <span className="force-weight">{force.weight}</span>
        </div>
      </div>
      <p className="force-factor">{force.factor}</p>
      <div className="force-bar-track">
        <div className="force-bar-fill" style={{ width: `${force.weight}%` }} />
      </div>
      {force.derived_from && force.derived_from.length > 0 && (
        <p className="force-derived">Derived from: {force.derived_from.join(", ")}</p>
      )}
      {force.evidence && (
        <p className="force-evidence">"{force.evidence.replace(/^"|"$/g, "")}"</p>
      )}
    </div>
  );
}

function CouplingList({ title, items, className }: { title: string; items: ForceCoupling[]; className: string }) {
  if (!items.length) return null;
  return (
    <div className={`coupling-group ${className}`}>
      <h4>{title}</h4>
      <ul className="restart-list">
        {items.map((c, i) => (
          <li key={i}>
            <strong>{c.source}</strong> → <strong>{c.target}</strong>: {c.mechanism}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AnalysisReport({ result: raw, sources }: Props) {
  const [copied, setCopied] = useState(false);
  const [rescueAction, setRescueAction] = useState("");
  const [rescueOutcome, setRescueOutcome] = useState("still_stalled");
  const [rescueSaved, setRescueSaved] = useState(false);
  const [rescueError, setRescueError] = useState<string | null>(null);
  const [rescueSaving, setRescueSaving] = useState(false);
  const r = normalizeResult(raw);
  const pi = r.proprietary_indices;
  const dc = r.deal_classification!;
  const plan = r.rescue_triage_plan!;
  const vs = r.viability_state!;
  const dt = r.deal_trajectory!;
  const eq = r.equilibrium_analysis!;
  const fim = r.force_interaction_map!;
  const fdg = r.force_dependency_graph!;
  const init = r.force_initialization;
  const cycles = r.resolution_cycles;
  const forces = r.causal_forces ?? [];
  const tagClass = statusTagClass(String(dc.status));
  const blockerClass = blockerTagClass(init?.blocker_classification ?? "");
  const viabilityClass = viabilityTagClass(vs.state);
  const trajectoryClass = trajectoryTagClass(dt.trajectory_type);
  const equilibriumClass = equilibriumTagClass(eq.state);

  const copyPlan = async () => {
    const sections: [string, string[]][] = [
      ["Immediate (0-30 days)", plan.immediate_0_30_days],
      ["Near-term (30-90 days)", plan.near_term_30_90_days],
      ["Long-term (90+ days)", plan.long_term_90_plus_days],
    ];
    const text = sections
      .filter(([, items]) => items.length)
      .map(([label, items]) => `${label}\n${items.map((a, i) => `${i + 1}. ${a}`).join("\n")}`)
      .join("\n\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const dc_comp = vs.derivation_components;
  const driClass = driTagClass(pi?.risk_tier);

  const submitRescueOutcome = async () => {
    if (!raw.id || !pi) return;
    setRescueSaving(true);
    setRescueError(null);
    try {
      await saveRescueOutcome(raw.id, {
        outcome: rescueOutcome,
        rescue_action_taken: rescueAction.trim(),
        proprietary_indices: pi,
        viability_score: vs.viability_score,
        trajectory_type: dt.trajectory_type,
        constraint_pressure: dc_comp.constraint_pressure,
        stakeholders: r.stakeholders,
      });
      setRescueSaved(true);
    } catch (err) {
      setRescueError(err instanceof Error ? err.message : "Failed to save outcome");
    } finally {
      setRescueSaving(false);
    }
  };

  return (
    <div className="cards">
      <ConciseDiagnostic result={r} />

      <details className="full-analysis-toggle">
        <summary>Full deterministic analysis (expand)</summary>
        <div className="full-analysis-body">
      {pi && (
        <div className={`dri-banner ${driClass}`}>
          <span className="dri-label">Deal Risk Index</span>
          <span className="dri-score">{pi.deal_risk_index}</span>
          <span className="dri-tier">{pi.risk_tier} RISK</span>
          <div className="dri-components">
            <span>Dispersion {pi.stakeholder_dispersion_index}</span>
            <span>Stall signals {pi.dialogue_stall_score}</span>
            <span>Dept friction {pi.multi_department_friction}</span>
            {pi.authority_gap_flag && <span className="dri-flag">Authority gap</span>}
            {r.buying_group_alignment && (
              <span className="dri-flag">Buying group: {r.buying_group_alignment.status}</span>
            )}
          </div>
        </div>
      )}

      <div className={`deal-status-banner ${tagClass}`}>
        <span className="deal-status-mode">Deterministic Scoring Engine</span>
        <span className="deal-status-label">{dc.status}</span>
        <div className="score-row">
          <span className={`confidence-score ${viabilityClass}`}>
            {vs.state} — emergent {vs.viability_score}
          </span>
          <span className={`confidence-score ${trajectoryClass}`}>
            Trajectory: {dt.trajectory_type}
          </span>
          <span className={`confidence-score ${equilibriumClass}`}>
            Equilibrium: {eq.state}
          </span>
          {cycles && cycles.total_cycles > 0 && (
            <span className="confidence-score">
              {cycles.total_cycles} cycles · {cycles.convergence_status}
            </span>
          )}
          {init?.blocker_classification && (
            <span className={`confidence-score ${blockerClass}`}>
              {init.blocker_classification}
            </span>
          )}
        </div>
        {r.client_name && <span className="deal-status-client">{r.client_name}</span>}
      </div>

      {sources && (
        <div className="sources-bar">
          {sources.audio && <span>Call audio transcribed</span>}
          {sources.field && <span>Field capture merged</span>}
          {sources.manual && <span>Call notes merged</span>}
          {sources.email && <span>Email thread merged</span>}
          {[sources.audio, sources.field, sources.manual, sources.email].filter(Boolean).length >= 2 && (
            <span className="sources-merged">Cross-channel stitched</span>
          )}
        </div>
      )}

      {r.grounding_audit && !r.grounding_audit.pass && (
        <div className="warning-banner" style={{ marginBottom: "1rem" }}>
          <p>
            <strong>Transcript grounding:</strong> Some claims could not be verified against the call
            text and were removed or corrected.
            {r.grounding_audit.invented_terms.length > 0 &&
              ` Template bleed blocked: ${r.grounding_audit.invented_terms.join(", ")}.`}
          </p>
        </div>
      )}

      <article className="card card-emerald">
        <h2 className="card-title">Resolution Outcome</h2>
        <div className="card-body"><p>{r.executive_summary}</p></div>
      </article>

      {r.stakeholders && r.stakeholders.length > 0 && (
        <article className="card card-neutral">
          <h2 className="card-title">People Map (Human Bottlenecks)</h2>
          <div className="card-body">
            <table className="trigger-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Authority</th>
                  <th>Persona</th>
                  <th>Verbatim Evidence</th>
                </tr>
              </thead>
              <tbody>
                {r.stakeholders.map((s, i) => (
                  <tr key={i}>
                    <td>{s.name}</td>
                    <td>{s.role || "—"}</td>
                    <td>{s.authority_level || "—"}</td>
                    <td>{s.persona_type || s.stance}</td>
                    <td className="force-evidence">"{s.evidence.replace(/^"|"$/g, "")}"</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {init && (
        <article className="card card-neutral">
          <h2 className="card-title">Force Initialization</h2>
          <div className="card-body">
            <span className={`pipeline-badge ${blockerClass}`}>{init.blocker_classification}</span>
            <p style={{ marginTop: "0.75rem" }}>{init.summary}</p>
            {init.classification_rationale && (
              <p className="meta-line">
                <strong>Type distinction:</strong> {init.classification_rationale}
              </p>
            )}
          </div>
        </article>
      )}

      {cycles && cycles.cycles.length > 0 && (
        <article className="card card-amber">
          <h2 className="card-title">Iterative Resolution Cycles</h2>
          <div className="card-body">
            <p className="meta-line" style={{ marginBottom: "0.75rem" }}>
              {cycles.convergence_summary}
            </p>
            <table className="trigger-table cycle-table">
              <thead>
                <tr>
                  <th>Cycle</th>
                  <th>Phase</th>
                  <th>Constraint</th>
                  <th>Eff. Intent</th>
                  <th>Viability</th>
                  <th>Equilibrium</th>
                  <th>State Change</th>
                </tr>
              </thead>
              <tbody>
                {cycles.cycles.map((c) => (
                  <tr key={c.cycle}>
                    <td>{c.cycle}</td>
                    <td>{c.phase}</td>
                    <td>{c.state_snapshot.constraint_pressure}</td>
                    <td>{c.state_snapshot.effective_intent}</td>
                    <td>{c.state_snapshot.viability_score}</td>
                    <td>{c.state_snapshot.equilibrium_state}</td>
                    <td>{c.state_change}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {forces.length > 0 && (
        <article className="card card-amber">
          <h2 className="card-title">Causal Forces (Coupled)</h2>
          <div className="card-body forces-grid">
            {forces.map((f, i) => (
              <ForceCard key={i} force={f} />
            ))}
          </div>
        </article>
      )}

      {(fim.amplifies.length > 0 || fim.suppresses.length > 0) && (
        <article className="card card-red">
          <h2 className="card-title">Force Interaction Map</h2>
          <div className="card-body">
            <CouplingList title="Amplifies" items={fim.amplifies} className="coupling-amplify" />
            <CouplingList title="Suppresses" items={fim.suppresses} className="coupling-suppress" />
            {fim.dependent_forces.length > 0 && (
              <div className="coupling-group coupling-dependent">
                <h4>Dependent (Not Independent)</h4>
                <ul className="restart-list">
                  {fim.dependent_forces.map((d, i) => (
                    <li key={i}>
                      <strong>{d.force}</strong> depends on <strong>{d.depends_on}</strong>: {d.relationship}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {fim.derivative_forces.length > 0 && (
              <div className="coupling-group coupling-derivative">
                <h4>Derivative Forces</h4>
                <ul className="restart-list">
                  {fim.derivative_forces.map((d, i) => (
                    <li key={i}>
                      <strong>{d.force}</strong> derived from {d.derived_from.join(", ") || "system"}: {d.derivation_logic}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </article>
      )}

      {(fdg.parent_forces.length > 0 || fdg.feedback_loops.length > 0) && (
        <article className="card card-neutral">
          <h2 className="card-title">Force Dependency Graph</h2>
          <div className="card-body">
            {fdg.parent_forces.length > 0 && (
              <div className="coupling-group">
                <h4>Parent → Child</h4>
                <ul className="restart-list">
                  {fdg.parent_forces.map((p, i) => (
                    <li key={i}>
                      <strong>{p.force}</strong> generates: {p.generates.join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(fdg.cycle_evolution ?? []).length > 0 && (
              <div className="coupling-group">
                <h4>Cycle Evolution</h4>
                <ul className="restart-list">
                  {fdg.cycle_evolution!.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </article>
      )}

      <article className={`card card-${equilibriumClass === "status-success" ? "emerald" : equilibriumClass === "status-failed" ? "red" : "amber"}`}>
        <h2 className="card-title">Equilibrium Analysis</h2>
        <div className="card-body">
          <span className={`viability-badge ${equilibriumClass}`}>{eq.state}</span>
          {eq.derived_from_cycles && (
            <span className="force-role" style={{ marginLeft: "0.5rem" }}>derived from resolution</span>
          )}
          <p style={{ marginTop: "0.75rem" }}>{eq.net_force_balance || eq.explanation}</p>
          {eq.dominating_forces.length > 0 && (
            <>
              <h4 style={{ marginTop: "0.75rem" }}>Dominating Forces</h4>
              <ul className="restart-list">
                {eq.dominating_forces.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </>
          )}
          {eq.equilibrium_breaker && (
            <p className="meta-line" style={{ marginTop: "0.75rem" }}>
              <strong>Equilibrium breaker:</strong> {eq.equilibrium_breaker}
            </p>
          )}
        </div>
      </article>

      <article className={`card card-${viabilityClass === "status-success" ? "emerald" : viabilityClass === "status-failed" ? "red" : "amber"}`}>
        <h2 className="card-title">Emergent Viability State</h2>
        <div className="card-body">
          <div className="viability-header">
            <span className={`viability-badge ${viabilityClass}`}>{vs.state}</span>
            <span className="viability-score">{vs.viability_score}/100</span>
          </div>
          <p className="equilibrium-derivation">{vs.equilibrium_derivation}</p>
          <p className="meta-line" style={{ marginTop: "0.5rem" }}>
            Frozen derivation — read-only across all sections
          </p>
          {dc_comp && (
            <div className="derivation-grid">
              <div className="derivation-metric"><span>Intent</span><strong>{dc_comp.intent_strength}</strong></div>
              <div className="derivation-metric"><span>− Constraint</span><strong>{dc_comp.constraint_pressure}</strong></div>
              <div className="derivation-metric"><span>− Structural</span><strong>{dc_comp.structural_lock_in_impact}</strong></div>
              <div className="derivation-metric"><span>+ Timing</span><strong>{dc_comp.timing_accessibility}</strong></div>
            </div>
          )}
        </div>
      </article>

      <article className="card card-neutral">
        <h2 className="card-title">Derived Trajectory</h2>
        <div className="card-body">
          <span className={`trajectory-badge ${trajectoryClass}`}>{dt.trajectory_type}</span>
          <p style={{ marginTop: "0.75rem" }}>{dt.derivation}</p>
          {dt.driving_interactions.length > 0 && (
            <>
              <h4 style={{ marginTop: "0.75rem" }}>Driving Interactions</h4>
              <ul className="restart-list">
                {dt.driving_interactions.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </>
          )}
        </div>
      </article>

      {r.buyer_state && (
        <article className="card card-neutral">
          <h2 className="card-title">Buyer State (Coupled)</h2>
          <div className="card-body">
            <div className="buyer-state-grid">
              <div className="state-metric">
                <span className="crm-label">Raw Intent</span>
                <span className="state-value">{r.buyer_state.intent_strength}</span>
              </div>
              <div className="state-metric">
                <span className="crm-label">Effective Intent</span>
                <span className="state-value">{r.buyer_state.effective_intent}</span>
              </div>
              <div className="state-metric">
                <span className="crm-label">Intent Level</span>
                <span className="state-value">
                  {r.buyer_state.evidence[0]?.split("|").at(-1)?.trim() ?? "—"}
                </span>
              </div>
              <div className="state-metric">
                <span className="crm-label">Constraint Pressure</span>
                <span className="state-value">{r.buyer_state.constraint_pressure}</span>
              </div>
              <div className="state-metric">
                <span className="crm-label">Decision Freedom</span>
                <span className="state-value">{r.buyer_state.decision_freedom}</span>
              </div>
            </div>
            {r.buyer_state.evidence.length > 0 && (
              <ul className="restart-list" style={{ marginTop: "1rem" }}>
                {r.buyer_state.evidence.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
        </article>
      )}

      {(r.reactivation_modeling ?? []).length > 0 && (
        <article className="card card-emerald">
          <h2 className="card-title">Equilibrium Shift Triggers</h2>
          <div className="card-body">
            <table className="trigger-table">
              <thead>
                <tr>
                  <th>Trigger</th>
                  <th>Probability</th>
                  <th>Equilibrium Shift</th>
                  <th>Forces Modified</th>
                  <th>Timeframe</th>
                </tr>
              </thead>
              <tbody>
                {r.reactivation_modeling!.map((t, i) => (
                  <tr key={i}>
                    <td>{t.trigger_event}</td>
                    <td>{t.probability}%</td>
                    <td>{t.equilibrium_shift}</td>
                    <td>{(t.forces_modified ?? []).join("; ") || "—"}</td>
                    <td>{t.timeframe}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      <article className="card card-emerald">
        <h2 className="card-title">Rescue Triage Plan</h2>
        <div className="card-body">
          {plan.immediate_0_30_days.length > 0 && (
            <div className="triage-bucket">
              <h4>Immediate — 0–30 Days</h4>
              <ul className="restart-list">
                {plan.immediate_0_30_days.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          )}
          {plan.near_term_30_90_days.length > 0 && (
            <div className="triage-bucket">
              <h4>Near-Term — 30–90 Days</h4>
              <ul className="restart-list">
                {plan.near_term_30_90_days.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          )}
          {plan.long_term_90_plus_days.length > 0 && (
            <div className="triage-bucket">
              <h4>Long-Term — 90+ Days</h4>
              <ul className="restart-list">
                {plan.long_term_90_plus_days.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          )}
          <button className={`copy-button ${copied ? "copied" : ""}`} onClick={copyPlan}>
            {copied ? "Copied!" : "Copy Rescue Plan"}
          </button>
        </div>
      </article>

      {r.pipeline_entry_validity && (
        <article className="card card-amber">
          <h2 className="card-title">Pipeline Entry Validity (System-Based)</h2>
          <div className="card-body">
            <span className="pipeline-badge">{r.pipeline_entry_validity.classification}</span>
            {r.pipeline_entry_validity.system_basis && (
              <p className="meta-line" style={{ marginTop: "0.75rem" }}>
                <strong>System basis:</strong> {r.pipeline_entry_validity.system_basis}
              </p>
            )}
            {r.pipeline_entry_validity.signals_missed.length > 0 && (
              <>
                <h4 style={{ marginTop: "0.75rem" }}>Signals Missed</h4>
                <ul className="restart-list">
                  {r.pipeline_entry_validity.signals_missed.map((q, i) => <li key={i}>{q}</li>)}
                </ul>
              </>
            )}
            {r.pipeline_entry_validity.stage_should_have_changed && (
              <p className="meta-line">
                <strong>Stage should have changed:</strong> {r.pipeline_entry_validity.stage_should_have_changed}
              </p>
            )}
            {r.pipeline_entry_validity.optimal_decision && (
              <p className="meta-line">
                <strong>Optimal decision:</strong> {r.pipeline_entry_validity.optimal_decision}
              </p>
            )}
          </div>
        </article>
      )}

      {r.crm_intelligence && (
        <article className="card card-neutral">
          <h2 className="card-title">CRM Intelligence Record</h2>
          <div className="card-body crm-grid">
            <CrmField label="Dominant Equilibrium Force" value={r.crm_intelligence.dominant_equilibrium_force ?? r.crm_intelligence.primary_force} />
            <CrmField label="Blocker Classification" value={r.crm_intelligence.blocker_classification ?? init?.blocker_classification} />
            <CrmField label="Structural Coupling" value={r.crm_intelligence.structural_constraint_type} />
            <CrmField label="Convergence" value={r.crm_intelligence.convergence_status ?? cycles?.convergence_status} />
            <CrmField label="Deal State" value={r.crm_intelligence.deal_state} />
            <CrmField label="Viability Score (Derived)" value={r.crm_intelligence.viability_score} />
            <CrmField label="Trajectory (Derived)" value={r.crm_intelligence.trajectory_type} />
            <CrmField label="Equilibrium State" value={r.crm_intelligence.equilibrium_state} />
            <CrmField label="Intent Strength" value={r.crm_intelligence.buyer_intent_strength} />
            <CrmField label="Effective Intent" value={r.crm_intelligence.effective_intent} />
            <CrmField label="Constraint Pressure" value={r.crm_intelligence.constraint_pressure} />
            <CrmField label="Deal Risk Index (Derived)" value={r.crm_intelligence.deal_risk_index ?? String(pi?.deal_risk_index ?? "")} />
            <CrmField label="Risk Tier" value={r.crm_intelligence.risk_tier ?? pi?.risk_tier} />
            <CrmField label="Recommended Next Action" value={r.crm_intelligence.recommended_next_action} />
          </div>
        </article>
      )}

      {pi && (
        <article className="card card-neutral">
          <h2 className="card-title">Proprietary Risk Compiler</h2>
          <div className="card-body">
            <p className="meta-line">{pi.formula}</p>
            {pi.stakeholder_dispersion.flags.length > 0 && (
              <>
                <h4 style={{ marginTop: "0.75rem" }}>Stakeholder friction flags</h4>
                <ul className="restart-list">
                  {pi.stakeholder_dispersion.flags.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </>
            )}
            {pi.dialogue_stall.flagged_patterns.length > 0 && (
              <>
                <h4 style={{ marginTop: "0.75rem" }}>Dialogue stall patterns</h4>
                <ul className="restart-list">
                  {pi.dialogue_stall.flagged_patterns.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </article>
      )}

      {pi && raw.id && (
        <article className="card card-emerald">
          <h2 className="card-title">Rescue Loop Feedback</h2>
          <div className="card-body">
            <p className="meta-line">
              Record what rescue action was taken and the outcome. Stores anonymous metadata only — no
              transcript text.
            </p>
            {rescueSaved ? (
              <p className="meta-line" style={{ marginTop: "0.75rem" }}>
                Outcome recorded. Thank you — this feeds the rescue success flywheel.
              </p>
            ) : (
              <>
                <label className="rescue-field">
                  <span>Rescue action taken</span>
                  <input
                    type="text"
                    value={rescueAction}
                    onChange={(e) => setRescueAction(e.target.value)}
                    placeholder="e.g. Sent 90-sec Loom + rescheduled Dave demo"
                  />
                </label>
                <label className="rescue-field">
                  <span>Outcome</span>
                  <select value={rescueOutcome} onChange={(e) => setRescueOutcome(e.target.value)}>
                    <option value="still_stalled">Still stalled</option>
                    <option value="closed_won">Closed won</option>
                    <option value="lost">Lost</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </label>
                {rescueError && <p className="error-text">{rescueError}</p>}
                <button
                  type="button"
                  className="btn-primary"
                  style={{ marginTop: "0.75rem" }}
                  disabled={rescueSaving || !rescueAction.trim()}
                  onClick={submitRescueOutcome}
                >
                  {rescueSaving ? "Saving…" : "Record outcome"}
                </button>
              </>
            )}
          </div>
        </article>
      )}
        </div>
      </details>
    </div>
  );
}
