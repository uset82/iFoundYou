import type { EWSSignal } from '../../lib/ews';
import './EWSHero.css';

interface EWSHeroProps {
  signal: EWSSignal;
}

function formatTimestamp(value: string): string {
  if (!value) return 'No data';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return 'No data';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function formatSigned(value: number, suffix: string = ''): string {
  if (!Number.isFinite(value)) return `0${suffix}`;
  const sign = value > 0 ? '+' : '';
  return `${sign}${Math.round(value)}${suffix}`;
}

function formatSigma(value: number): string {
  if (!Number.isFinite(value)) return '0.0σ';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}σ`;
}

export default function EWSHero({ signal }: EWSHeroProps) {
  const delta = signal.concurrentCount - signal.expectedCount;

  return (
    <div className="ews-hero">
      <div className="ews-hero__content">
        <h2 className="ews-hero__title">Apocalypse Early Warning System</h2>
        <p className="ews-hero__description">
          In the event of an imminent nuclear apocalypse, we suspect that many people who have
          access to private jets will immediately take to the skies and escape city centers.
          This view tracks this indicator in realtime. The current emergency level is reported
          on a scale of 1 to 5, with 5 being an indicator of a likely imminent apocalypse.
        </p>
      </div>

      <div className="ews-hero__stats">
        <div className="ews-hero__level">
          Emergency level <strong>{signal.emergencyLevel}/5</strong>
        </div>

        <div className="ews-hero__row">
          <strong>{signal.concurrentCount.toLocaleString()}</strong>
          <span className="ews-hero__divider">/</span>
          <span>{signal.trackedCount.toLocaleString()}</span>
          <span className="ews-hero__icon" aria-hidden="true">✈</span>
          <span className="ews-hero__row-label">planes airborne</span>
        </div>

        {signal.maxPeopleAirborne !== undefined && signal.maxPeopleAirborne > 0 && (
          <div className="ews-hero__row">
            <strong>{signal.maxPeopleAirborne.toLocaleString()}</strong>
            <span className="ews-hero__icon" aria-hidden="true">👥</span>
            <span className="ews-hero__row-label">max people airborne</span>
          </div>
        )}

        <div className="ews-hero__row">
          <strong>Deviation:</strong>
          <span>{formatSigned(delta)}</span>
          <span className="ews-hero__icon" aria-hidden="true">✈</span>
          <span className="ews-hero__sigma">({formatSigma(signal.sigma)})</span>
        </div>

        <div className="ews-hero__row ews-hero__updated">
          <strong>Last Update:</strong>
          <span>{formatTimestamp(signal.timestamp)}</span>
        </div>
      </div>
    </div>
  );
}
