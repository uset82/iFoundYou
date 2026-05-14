import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchEWSDashboard } from './ews';
import type { CohortType, EWSDashboard } from './ews';
import { loadSettings } from '../components/EWS/EWSSettings';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const EWS_LAST_LEVEL_KEY = 'ews-last-emergency-level';

interface EWSContextValue {
  dashboard: EWSDashboard | null;
  loading: boolean;
  error: string | null;
  cohort: CohortType;
  setCohort: (cohort: CohortType) => void;
  refresh: () => void;
  lastFetched: number | null;
}

const EWSContext = createContext<EWSContextValue>({
  dashboard: null,
  loading: false,
  error: null,
  cohort: 'business',
  setCohort: () => {},
  refresh: () => {},
  lastFetched: null,
});

export function EWSProvider({ children }: { children: ReactNode }) {
  const [dashboard, setDashboard] = useState<EWSDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cohort, setCohort] = useState<CohortType>('business');
  const [lastFetched, setLastFetched] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastNotifiedLevelRef = useRef<number>(
    Number(localStorage.getItem(EWS_LAST_LEVEL_KEY)) || 0
  );

  const fireEmergencyNotification = useCallback((level: number, count: number) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      return;
    }

    const threshold = loadSettings().notificationThreshold;

    // Only notify if level increased past the user's threshold.
    if (level < threshold || level <= lastNotifiedLevelRef.current) {
      return;
    }

    lastNotifiedLevelRef.current = level;
    localStorage.setItem(EWS_LAST_LEVEL_KEY, String(level));

    const title = level === 5
      ? '☢️ APOCALYPSE EWS — LEVEL 5 CRITICAL'
      : '⚠️ Apocalypse EWS — Level 4 High Alert';
    const body = level === 5
      ? `${count} aircraft airborne — far above expected. Possible imminent catastrophe.`
      : `${count} aircraft airborne — significantly above expected baseline.`;

    new Notification(title, { body, tag: 'ews-emergency' });
  }, []);

  const load = useCallback(async (selectedCohort: CohortType) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEWSDashboard(selectedCohort);
      setDashboard(data);
      setLastFetched(Date.now());

      // Fire notification for high emergency levels
      if (data.signal) {
        fireEmergencyNotification(data.signal.emergencyLevel, data.signal.concurrentCount);

        if (data.signal.emergencyLevel < loadSettings().notificationThreshold) {
          lastNotifiedLevelRef.current = 0;
          localStorage.removeItem(EWS_LAST_LEVEL_KEY);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch EWS data');
    } finally {
      setLoading(false);
    }
  }, [fireEmergencyNotification]);

  const refresh = useCallback(() => {
    void load(cohort);
  }, [load, cohort]);

  useEffect(() => {
    void load(cohort);

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = setInterval(() => {
      void load(cohort);
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [cohort, load]);

  return (
    <EWSContext.Provider
      value={{ dashboard, loading, error, cohort, setCohort, refresh, lastFetched }}
    >
      {children}
    </EWSContext.Provider>
  );
}

export function useEWS() {
  return useContext(EWSContext);
}
