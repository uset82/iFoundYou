import { useState } from 'react';
import { createRoom } from '../../lib/chat/rooms';
import type { ChatRoom } from '../../lib/chat/rooms';
import './NewGroupModal.css';

interface FriendOption {
  id: string;
  name: string;
}

interface NewGroupModalProps {
  userId: string;
  friends: FriendOption[];
  onClose: () => void;
  onCreated: (room: ChatRoom) => void;
}

export default function NewGroupModal({ userId, friends, onClose, onCreated }: NewGroupModalProps) {
  const [name, setName] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Give the group a name.');
      return;
    }
    if (selectedIds.size === 0) {
      setError('Add at least one friend.');
      return;
    }
    setBusy(true);
    const result = await createRoom(userId, name.trim(), Array.from(selectedIds));
    setBusy(false);
    if (result.error || !result.room) {
      setError(result.error ?? 'Could not create group.');
      return;
    }
    onCreated(result.room);
  };

  return (
    <div className="new-group-modal" role="dialog" aria-modal="true">
      <div className="new-group-modal__backdrop" onClick={onClose} />
      <div className="new-group-modal__card">
        <h3 className="new-group-modal__title">Create a group</h3>
        <p className="muted">
          Group chats let you broadcast messages to multiple friends at once. Helpful
          for family, neighborhood, and emergency channels.
        </p>

        <label className="field">
          Group name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Family, Neighborhood…"
            disabled={busy}
            maxLength={64}
          />
        </label>

        <div className="new-group-modal__friends">
          <div className="muted" style={{ marginBottom: 8 }}>
            Pick friends to invite ({selectedIds.size} selected)
          </div>
          {friends.length === 0 ? (
            <p className="muted">You don't have any friends yet. Add some in the Friends tab.</p>
          ) : (
            <div className="new-group-modal__friend-list">
              {friends.map((friend) => (
                <label key={friend.id} className="new-group-modal__friend-row">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(friend.id)}
                    onChange={() => toggle(friend.id)}
                    disabled={busy}
                  />
                  <span>{friend.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {error && <p className="error">{error}</p>}

        <div className="new-group-modal__actions">
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void handleCreate()}
            disabled={busy || friends.length === 0}
          >
            {busy ? 'Creating…' : 'Create group'}
          </button>
        </div>
      </div>
    </div>
  );
}
