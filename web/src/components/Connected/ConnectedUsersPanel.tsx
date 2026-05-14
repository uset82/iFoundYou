import { useMemo } from 'react';
import { getPresence, formatLastSeen, formatDistance } from '../../lib/chat/presence';
import './ConnectedUsersPanel.css';

interface FriendItem {
  id: string;
  name: string;
  updatedAt: string | null;
  lat: number | null;
  lon: number | null;
  isGateway?: boolean;
  isEmergencyContact?: boolean;
}

interface DiscoveredItem extends FriendItem {
  distance_m?: number;
}

interface ConnectedUsersPanelProps {
  friends: FriendItem[];
  discovered: DiscoveredItem[];
  onOpenChat?: (userId: string) => void;
  onToggleEmergencyContact?: (userId: string, isEmergency: boolean) => void;
}

export default function ConnectedUsersPanel({
  friends,
  discovered,
  onOpenChat,
  onToggleEmergencyContact,
}: ConnectedUsersPanelProps) {
  const all = useMemo(() => {
    type Row = {
      id: string;
      name: string;
      updatedAt: string | null;
      role: 'friend' | 'discoverable';
      distanceM?: number;
      isGateway?: boolean;
      isEmergencyContact?: boolean;
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
          isGateway: friend.isGateway,
          isEmergencyContact: friend.isEmergencyContact,
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
          isGateway: person.isGateway,
          isEmergencyContact: person.isEmergencyContact,
        });
      }
    }

    // Sort: Emergency Contacts first, then online first, then friends before discoverable, then alphabetical
    const presenceWeight = (state: ReturnType<typeof getPresence>) =>
      state === 'online' ? 0 : state === 'away' ? 1 : 2;

    return rows.sort((a, b) => {
      if (a.isEmergencyContact !== b.isEmergencyContact) return a.isEmergencyContact ? -1 : 1;
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
                    <strong style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <span
                        className={`presence-dot presence-${presence}`}
                        aria-label={`status: ${presence}`}
                      />
                      {row.name}
                      {row.isEmergencyContact && <span title="Emergency Contact">⭐</span>}
                    </strong>
                    <span className="muted connected-row__meta">
                      <span className={`connected-tag tag-${row.role}`}>
                        {row.role === 'friend' ? 'Friend' : 'Nearby'}
                      </span>
                      {row.isGateway && (
                        <span className="connected-tag tag-gateway" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', marginLeft: '6px' }}>
                          Bridge Active
                        </span>
                      )}
                      {distanceLabel && <span> · {distanceLabel}</span>}
                      <span> · {lastSeen}</span>
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {onToggleEmergencyContact && row.role === 'friend' && (
                      <button
                        type="button"
                        className="ghost small"
                        onClick={() => onToggleEmergencyContact(row.id, !row.isEmergencyContact)}
                        title={row.isEmergencyContact ? "Remove from emergency contacts" : "Mark as emergency contact"}
                      >
                        {row.isEmergencyContact ? 'Unstar' : 'Star'}
                      </button>
                    )}
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
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
