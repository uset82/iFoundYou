/**
 * EWS (Early Warning System) API service
 * Fetches public dashboard JSON from R2 and parses the signal data.
 */

const DEFAULT_DASHBOARD_URL =
  'https://pub-49bb6a6f314c47be9b481c25e5f6ca9e.r2.dev/dashboard.json';
const DEFAULT_MILITARY_URL =
  'https://pub-49bb6a6f314c47be9b481c25e5f6ca9e.r2.dev/military-dashboard.json';
const DEFAULT_UNTRACKED_URL =
  'https://pub-49bb6a6f314c47be9b481c25e5f6ca9e.r2.dev/untracked-dashboard.json';

export const EWS_DASHBOARD_URL =
  import.meta.env.VITE_EWS_DASHBOARD_URL || DEFAULT_DASHBOARD_URL;
export const EWS_MILITARY_URL =
  import.meta.env.VITE_EWS_MILITARY_DASHBOARD_URL || DEFAULT_MILITARY_URL;
export const EWS_UNTRACKED_URL =
  import.meta.env.VITE_EWS_UNTRACKED_DASHBOARD_URL || DEFAULT_UNTRACKED_URL;

export type CohortType = 'business' | 'military' | 'untracked';

export interface AircraftPosition {
  hex: string;
  registration?: string;
  lat: number;
  lon: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  label?: string;
  isAirborne?: boolean;
  path?: Array<{ lat: number; lon: number; observedAt: string }>;
}

export interface AircraftModelCount {
  label: string;
  count: number;
}

export interface EWSSignal {
  emergencyLevel: number;
  concurrentCount: number;
  expectedCount: number;
  sigma: number;
  timestamp: string;
  trackedCount: number;
  aircraft: AircraftPosition[];
  cohortType: CohortType;
  predictionBandLow?: number;
  predictionBandHigh?: number;
  maxPeopleAirborne?: number;
  alarmSigmaThreshold?: number;
  elevatedSigmaThreshold?: number;
}

export interface HistoryPoint {
  timestamp: string;
  count: number;
  expected?: number;
  stdDev?: number;
  emergencyLevel?: number;
}

export interface EWSDashboard {
  signal: EWSSignal;
  history?: HistoryPoint[];
  fullArchive?: HistoryPoint[];
  aircraftByModel: AircraftModelCount[];
  raw?: unknown;
}

/**
 * Decode the run-length encoded time resolution array into absolute timestamps.
 * Format: t0 is an ISO string, tr is [[interval_ms, repeat_count], ...]
 */
function decodeArchiveTimestamps(t0: string, tr: [number, number][], length: number): number[] {
  const timestamps: number[] = [];
  const start = new Date(t0).getTime();
  if (!Number.isFinite(start)) return [];

  let current = start;
  timestamps.push(current);

  let trIndex = 0;
  let trUsed = 0;

  for (let i = 1; i < length; i++) {
    if (trIndex >= tr.length) {
      current += 1800000;
    } else {
      const [interval, count] = tr[trIndex];
      current += interval;
      trUsed++;
      if (trUsed >= count) {
        trIndex++;
        trUsed = 0;
      }
    }
    timestamps.push(current);
  }

  return timestamps;
}

/**
 * Build the full archive history from the encoded format.
 */
function extractFullArchive(data: any): HistoryPoint[] {
  const archive = data?.trends?.archive;
  if (!archive || !archive.t0 || !archive.tr || !archive.c || !archive.p) {
    return [];
  }

  const counts: number[] = archive.c;
  const expected: number[] = archive.p;
  const stdDevs: number[] = archive.s ?? [];
  const zScores: number[] = archive.z ?? [];
  const totalPoints = counts.length;

  if (totalPoints === 0) return [];

  const timestamps = decodeArchiveTimestamps(archive.t0, archive.tr, totalPoints);
  if (timestamps.length === 0) return [];

  const history: HistoryPoint[] = [];

  for (let i = 0; i < totalPoints; i++) {
    // Approximate emergency level from z-score
    const z = Number(zScores[i]) || 0;
    let level = 1;
    if (z >= 4.8) level = 5;
    else if (z >= 3.5) level = 4;
    else if (z >= 2.4) level = 3;
    else if (z >= 1.5) level = 2;

    history.push({
      timestamp: new Date(timestamps[i]).toISOString(),
      count: counts[i],
      expected: Number.isFinite(expected[i]) ? expected[i] : undefined,
      stdDev: Number.isFinite(stdDevs[i]) ? stdDevs[i] : undefined,
      emergencyLevel: level,
    });
  }

  return history;
}

/**
 * Build aircraft by model breakdown from liveAircraft.
 */
function buildAircraftByModel(liveAircraft: any[]): AircraftModelCount[] {
  if (!Array.isArray(liveAircraft)) return [];

  const counts = new Map<string, number>();
  for (const aircraft of liveAircraft) {
    if (aircraft?.isAirborne === false) continue;
    const label = String(aircraft?.label || 'Unknown').trim() || 'Unknown';
    counts.set(label, (counts.get(label) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function parseDashboard(data: any, cohortType: CohortType): EWSDashboard {
  const current = data?.current;
  const liveStatus = data?.liveStatus;
  const cohort = data?.cohort;
  const signals = data?.signals?.composite;

  const emergencyLevel = Math.min(
    5,
    Math.max(1, Math.round(Number(current?.emergencyLevel ?? 1)))
  );

  const concurrentCount = Number(
    current?.concurrentCount ?? liveStatus?.concurrentCount ?? liveStatus?.airborneCount ?? 0
  );
  const expectedCount = Number(current?.baselineMean ?? signals?.expectedConcurrentCount ?? 0);
  const sigma = Number(current?.zScore ?? signals?.sigmaShift ?? 0);
  const timestamp = liveStatus?.latestSampledAt ?? current?.asOf ?? '';
  const trackedCount = Number(cohort?.trackedCount ?? 0);
  const alarmSigmaThreshold = Number(current?.alarmSigmaThreshold ?? 4.8);
  const elevatedSigmaThreshold = Number(current?.elevatedSigmaThreshold ?? 2.4);

  const rawAircraft = data?.liveAircraft ?? [];
  const aircraft: AircraftPosition[] = Array.isArray(rawAircraft)
    ? rawAircraft
        .filter((a: any) => Number.isFinite(a?.lat) && Number.isFinite(a?.lon))
        .map((a: any) => ({
          hex: a.hex ?? '',
          registration: a.registration ?? undefined,
          lat: a.lat,
          lon: a.lon,
          altitude: Number.isFinite(a.altitudeFt) ? a.altitudeFt : undefined,
          speed: Number.isFinite(a.groundSpeedKt) ? a.groundSpeedKt : undefined,
          heading: Number.isFinite(a.track) ? a.track : undefined,
          label: a.label ?? undefined,
          isAirborne: a.isAirborne !== false,
          path: Array.isArray(a.path) ? a.path : undefined,
        }))
    : [];

  const stdDev = Number(current?.baselineStdDev ?? 0);
  const predictionBandLow = expectedCount > 0 ? expectedCount - stdDev : undefined;
  const predictionBandHigh = expectedCount > 0 ? expectedCount + stdDev : undefined;

  const fullArchive = extractFullArchive(data);

  // Recent history: last 24 hours
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const history = fullArchive.filter((h) => new Date(h.timestamp).getTime() >= cutoff);

  const aircraftByModel = buildAircraftByModel(rawAircraft);

  // Estimate max people airborne using passenger capacity heuristic
  let maxPeopleAirborne: number | undefined;
  if (cohortType === 'business' && aircraft.length > 0) {
    const avgPassengers = 12;
    maxPeopleAirborne = Math.round(concurrentCount * avgPassengers);
  }

  return {
    signal: {
      emergencyLevel,
      concurrentCount,
      expectedCount,
      sigma,
      timestamp,
      trackedCount,
      aircraft,
      cohortType,
      predictionBandLow,
      predictionBandHigh,
      maxPeopleAirborne,
      alarmSigmaThreshold,
      elevatedSigmaThreshold,
    },
    history: history.length > 0 ? history : undefined,
    fullArchive: fullArchive.length > 0 ? fullArchive : undefined,
    aircraftByModel,
    raw: data,
  };
}

export async function fetchEWSDashboard(
  cohort: CohortType = 'business'
): Promise<EWSDashboard> {
  const urlMap: Record<CohortType, string> = {
    business: EWS_DASHBOARD_URL,
    military: EWS_MILITARY_URL,
    untracked: EWS_UNTRACKED_URL,
  };

  const url = urlMap[cohort];
  const cacheBuster = Math.floor(Date.now() / (5 * 60 * 1000));
  const fetchUrl = `${url}?_=${cacheBuster}`;

  const response = await fetch(fetchUrl);
  if (!response.ok) {
    throw new Error(`EWS fetch failed: ${response.status}`);
  }

  const data = await response.json();
  return parseDashboard(data, cohort);
}
