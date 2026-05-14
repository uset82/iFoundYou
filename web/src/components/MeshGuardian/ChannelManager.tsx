import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { generateChannelKey } from '../../lib/mesh/crypto';
import { createRoom, joinRoomWithPsk } from '../../lib/chat/rooms';
import QRInviteModal from './QRInviteModal';
import QRScannerModal from './QRScannerModal';
import './ChannelManager.css';

interface Channel {
  id: string;
  name: string;
  type: string;
  psk: string | null;
}

interface ChannelManagerProps {
  userId: string;
}

const PRESET_TYPES = [
  { id: 'family', label: 'Family', desc: 'Private channel for your family' },
  { id: 'neighborhood', label: 'Neighborhood', desc: 'Local community channel' },
  { id: 'medical', label: 'Medical', desc: 'Emergency medical assistance' },
  { id: 'security', label: 'Security', desc: 'Local security & watch' },
  { id: 'custom', label: 'Custom', desc: 'Create a custom mesh channel' },
];

export default function ChannelManager({ userId }: ChannelManagerProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState('family');
  const [createName, setCreateName] = useState('');
  
  const [inviteChannel, setInviteChannel] = useState<Channel | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadChannels();
  }, [userId]);

  const loadChannels = async () => {
    const { data: memberRows } = await supabase
      .from('chat_room_members')
      .select('room_id')
      .eq('user_id', userId);

    if (!memberRows || memberRows.length === 0) {
      setChannels([]);
      return;
    }

    const roomIds = memberRows.map(r => r.room_id);
    const { data: rooms } = await supabase
      .from('chat_rooms')
      .select('id, name, type, psk')
      .in('id', roomIds)
      .neq('type', 'internet')
      .order('created_at', { ascending: true });

    if (rooms) {
      setChannels(rooms as Channel[]);
    }
  };

  const handleCreate = async () => {
    if (!createName.trim()) {
      setError('Name is required');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const psk = await generateChannelKey();
      const { error: err } = await createRoom(userId, createName.trim(), [], createType, psk);
      
      if (err) throw new Error(err);
      
      await loadChannels();
      setShowCreate(false);
      setCreateName('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleScan = async (roomId: string, psk: string, name: string, type: string) => {
    setBusy(true);
    setError(null);
    setShowScanner(false);

    try {
      const { error: err } = await joinRoomWithPsk(userId, roomId, psk, name, type);
      if (err) throw new Error(err);
      await loadChannels();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="channel-manager">
      <div className="channel-header">
        <h3>Mesh Channels</h3>
        <p className="muted">Private channels for off-grid communication.</p>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="channel-list">
        {channels.length === 0 ? (
          <p className="muted">No mesh channels yet. Create one or scan an invite.</p>
        ) : (
          channels.map(channel => (
            <div key={channel.id} className="channel-row">
              <div className="channel-info">
                <strong>{channel.name}</strong>
                <span className={`channel-badge type-${channel.type}`}>{channel.type}</span>
              </div>
              <div className="channel-actions">
                {channel.psk && (
                  <button 
                    className="ghost small" 
                    onClick={() => setInviteChannel(channel)}
                  >
                    Invite
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {!showCreate ? (
        <div className="channel-footer-actions">
          <button className="primary block" onClick={() => setShowCreate(true)}>
            Create Channel
          </button>
          <button className="secondary block" onClick={() => setShowScanner(true)}>
            Join via QR
          </button>
        </div>
      ) : (
        <div className="channel-create-form">
          <h4>New Channel</h4>
          <label className="field">
            Type
            <select value={createType} onChange={e => setCreateType(e.target.value)} disabled={busy}>
              {PRESET_TYPES.map(pt => (
                <option key={pt.id} value={pt.id}>{pt.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Name
            <input 
              type="text" 
              value={createName} 
              onChange={e => setCreateName(e.target.value)} 
              placeholder="e.g. Smith Family"
              maxLength={32}
              disabled={busy}
            />
          </label>
          <div className="channel-create-actions">
            <button className="ghost" onClick={() => setShowCreate(false)} disabled={busy}>Cancel</button>
            <button className="primary" onClick={handleCreate} disabled={busy || !createName.trim()}>
              {busy ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {inviteChannel && (
        <QRInviteModal
          roomId={inviteChannel.id}
          name={inviteChannel.name}
          type={inviteChannel.type}
          psk={inviteChannel.psk!}
          onClose={() => setInviteChannel(null)}
        />
      )}

      {showScanner && (
        <QRScannerModal
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
