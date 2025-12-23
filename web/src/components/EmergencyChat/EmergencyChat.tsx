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
    const supportsNativeMesh =
        typeof window !== 'undefined' &&
        Boolean((window as any).webkit?.messageHandlers?.multipeer);

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

        return () => {
            multipeer.disconnect();
        };
    }, [userId, userName]);

    return (
        <div className="emergency-chat-container">
            <div className="emergency-header">
                <button className="close-btn" onClick={onClose}>{'<'} Back</button>
                <h1>Emergency Mesh Network</h1>
                <div className="network-status">
                    {supportsNativeMesh ? 'Online' : 'Native only'}
                </div>
            </div>

            {supportsNativeMesh ? (
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
            ) : (
                <div className="mesh-unavailable">
                    <h2>Mesh requires the native app</h2>
                    <p>
                        The web app cannot access Bluetooth or Wi-Fi Direct. Use the iOS or
                        Android app for real peer-to-peer messaging.
                    </p>
                </div>
            )}
        </div>
    );
};

export default EmergencyChat;
