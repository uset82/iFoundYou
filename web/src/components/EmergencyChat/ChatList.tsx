import React from 'react';
import type { Peer } from '../../lib/mesh/types';
import './ChatList.css';

interface ChatListProps {
    peers: Peer[];
    onSelectPeer: (peer: Peer) => void;
    selectedPeerId?: string;
}

const ChatList: React.FC<ChatListProps> = ({ peers, onSelectPeer, selectedPeerId }) => {
    return (
        <div className="chat-list">
            <div className="chat-list-header">
                <h2>Nearby Peers</h2>
                <span className="status-badge">{peers.length} active</span>
            </div>

            <div className="peers-container">
                {peers.length === 0 ? (
                    <div className="no-peers">
                        <div className="radar-spinner"></div>
                        <p>Scanning for nearby devices...</p>
                        <small>Make sure Bluetooth/Wi-Fi is on</small>
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
