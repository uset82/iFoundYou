import React, { useState, useEffect, useRef } from 'react';
import ChatList from './ChatList';
import ChatWindow from './ChatWindow';
import MultipeerManager from '../../lib/mesh/multipeer';
import type { Peer } from '../../lib/mesh/types';
import './EmergencyChat.css';

interface EmergencyChatProps {
    userId: string;
    userName: string;
    onClose: () => void;
}

const EmergencyChat: React.FC<EmergencyChatProps> = ({ userId, userName, onClose }) => {
    const [selectedPeer, setSelectedPeer] = useState<Peer | null>(null);
    const [peers, setPeers] = useState<Peer[]>([]);
    const multipeerRef = useRef<MultipeerManager | null>(null);

    useEffect(() => {
        // Initialize Multipeer Manager
        const multipeer = new MultipeerManager(userId, userName);
        multipeerRef.current = multipeer;

        // Initial peers
        setPeers(multipeer.getConnectedPeers());

        // Listen for peer changes
        multipeer.onPeerChange((_peer) => {
            setPeers(multipeer.getConnectedPeers());
        });

        // Setup mock peers for testing if in browser
        if (!(window as any).webkit) {
            setTimeout(() => {
                const mockPeers: Peer[] = [
                    {
                        id: 'mock-peer-1',
                        displayName: 'Rescue Team Alpha',
                        connected: true,
                        lastSeen: Date.now(),
                        distance: 15
                    },
                    {
                        id: 'mock-peer-2',
                        displayName: 'Civ-User-B',
                        connected: true,
                        lastSeen: Date.now(),
                        distance: 42
                    }
                ];
                // We can't directly inject into the manager without exposing a method, 
                // so we'll just set state for UI testing purposes
                setPeers(mockPeers);
            }, 2000);
        }

        return () => {
            multipeer.disconnect();
        };
    }, [userId, userName]);

    return (
        <div className="emergency-chat-container">
            <div className="emergency-header">
                <button className="close-btn" onClick={onClose}>{'<'} Back</button>
                <h1>Emergency Mesh Network</h1>
                <div className="network-status">Online</div>
            </div>

            <div className="chat-layout">
                <div className={`emergency-sidebar ${selectedPeer ? 'hidden-mobile' : ''}`}>
                    <ChatList
                        peers={peers}
                        onSelectPeer={setSelectedPeer}
                        selectedPeerId={selectedPeer?.id}
                    />
                </div>

                <div className={`main-chat ${!selectedPeer ? 'hidden-mobile' : ''}`}>
                    {selectedPeer ? (
                        <ChatWindow
                            userId={userId}
                            userName={userName}
                            recipientId={selectedPeer.id}
                            recipientName={selectedPeer.displayName}
                        />
                    ) : (
                        <div className="empty-state">
                            <div className="empty-icon">MESH</div>
                            <h2>Select a peer to chat</h2>
                            <p>Messages are sent directly via Bluetooth/Wi-Fi (No Internet required)</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EmergencyChat;
