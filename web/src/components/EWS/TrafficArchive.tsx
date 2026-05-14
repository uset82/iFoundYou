import { useMemo, useState } from 'react';
import type { HistoryPoint } from '../../lib/ews';
import './TrafficArchive.css';

interface TrafficArchiveProps {
  fullArchive: HistoryPoint[];
  cohortColor?: string;
}

type WindowOption = '3d' | '1w' | '1m';

const WINDOWS: { id: WindowOption; label: string; days: number }[] = [
  { id: '3d', label: '3 days', days: 3 },
  { id: '1w', label: '1 week', days: 7 },
  { id: '1m', label: '1 month', days: 30 },
];

const CHART_WIDTH = 720;
const CHART_HEIGHT = 280;
const LEVEL_HEIGHT = 150;
const MARGIN = { top: 18, right: 20, bottom: 38, left: 58 };
const GRID_COLOR = 'rgba(255, 255, 255, 0.16)';
const LABEL_COLOR = '#c7d2e0';
const BAND_FILL = 'rgba(148, 163, 184, 0.24)';
const LEVEL_FILL = 'rgba(79, 140, 255, 0.18)';

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatRangeDate(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TrafficArchive({ fullArchive, cohortColor = '#0000ee' }: TrafficArchiveProps) {
  const [windowOption, setWindowOption] = useState<WindowOption>('3d');

  const windowConfig = WINDOWS.find((w) => w.id === windowOption)!;

  const filtered = useMemo(() => {
    if (!fullArchive || fullArchive.length === 0) return [];
    const cutoff = Date.now() - windowConfig.days * 24 * 60 * 60 * 1000;
    return fullArchive.filter((h) => new Date(h.timestamp).getTime() >= cutoff);
  }, [fullArchive, windowConfig.days]);

  const chart = useMemo(() => {
    if (filtered.length < 2) return null;

    const innerWidth = CHART_WIDTH - MARGIN.left - MARGIN.right;
    const innerHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
    const levelInnerHeight = LEVEL_HEIGHT - MARGIN.top - MARGIN.bottom;

    const timestamps = filtered.map((h) => new Date(h.timestamp).getTime());
    const counts = filtered.map((h) => h.count);
    const expected = filtered.map((h) => h.expected ?? h.count);
    const stdDevs = filtered.map((h) => h.stdDev ?? 0);
    const levels = filtered.map((h) => h.emergencyLevel ?? 1);

    const minTs = timestamps[0];
    const maxTs = timestamps[timestamps.length - 1];

    const minCount = 0;
    const maxCount = Math.max(...counts, ...expected.map((e, i) => e + stdDevs[i])) * 1.05;

    const xScale = (ts: number) => MARGIN.left + ((ts - minTs) / (maxTs - minTs || 1)) * innerWidth;
    const yScale = (v: number) => MARGIN.top + innerHeight - ((v - minCount) / (maxCount - minCount || 1)) * innerHeight;

    const yLevelScale = (v: number) => MARGIN.top + levelInnerHeight - ((v - 1) / 4) * levelInnerHeight;

    // Prediction band (expected ± stdDev)
    const bandUpperPath = filtered
      .map((_, i) => `${i === 0 ? 'M' : 'L'} ${xScale(timestamps[i])} ${yScale(expected[i] + stdDevs[i])}`)
      .join(' ');

    const bandLowerPath = filtered
      .slice()
      .reverse()
      .map((_, i) => {
        const idx = filtered.length - 1 - i;
        return `L ${xScale(timestamps[idx])} ${yScale(Math.max(0, expected[idx] - stdDevs[idx]))}`;
      })
      .join(' ');

    const bandPath = `${bandUpperPath} ${bandLowerPath} Z`;

    // Actual count line
    const countPath = filtered
      .map((_, i) => `${i === 0 ? 'M' : 'L'} ${xScale(timestamps[i])} ${yScale(counts[i])}`)
      .join(' ');

    const expectedPath = filtered
      .map((_, i) => `${i === 0 ? 'M' : 'L'} ${xScale(timestamps[i])} ${yScale(expected[i])}`)
      .join(' ');

    // Emergency level area chart
    const levelArea = filtered
      .map((_, i) => `${i === 0 ? 'M' : 'L'} ${xScale(timestamps[i])} ${yLevelScale(levels[i])}`)
      .join(' ') + ` L ${xScale(maxTs)} ${MARGIN.top + levelInnerHeight} L ${xScale(minTs)} ${MARGIN.top + levelInnerHeight} Z`;

    const levelLine = filtered
      .map((_, i) => `${i === 0 ? 'M' : 'L'} ${xScale(timestamps[i])} ${yLevelScale(levels[i])}`)
      .join(' ');

    // Y-axis ticks for traffic
    const yTickCount = 5;
    const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) => {
      const v = (maxCount * i) / yTickCount;
      return { value: Math.round(v / 100) * 100, y: yScale(v) };
    });

    // X-axis day ticks
    const dayTicks: number[] = [];
    const startDate = new Date(minTs);
    startDate.setHours(0, 0, 0, 0);
    let current = startDate.getTime();
    while (current <= maxTs) {
      if (current >= minTs) dayTicks.push(current);
      current += 24 * 60 * 60 * 1000;
    }

    return {
      bandPath,
      countPath,
      expectedPath,
      levelArea,
      levelLine,
      yTicks,
      dayTicks,
      xScale,
      yScale,
      yLevelScale,
      minTs,
      maxTs,
    };
  }, [filtered]);

  if (filtered.length < 2) {
    return (
      <div className="ews-archive">
        <div className="ews-archive__empty">No archive data available</div>
      </div>
    );
  }

  const minTimestamp = chart!.minTs;
  const maxTimestamp = chart!.maxTs;

  return (
    <div className="ews-archive">
      <div className="ews-archive__header">
        <h3 className="ews-archive__title">Traffic Archive</h3>
        <div className="ews-archive__date-range">
          {formatRangeDate(minTimestamp)} to {formatRangeDate(maxTimestamp)}
        </div>
      </div>

      <div className="ews-archive__controls">
        <div className="ews-archive__windows">
          {WINDOWS.map((w) => (
            <label
              key={w.id}
              className={`ews-archive__radio ${windowOption === w.id ? 'is-active' : ''}`}
            >
              <input
                type="radio"
                name="ews-archive-window"
                checked={windowOption === w.id}
                onChange={() => setWindowOption(w.id)}
              />
              {w.label}
            </label>
          ))}
        </div>
        <div className="ews-archive__legend" aria-label="Traffic archive legend">
          <span className="ews-archive__legend-item">
            <span
              className="ews-archive__legend-line"
              style={{ backgroundColor: cohortColor }}
              aria-hidden="true"
            />
            Observed
          </span>
          <span className="ews-archive__legend-item">
            <span className="ews-archive__legend-dash" aria-hidden="true" />
            Expected
          </span>
          <span className="ews-archive__legend-item">
            <span className="ews-archive__legend-band" aria-hidden="true" />
            Expected range
          </span>
        </div>
      </div>

      <div className="ews-archive__chart-wrap">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="ews-archive__svg"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Grid lines */}
          {chart!.yTicks.map((tick) => (
            <g key={`y-${tick.value}`}>
              <line
                x1={MARGIN.left}
                y1={tick.y}
                x2={CHART_WIDTH - MARGIN.right}
                y2={tick.y}
                stroke={GRID_COLOR}
                strokeWidth="0.8"
              />
              <text
                x={MARGIN.left - 6}
                y={tick.y + 4}
                textAnchor="end"
                fontSize="12"
                fill={LABEL_COLOR}
              >
                {tick.value}
              </text>
            </g>
          ))}

          {/* Day ticks on x-axis */}
          {chart!.dayTicks.map((ts) => (
            <text
              key={`x-${ts}`}
              x={chart!.xScale(ts)}
              y={CHART_HEIGHT - 12}
              textAnchor="middle"
              fontSize="12"
              fill={LABEL_COLOR}
            >
              {formatDate(ts)}
            </text>
          ))}

          {/* Prediction band */}
          <path d={chart!.bandPath} fill={BAND_FILL} stroke="none" />

          <path
            d={chart!.expectedPath}
            fill="none"
            stroke="rgba(255, 255, 255, 0.52)"
            strokeWidth="1.6"
            strokeDasharray="6 6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Actual count line */}
          <path
            d={chart!.countPath}
            fill="none"
            stroke={cohortColor}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h4 className="ews-archive__subtitle">Historical Emergency Level</h4>
      <p className="ews-archive__hint">
        Level 5 is calibrated so only the highest daily peak in the trailing year should exceed it.
      </p>

      <div className="ews-archive__chart-wrap">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${LEVEL_HEIGHT}`}
          className="ews-archive__svg"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Y-axis (1-5) */}
          {[1, 2, 3, 4, 5].map((level) => (
            <g key={`level-${level}`}>
              <line
                x1={MARGIN.left}
                y1={chart!.yLevelScale(level)}
                x2={CHART_WIDTH - MARGIN.right}
                y2={chart!.yLevelScale(level)}
                stroke={GRID_COLOR}
                strokeWidth="0.8"
              />
              <text
                x={MARGIN.left - 6}
                y={chart!.yLevelScale(level) + 4}
                textAnchor="end"
                fontSize="12"
                fill={LABEL_COLOR}
              >
                {level}
              </text>
            </g>
          ))}

          {chart!.dayTicks.map((ts) => (
            <text
              key={`level-x-${ts}`}
              x={chart!.xScale(ts)}
              y={LEVEL_HEIGHT - 12}
              textAnchor="middle"
              fontSize="12"
              fill={LABEL_COLOR}
            >
              {formatDate(ts)}
            </text>
          ))}

          <path d={chart!.levelArea} fill={LEVEL_FILL} stroke="none" />
          <path
            d={chart!.levelLine}
            fill="none"
            stroke={cohortColor}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
