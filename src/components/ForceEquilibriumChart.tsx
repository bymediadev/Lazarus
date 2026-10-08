import { useState } from "react";
import type { CausalForce } from "../types";

interface Props {
  forces: CausalForce[];
  effectiveIntent: number;
}

function nodeColor(type: string): string {
  const t = type.toLowerCase();
  if (t === "enabler" || t === "intent") return "var(--emerald)";
  if (t === "constraint") return "var(--crimson)";
  return "var(--amber)";
}

export default function ForceEquilibriumChart({ forces, effectiveIntent }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const count = Math.max(forces.length, 1);
  const cx = 220;
  const cy = 140;
  const orbit = 96;
  const selected = active !== null ? forces[active] : undefined;
  const quote = selected?.evidence?.replace(/^"|"$/g, "").trim();

  return (
    <div className="force-equilibrium">
      <svg className="force-equilibrium-svg" viewBox="0 0 440 280" role="img" aria-label="Force equilibrium">
        {forces.map((force, i) => {
          const angle = -Math.PI / 2 + (i / count) * Math.PI * 2;
          const x = cx + orbit * Math.cos(angle);
          const y = cy + orbit * Math.sin(angle);
          const r = 12 + (Math.max(0, Math.min(100, force.weight)) / 100) * 16;
          return (
            <g key={`${force.type}-${force.factor}-${i}`}>
              <line x1={cx} y1={cy} x2={x} y2={y} className="force-equilibrium-link" />
              <circle
                cx={x}
                cy={y}
                r={r}
                fill={nodeColor(force.type)}
                className="force-equilibrium-node"
                tabIndex={0}
                role="button"
                aria-label={`${force.type}: ${force.factor}`}
                aria-pressed={active === i}
                onClick={() => setActive(i)}
                onFocus={() => setActive(i)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setActive(i);
                  }
                }}
              />
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={32} className="force-equilibrium-deal" />
        <text x={cx} y={cy + 4} textAnchor="middle" className="force-equilibrium-deal-score">
          {effectiveIntent}
        </text>
      </svg>
      <p className="force-equilibrium-caption">Deal Context: Effective Buyer Intent</p>
      {selected && (
        <blockquote className="force-equilibrium-evidence">
          {quote || selected.factor}
        </blockquote>
      )}
    </div>
  );
}
