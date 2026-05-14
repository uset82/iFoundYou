import { useState } from 'react';
import { useEWS } from '../../lib/EWSContext';
import EmergencyDial from './EmergencyDial';
import CohortSelector from './CohortSelector';
import EWSSettings from './EWSSettings';
import EWSHero from './EWSHero';
import EWSWorldMap from './EWSWorldMap';
import TrafficArchive from './TrafficArchive';
import AircraftByModel from './AircraftByModel';
import EWSExplainer from './EWSExplainer';
import './EWSPanel.css';

const COHORT_COLORS: Record<string, string> = {
  business: '#0000ee',
  military: '#16a34a',
  untracked: '#ea580c',
};

export default function EWSPanel() {
  const { dashboard, loading, error, cohort, setCohort, refresh } = useEWS();
  const [showSettings, setShowSettings] = useState(false);

  const signal = dashboard?.signal;
  const cohortColor = COHORT_COLORS[cohort] ?? COHORT_COLORS.business;

  return (
    <div className="ews-panel">
      <div className="ews-panel__top">
        <div className="ews-panel__title-row">
          <h3 className="ews-panel__title">
            <span className="ews-panel__icon" aria-hidden="true">☢️</span>
            Apocalypse Early Warning
          </h3>
          <button
            type="button"
            className="ghost small"
            onClick={refresh}
            disabled={loading}
            title="Refresh EWS data"
          >
            {loading ? '⟳' : '↻'} {loading ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
        <CohortSelector value={cohort} onChange={setCohort} />
      </div>

      {error && !dashboard && (
        <div className="ews-panel__error">
          <p>{error}</p>
          <button className="ghost small" onClick={refresh}>
            Retry
          </button>
        </div>
      )}

      {!signal && !error && loading && (
        <div className="ews-panel__loading">
          <div className="ews-panel__spinner" />
          <span className="muted">Loading EWS data...</span>
        </div>
      )}

      {signal && (
        <>
          <EWSHero signal={signal} />

          <EmergencyDial
            level={signal.emergencyLevel}
            concurrentCount={signal.concurrentCount}
            expectedCount={signal.expectedCount}
            sigma={signal.sigma}
            timestamp={signal.timestamp}
            trackedCount={signal.trackedCount}
            loading={loading}
          />

          <div className="ews-panel__section">
            <h3 className="ews-panel__section-title">Realtime Tracker</h3>
            <EWSWorldMap aircraft={signal.aircraft} cohort={cohort} />
          </div>

          {dashboard?.fullArchive && dashboard.fullArchive.length > 0 && (
            <TrafficArchive
              fullArchive={dashboard.fullArchive}
              cohortColor={cohortColor}
            />
          )}

          {dashboard?.aircraftByModel && dashboard.aircraftByModel.length > 0 && (
            <AircraftByModel models={dashboard.aircraftByModel} />
          )}

          <EWSExplainer />
        </>
      )}

      <button
        type="button"
        className="ews-panel__expand-btn"
        onClick={() => setShowSettings(!showSettings)}
      >
        {showSettings ? '▾ Hide settings' : '⚙ Settings'}
      </button>

      {showSettings && <EWSSettings />}
    </div>
  );
}
