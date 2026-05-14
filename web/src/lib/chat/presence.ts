/**
 * Presence helpers for "online / away / offline" indicators based on the
 * timestamp of a user's last_locations row.
 */

export type PresenceState = 'online' | 'away' | 'offline';

const ONLINE_WINDOW_MS = 2 * 60 * 1000; // 2 min
const AWAY_WINDOW_MS = 15 * 60 * 1000; // 15 min

export function getPresence(updatedAt: string | null | undefined): PresenceState {
  if (!updatedAt) return 'offline';
  const ts = new Date(updatedAt).getTime();
  if (!Number.isFinite(ts)) return 'offline';
  const age = Date.now() - ts;
  if (age <= ONLINE_WINDOW_MS) return 'online';
  if (age <= AWAY_WINDOW_MS) return 'away';
  return 'offline';
}

export function formatLastSeen(updatedAt: string | null | undefined): string {
  if (!updatedAt) return 'Last seen unknown';
  const ts = new Date(updatedAt).getTime();
  if (!Number.isFinite(ts)) return 'Last seen unknown';
  const age = Date.now() - ts;
  if (age < 60_000) return 'Active now';
  const minutes = Math.floor(age / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatDistance(meters: number | undefined | null): string | null {
  if (typeof meters !== 'number' || !Number.isFinite(meters)) return null;
  if (meters < 1000) return `${Math.round(meters)} m away`;
  return `${(meters / 1000).toFixed(1)} km away`;
}
