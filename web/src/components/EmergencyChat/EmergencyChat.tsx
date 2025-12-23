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
    isAuthed: boolean;
    friends: Array<{ id: string; name: string }>;
}

const EmergencyChat: React.FC<EmergencyChatProps> = ({
    userId,
    userName,
    onClose,
    isAuthed,
    friends
}) => {
    const [selectedPeer, setSelectedPeer] = useState<Peer | null>(null);
    const [peers, setPeers] = useState<Peer[]>([]);
    const multipeerRef = useRef<MultipeerManager | null>(null);
    const supportsNativeMesh =
        typeof window !== 'undefined' &&
        Boolean((window as any).webkit?.messageHandlers?.multipeer);
    const chatMode = supportsNativeMesh ? 'native' : 'web';
    const headerTitle = supportsNativeMesh ? 'Emergency Mesh Network' : 'Emergency Chat';
    const statusLabel = supportsNativeMesh ? 'Online' : 'Online chat';
    const webPeers: Peer[] = friends.map((friend) => ({
        id: friend.id,
        displayName: friend.name,
        connected: true,
        lastSeen: Date.now()
    }));
    const activePeers = supportsNativeMesh ? peers : webPeers;

    useEffect(() => {
        if (!supportsNativeMesh) {
            return undefined;
        }
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
    }, [supportsNativeMesh, userId, userName]);

    useEffect(() => {
        if (!selectedPeer) {
            return;
        }
        const stillExists = activePeers.some((peer) => peer.id === selectedPeer.id);
        if (!stillExists) {
            setSelectedPeer(null);
        }
    }, [activePeers, selectedPeer]);

    return (
        <div className="emergency-chat-container">
            <div className="emergency-header">
                <button className="close-btn" onClick={onClose}>{'<'} Back</button>
                <h1>{headerTitle}</h1>
                <div className="network-status">{statusLabel}</div>
            </div>

            {!isAuthed ? (
                <div className="mesh-unavailable">
                    <h2>Sign in to chat</h2>
                    <p>Sign in to send messages to friends and family.</p>
                </div>
            ) : activePeers.length === 0 ? (
                <div className="mesh-unavailable">
                    <h2>No friends yet</h2>
                    <p>Add friends in the Friends tab to start chatting.</p>
                </div>
            ) : (
                <div className="chat-layout">
                    <div className={`emergency-sidebar ${selectedPeer ? 'hidden-mobile' : ''}`}>
                        <ChatList
                            peers={activePeers}
                            onSelectPeer={setSelectedPeer}
                            selectedPeerId={selectedPeer?.id}
                            title={supportsNativeMesh ? 'Nearby Peers' : 'Friends'}
                            statusLabel={supportsNativeMesh ? 'active' : 'friends'}
                            statusLabelSingular={supportsNativeMesh ? 'active' : 'friend'}
                            emptyTitle={
                                supportsNativeMesh
                                    ? 'Scanning for nearby devices...'
                                    : 'No friends yet'
                            }
                            emptyHint={
                                supportsNativeMesh
                                    ? 'Make sure Bluetooth/Wi-Fi is on'
                                    : 'Add friends in the Friends tab'
                            }
                            showSpinner={supportsNativeMesh}
                        />
                    </div>

                    <div className={`main-chat ${!selectedPeer ? 'hidden-mobile' : ''}`}>
                        {selectedPeer ? (
                            <ChatWindow
                                userId={userId}
                                userName={userName}
                                recipientId={selectedPeer.id}
                                recipientName={selectedPeer.displayName}
                                mode={chatMode}
                            />
                        ) : (
                            <div className="empty-state">
                                <div className="empty-icon">CHAT</div>
                                <h2>Select a friend to chat</h2>
                                <p>
                                    {supportsNativeMesh
                                        ? 'Messages are sent directly via Bluetooth/Wi-Fi (No Internet required)'
                                        : 'Messages are sent in real time using the internet.'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default EmergencyChat;
