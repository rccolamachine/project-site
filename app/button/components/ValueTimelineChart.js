import { normalizeValueSeries } from "../buttonUtils";
import styles from "../button.module.css";

export default function ValueTimelineChart({ series, meta }) {
  const points = normalizeValueSeries(series);
  const count = points.length;

  const minValue = Math.min(...points.map((point) => point.value), 0);
  const maxValue = Math.max(...points.map((point) => point.value), 1);
  const yRange = Math.max(1, maxValue - minValue);

  const yTickValues = [maxValue, minValue + yRange / 2, minValue];
  const yTickItems = [];
  const seenTickLabels = new Set();

  for (const rawValue of yTickValues) {
    const rounded = Math.round(rawValue);
    const label = rounded.toLocaleString();
    if (seenTickLabels.has(label)) continue;
    seenTickLabels.add(label);
    yTickItems.push({ rawValue, label });
  }

  const widestTickChars = Math.max(
    1,
    ...yTickItems.map((tick) => String(tick.label || "").length),
  );

  const approxCharPx = 8;
  const width = 400;
  const height = 130;
  const padLeft = Math.max(54, 12 + widestTickChars * approxCharPx);
  const padRight = 12;
  const padTop = 12;
  const padBottom = 24;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const xAt = (idx) =>
    count <= 1 ? padLeft + plotW * 0.5 : padLeft + (idx / (count - 1)) * plotW;
  const yAt = (value) => padTop + (1 - (value - minValue) / yRange) * plotH;

  const linePath =
    count > 0
      ? points
          .map(
            (point, idx) =>
              `${idx === 0 ? "M" : "L"} ${xAt(idx)} ${yAt(point.value)}`,
          )
          .join(" ")
      : "";

  const rangeKey = String(meta?.range || "").toLowerCase();
  const includeDateOnXAxis =
    rangeKey === "24h" ||
    rangeKey === "7d" ||
    rangeKey === "30d" ||
    rangeKey === "90d" ||
    rangeKey === "1y" ||
    rangeKey === "5y" ||
    rangeKey === "all";

  const formatXAxisLabel = (tsMs) =>
    new Date(tsMs).toLocaleString([], {
      month: includeDateOnXAxis ? "short" : undefined,
      day: includeDateOnXAxis ? "numeric" : undefined,
      hour: "numeric",
      minute: "2-digit",
    });

  const firstLabel = count > 0 ? formatXAxisLabel(points[0].ms) : "--";
  const lastLabel = count > 0 ? formatXAxisLabel(points[count - 1].ms) : "--";

  const yTicks = yTickItems.map((tick) => ({
    label: tick.label,
    y: yAt(tick.rawValue),
  }));

  return (
    <div className={styles.timelineShell}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className={styles.timelineSvg}
      >
        <line
          x1={padLeft}
          x2={padLeft}
          y1={padTop}
          y2={padTop + plotH}
          stroke="rgba(255,255,255,0.24)"
          strokeWidth="1"
        />
        <line
          x1={padLeft}
          x2={width - padRight}
          y1={padTop + plotH}
          y2={padTop + plotH}
          stroke="rgba(255,255,255,0.24)"
          strokeWidth="1"
        />

        {yTicks.map((tick, idx) => (
          <g key={`ytick-${idx}`}>
            <line
              x1={padLeft}
              x2={width - padRight}
              y1={tick.y}
              y2={tick.y}
              stroke="rgba(255,255,255,0.14)"
              strokeWidth="1"
            />
            <text
              x={padLeft - 6}
              y={tick.y + 3}
              textAnchor="end"
              style={{ fill: "rgba(234,234,234,0.8)", fontSize: 9 }}
            >
              {tick.label}
            </text>
          </g>
        ))}

        {count > 0 ? (
          <path
            d={linePath}
            fill="none"
            stroke="var(--accent2)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {count > 0 ? (
          <circle
            cx={xAt(count - 1)}
            cy={yAt(points[count - 1].value)}
            r="3.2"
            fill="var(--accent2)"
            stroke="rgba(15,23,42,0.8)"
            strokeWidth="1"
          />
        ) : null}
      </svg>

      <div className={styles.timelineAxisLabels}>
        <span>{firstLabel}</span>
        <span>{lastLabel}</span>
      </div>
    </div>
  );
}
