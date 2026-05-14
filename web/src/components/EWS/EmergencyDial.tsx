import { useMemo } from 'react';
import './EmergencyDial.css';

interface EmergencyDialProps {
  level: number;
  concurrentCount: number;
  expectedCount: number;
  sigma: number;
  timestamp: string;
  trackedCount: number;
  loading?: boolean;
}

const LEVEL_COLORS = ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444'];
const LEVEL_LABELS = ['Normal', 'Elevated', 'Heightened', 'High', 'Critical'];

function formatRelativeTime(timestamp: string): string {
  if (!timestamp) return 'No data';
  const diff = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(diff) || diff < 0) return 'Just now';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatSigma(value: number): string {
  if (!Number.isFinite(value)) return '0.0σ';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}σ`;
}

export default function EmergencyDial({
  level,
  concurrentCount,
  expectedCount,
  sigma,
  timestamp,
  trackedCount,
  loading,
}: EmergencyDialProps) {
  const clampedLevel = Math.min(5, Math.max(1, level));
  const color = LEVEL_COLORS[clampedLevel - 1];
  const label = LEVEL_LABELS[clampedLevel - 1];

  const needleRotation = useMemo(() => {
    // Map level 1-5 to -90deg to +90deg
    return -90 + ((clampedLevel - 1) / 4) * 180;
  }, [clampedLevel]);

  const delta = concurrentCount - expectedCount;
  const deltaStr = delta > 0 ? `+${Math.round(delta)}` : `${Math.round(delta)}`;

  return (
    <div className={`ews-dial ${loading ? 'ews-dial--loading' : ''}`}>
      <div className="ews-dial__gauge">
        <svg viewBox="0 0 200 120" className="ews-dial__svg">
          {/* Background arc */}
          <path
            d="M 20 110 A 80 80 0 0 1 180 110"
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="12"
            strokeLinecap="round"
          />
          {/* Colored arc segments */}
          {LEVEL_COLORS.map((segColor, i) => {
            const startAngle = -180 + i * 36;
            const endAngle = startAngle + 36;
            const startRad = (startAngle * Math.PI) / 180;
            const endRad = (endAngle * Math.PI) / 180;
            const cx = 100;
            const cy = 110;
            const r = 80;
            const x1 = cx + r * Math.cos(startRad);
            const y1 = cy + r * Math.sin(startRad);
            const x2 = cx + r * Math.cos(endRad);
            const y2 = cy + r * Math.sin(endRad);
            const opacity = i < clampedLevel ? 1 : 0.2;
            return (
              <path
                key={i}
                d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
                fill="none"
                stroke={segColor}
                strokeWidth="12"
                strokeLinecap="round"
                opacity={opacity}
              />
            );
          })}
          {/* Needle */}
          <g transform={`rotate(${needleRotation}, 100, 110)`}>
            <line
              x1="100"
              y1="110"
              x2="100"
              y2="40"
              stroke={color}
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="100" cy="110" r="6" fill={color} />
          </g>
        </svg>
        <div className="ews-dial__level" style={{ color }}>
          <span className="ews-dial__level-number">{clampedLevel}</span>
          <span className="ews-dial__level-label">{label}</span>
        </div>
      </div>

      <div className="ews-dial__stats">
        <div className="ews-dial__stat">
          <span className="ews-dial__stat-value">{Math.round(concurrentCount)}</span>
          <span className="ews-dial__stat-label">Airborne</span>
        </div>
        <div className="ews-dial__stat">
          <span className="ews-dial__stat-value">{Math.round(expectedCount)}</span>
          <span className="ews-dial__stat-label">Expected</span>
        </div>
        <div className="ews-dial__stat">
          <span className="ews-dial__stat-value ews-dial__stat-delta" style={{ color }}>
            {deltaStr}
          </span>
          <span className="ews-dial__stat-label">Delta</span>
        </div>
        <div className="ews-dial__stat">
          <span className="ews-dial__stat-value">{formatSigma(sigma)}</span>
          <span className="ews-dial__stat-label">Deviation</span>
        </div>
      </div>

      <div className="ews-dial__footer">
        <span className="ews-dial__tracked">
          {trackedCount.toLocaleString()} tracked
        </span>
        <span className="ews-dial__time">{formatRelativeTime(timestamp)}</span>
      </div>

      {clampedLevel >= 4 && (
        <div className="ews-dial__pulse" style={{ borderColor: color }} />
      )}
    </div>
  );
}
