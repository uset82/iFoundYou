import { useMemo } from 'react';
import './EWSMiniChart.css';

interface HistoryPoint {
  timestamp: string;
  count: number;
  expected?: number;
}

interface EWSMiniChartProps {
  history: HistoryPoint[];
  height?: number;
}

export default function EWSMiniChart({ history, height = 80 }: EWSMiniChartProps) {
  const chartData = useMemo(() => {
    if (!history || history.length < 2) return null;

    const width = 280;
    const padding = { top: 8, right: 8, bottom: 20, left: 36 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;

    const counts = history.map((h) => h.count);
    const expectedValues = history
      .map((h) => h.expected)
      .filter((v): v is number => v !== undefined);

    const allValues = [...counts, ...expectedValues];
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const range = maxVal - minVal || 1;

    const xScale = (i: number) =>
      padding.left + (i / (history.length - 1)) * innerWidth;
    const yScale = (v: number) =>
      padding.top + innerHeight - ((v - minVal) / range) * innerHeight;

    const countPath = history
      .map((h, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(h.count)}`)
      .join(' ');

    const expectedPath = history
      .filter((h) => h.expected !== undefined)
      .map((h, i) => `${i === 0 ? 'M' : 'L'} ${xScale(history.indexOf(h))} ${yScale(h.expected!)}`)
      .join(' ');

    // Y-axis ticks
    const tickCount = 3;
    const yTicks = Array.from({ length: tickCount }, (_, i) => {
      const val = minVal + (range * i) / (tickCount - 1);
      return { value: Math.round(val), y: yScale(val) };
    });

    return { width, countPath, expectedPath, yTicks, padding };
  }, [history, height]);

  if (!chartData) {
    return (
      <div className="ews-mini-chart ews-mini-chart--empty">
        <span className="muted">No history available</span>
      </div>
    );
  }

  return (
    <div className="ews-mini-chart">
      <svg
        viewBox={`0 0 ${chartData.width} ${height}`}
        className="ews-mini-chart__svg"
        preserveAspectRatio="none"
      >
        {/* Y-axis labels */}
        {chartData.yTicks.map((tick) => (
          <g key={tick.value}>
            <line
              x1={chartData.padding.left}
              y1={tick.y}
              x2={chartData.width - chartData.padding.right}
              y2={tick.y}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="0.5"
            />
            <text
              x={chartData.padding.left - 4}
              y={tick.y + 3}
              textAnchor="end"
              fill="var(--muted)"
              fontSize="8"
            >
              {tick.value}
            </text>
          </g>
        ))}

        {/* Expected baseline */}
        {chartData.expectedPath && (
          <path
            d={chartData.expectedPath}
            fill="none"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        )}

        {/* Actual count line */}
        <path
          d={chartData.countPath}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      <div className="ews-mini-chart__legend">
        <span className="ews-mini-chart__legend-item">
          <span className="ews-mini-chart__legend-line ews-mini-chart__legend-line--actual" />
          Actual
        </span>
        <span className="ews-mini-chart__legend-item">
          <span className="ews-mini-chart__legend-line ews-mini-chart__legend-line--expected" />
          Expected
        </span>
      </div>
    </div>
  );
}
