import { useMemo } from 'react';
import { getPresence, formatLastSeen, formatDistance } from '../../lib/chat/presence';
import './ConnectedUsersPanel.css';

interface FriendItem {
  id: string;
  name: string;
  updatedAt: string | null;
  lat: number | null;
  lon: number | null;
}

interface DiscoveredItem extends FriendItem {
  distance_m?: number;
}

interface ConnectedUsersPanelProps {
  friends: FriendItem[];
  discovered: DiscoveredItem[];
  onOpenChat?: (userId: string) => void;
}

export default function ConnectedUsersPanel({
  friends,
  discovered,
  onOpenChat,
}: ConnectedUsersPanelProps) {
  const all = useMemo(() => {
    type Row = {
      id: string;
      name: string;
      updatedAt: string | null;
      role: 'friend' | 'discoverable';
      distanceM?: number;
    };

    const seen = new Set<string>();
    const rows: Row[] = [];

    for (const friend of friends) {
      if (!seen.has(friend.id)) {
        seen.add(friend.id);
        rows.push({
          id: friend.id,
          name: friend.name,
          updatedAt: friend.updatedAt,
          role: 'friend',
        });
      }
    }
    for (const person of discovered) {
      if (!seen.has(person.id)) {
        seen.add(person.id);
        rows.push({
          id: person.id,
          name: person.name,
          updatedAt: person.updatedAt,
          role: 'discoverable',
          distanceM: person.distance_m,
        });
      }
    }

    // Sort: online first, then friends before discoverable, then alphabetical
    const presenceWeight = (state: ReturnType<typeof getPresence>) =>
      state === 'online' ? 0 : state === 'away' ? 1 : 2;

    return rows.sort((a, b) => {
      const pa = presenceWeight(getPresence(a.updatedAt));
      const pb = presenceWeight(getPresence(b.updatedAt));
      if (pa !== pb) return pa - pb;
      if (a.role !== b.role) return a.role === 'friend' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [friends, discovered]);

  const onlineCount = useMemo(
    () => all.filter((row) => getPresence(row.updatedAt) === 'online').length,
    [all],
  );

  return (
    <section className="connected-panel">
      <div className="panel-header">
        <h2>Connected users</h2>
        <p className="muted">
          {all.length} total · <strong>{onlineCount}</strong> online right now
        </p>
      </div>

      {all.length === 0 ? (
        <div className="card">
          <p className="muted">
            No one's connected yet. Add friends in the Share tab or enable Discovery
            to see nearby people.
          </p>
        </div>
      ) : (
        <div className="card connected-list-card">
          <div className="connected-list">
            {all.map((row) => {
              const presence = getPresence(row.updatedAt);
              const distanceLabel = formatDistance(row.distanceM);
              const lastSeen = formatLastSeen(row.updatedAt);
              return (
                <div key={row.id} className="connected-row">
                  <div className="connected-row__main">
                    <strong>
                      <span
                        className={`presence-dot presence-${presence}`}
                        aria-label={`status: ${presence}`}
                      />
                      {row.name}
                    </strong>
                    <span className="muted connected-row__meta">
                      <span className={`connected-tag tag-${row.role}`}>
                        {row.role === 'friend' ? 'Friend' : 'Nearby'}
                      </span>
                      {distanceLabel && <span> · {distanceLabel}</span>}
                      <span> · {lastSeen}</span>
                    </span>
                  </div>
                  {onOpenChat && (
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => onOpenChat(row.id)}
                    >
                      Chat
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
