import React from 'react';
import type { Peer } from '../../lib/mesh/types';
import './ChatList.css';

interface ChatListProps {
    peers: Peer[];
    onSelectPeer: (peer: Peer) => void;
    selectedPeerId?: string;
    title?: string;
    statusLabel?: string;
    statusLabelSingular?: string;
    emptyTitle?: string;
    emptyHint?: string;
    showSpinner?: boolean;
}

const ChatList: React.FC<ChatListProps> = ({
    peers,
    onSelectPeer,
    selectedPeerId,
    title = 'Nearby Peers',
    statusLabel = 'active',
    statusLabelSingular,
    emptyTitle = 'Scanning for nearby devices...',
    emptyHint = 'Make sure Bluetooth/Wi-Fi is on',
    showSpinner = true
}) => {
    const badgeLabel =
        peers.length === 1 ? (statusLabelSingular ?? statusLabel) : statusLabel;
    return (
        <div className="chat-list">
            <div className="chat-list-header">
                <h2>{title}</h2>
                <span className="status-badge">{peers.length} {badgeLabel}</span>
            </div>

            <div className="peers-container">
                {peers.length === 0 ? (
                    <div className="no-peers">
                        {showSpinner && <div className="radar-spinner"></div>}
                        <p>{emptyTitle}</p>
                        {emptyHint && <small>{emptyHint}</small>}
                    </div>
                ) : (
                    peers.map((peer) => (
                        <div
                            key={peer.id}
                            className={`peer-item ${selectedPeerId === peer.id ? 'selected' : ''}`}
                            onClick={() => onSelectPeer(peer)}
                        >
                            <div className="peer-avatar">
                                {peer.displayName.charAt(0).toUpperCase()}
                            </div>
                            <div className="peer-info">
                                <h3>{peer.displayName}</h3>
                                <span className="peer-status">
                                    {peer.connected ? 'Connected' : 'Last seen ' + new Date(peer.lastSeen).toLocaleTimeString()}
                                </span>
                            </div>
                            <div className="connection-indicator"></div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default ChatList;
