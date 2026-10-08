interface Point {
  label: string;
  value: number;
}

interface Props {
  points: Point[];
}

const WIDTH = 440;
const HEIGHT = 200;
const PAD = { left: 36, right: 12, top: 22, bottom: 32 };

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export default function ViabilityLineChart({ points }: Props) {
  if (points.length === 0) return null;
  const series = points;
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const xAt = (index: number) =>
    series.length === 1 ? PAD.left + innerW / 2 : PAD.left + (index / (series.length - 1)) * innerW;
  const yAt = (value: number) => PAD.top + (1 - clampScore(value) / 100) * innerH;
  const line = series.map((point, index) => `${xAt(index)},${yAt(point.value)}`).join(" ");
  const summary = series.map((point) => `${point.label} ${clampScore(point.value)}`).join(", ");

  return (
    <figure className="viability-line">
      <figcaption className="viability-line-caption">Viability</figcaption>
      <svg className="viability-line-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Viability: ${summary}`}>
        {[0, 50, 100].map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={yAt(tick)}
              y2={yAt(tick)}
              className="viability-line-grid"
            />
            <text x={PAD.left - 8} y={yAt(tick) + 4} textAnchor="end" className="viability-line-axis">
              {tick}
            </text>
          </g>
        ))}
        <polyline points={line} className="viability-line-path" />
        {series.map((point, index) => {
          const x = xAt(index);
          const y = yAt(point.value);
          const score = clampScore(point.value);
          const labelY = y < PAD.top + 16 ? y + 16 : y - 10;
          return (
            <g key={`${point.label}-${index}`}>
              <circle cx={x} cy={y} r={4} className="viability-line-dot" />
              <text x={x} y={labelY} textAnchor="middle" className="viability-line-value">
                {score}
              </text>
              <text x={x} y={HEIGHT - 10} textAnchor="middle" className="viability-line-axis">
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
