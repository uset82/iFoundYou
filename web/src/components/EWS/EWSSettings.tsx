import { useEffect, useState } from 'react';
import type { CohortType } from '../../lib/ews';
import './EWSSettings.css';

const SETTINGS_KEY = 'ews-settings';

export interface EWSUserSettings {
  overlayEnabled: boolean;
  notificationThreshold: 3 | 4 | 5;
  enabledCohorts: CohortType[];
}

const DEFAULT_SETTINGS: EWSUserSettings = {
  overlayEnabled: true,
  notificationThreshold: 4,
  enabledCohorts: ['business', 'military', 'untracked'],
};

function loadSettings(): EWSUserSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: EWSUserSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

interface EWSSettingsProps {
  onSettingsChange?: (settings: EWSUserSettings) => void;
}

export default function EWSSettings({ onSettingsChange }: EWSSettingsProps) {
  const [settings, setSettings] = useState<EWSUserSettings>(loadSettings);

  useEffect(() => {
    saveSettings(settings);
    onSettingsChange?.(settings);
  }, [settings, onSettingsChange]);

  const toggleCohort = (cohort: CohortType) => {
    setSettings((prev) => {
      const enabled = prev.enabledCohorts.includes(cohort);
      const next = enabled
        ? prev.enabledCohorts.filter((c) => c !== cohort)
        : [...prev.enabledCohorts, cohort];
      // Keep at least one cohort enabled
      if (next.length === 0) return prev;
      return { ...prev, enabledCohorts: next };
    });
  };

  return (
    <div className="ews-settings">
      <h4 className="ews-settings__title">EWS Settings</h4>

      <div className="ews-settings__row">
        <label className="ews-settings__label">
          <input
            type="checkbox"
            checked={settings.overlayEnabled}
            onChange={(e) =>
              setSettings((prev) => ({ ...prev, overlayEnabled: e.target.checked }))
            }
          />
          Show aircraft overlay on map
        </label>
      </div>

      <div className="ews-settings__row">
        <span className="ews-settings__label">Notification threshold</span>
        <select
          className="ews-settings__select"
          value={settings.notificationThreshold}
          onChange={(e) =>
            setSettings((prev) => ({
              ...prev,
              notificationThreshold: Number(e.target.value) as 3 | 4 | 5,
            }))
          }
        >
          <option value={3}>Level 3+ (Heightened)</option>
          <option value={4}>Level 4+ (High)</option>
          <option value={5}>Level 5 only (Critical)</option>
        </select>
      </div>

      <div className="ews-settings__row">
        <span className="ews-settings__label">Monitored cohorts</span>
        <div className="ews-settings__cohorts">
          <label>
            <input
              type="checkbox"
              checked={settings.enabledCohorts.includes('business')}
              onChange={() => toggleCohort('business')}
            />
            Business Jets
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.enabledCohorts.includes('military')}
              onChange={() => toggleCohort('military')}
            />
            Military
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.enabledCohorts.includes('untracked')}
              onChange={() => toggleCohort('untracked')}
            />
            Untracked
          </label>
        </div>
      </div>
    </div>
  );
}

export { loadSettings };
