// Multipeer Connectivity wrapper for iOS mesh networking
// Uses iOS 7+ Multipeer Connectivity Framework via WebView bridge

import type { MeshMessage, Peer, MessageCallback, PeerCallback } from './types';

class MultipeerManager {
    private peers: Map<string, Peer> = new Map();
    private messageCache: Set<string> = new Set(); // Deduplication
    private onMessageCallbacks: MessageCallback[] = [];
    private onPeerCallbacks: PeerCallback[] = [];
    private userId: string;
    private displayName: string;

    constructor(userId: string, displayName: string) {
        this.userId = userId;
        this.displayName = displayName;
        this.initializeMultipeer();
    }

    private initializeMultipeer() {
        // Check if running in iOS WebView with Multipeer support
        if (typeof (window as any).webkit !== 'undefined') {
            console.log('iOS Multipeer Connectivity available');
            this.setupIOSBridge();
        } else {
            console.warn('Multipeer Connectivity not available - using fallback');
            // Will implement BLE fallback in Milestone 5
        }
    }

    private setupIOSBridge() {
        // Setup message handler from iOS native code
        (window as any).handleMultipeerMessage = (messageJSON: string) => {
            try {
                const message: MeshMessage = JSON.parse(messageJSON);
                this.handleIncomingMessage(message);
            } catch (error) {
                console.error('Failed to parse multipeer message:', error);
            }
        };

        // Setup peer discovery handler
        (window as any).handlePeerDiscovered = (peerJSON: string) => {
            try {
                const peer: Peer = JSON.parse(peerJSON);
                this.handlePeerDiscovered(peer);
            } catch (error) {
                console.error('Failed to parse peer data:', error);
            }
        };

        // Setup peer lost handler
        (window as any).handlePeerLost = (peerId: string) => {
            this.handlePeerLost(peerId);
        };

        // Start advertising and browsing
        this.sendToNative('startMultipeer', {
            userId: this.userId,
            displayName: this.displayName,
            serviceType: 'ifoundyou-mesh' // Must be 15 chars or less
        });
    }

    private sendToNative(action: string, data: any) {
        if (typeof (window as any).webkit?.messageHandlers?.multipeer !== 'undefined') {
            (window as any).webkit.messageHandlers.multipeer.postMessage({
                action,
                data
            });
        }
    }

    private handleIncomingMessage(message: MeshMessage) {
        // Check if we've seen this message before (deduplication)
        if (this.messageCache.has(message.id)) {
            console.log('Duplicate message ignored:', message.id);
            return;
        }

        // Add to cache
        this.messageCache.add(message.id);

        // Clean cache if it gets too large (keep last 1000 messages)
        if (this.messageCache.size > 1000) {
            const firstItem = this.messageCache.values().next().value;
            if (firstItem !== undefined) {
                this.messageCache.delete(firstItem);
            }
        }

        // Check TTL
        if (message.ttl <= 0) {
            console.log('Message TTL expired:', message.id);
            return;
        }

        // If message is for us, deliver it
        if (message.recipient === this.userId || message.recipient === 'broadcast') {
            this.deliverMessage(message);
        }

        // Forward message to other peers (store-and-forward)
        this.forwardMessage(message);
    }

    private deliverMessage(message: MeshMessage) {
        // Notify all registered callbacks
        this.onMessageCallbacks.forEach(callback => {
            try {
                callback(message);
            } catch (error) {
                console.error('Message callback error:', error);
            }
        });
    }

    private forwardMessage(message: MeshMessage) {
        // Decrement TTL
        const forwardedMessage: MeshMessage = {
            ...message,
            ttl: message.ttl - 1,
            seenBy: [...message.seenBy, this.userId]
        };

        // Don't forward if TTL is 0
        if (forwardedMessage.ttl <= 0) {
            return;
        }

        // Send to all connected peers except the sender
        this.sendToNative('forwardMessage', {
            message: forwardedMessage,
            excludePeers: message.seenBy
        });
    }

    private handlePeerDiscovered(peer: Peer) {
        console.log('Peer discovered:', peer.displayName);
        this.peers.set(peer.id, peer);

        // Notify callbacks
        this.onPeerCallbacks.forEach(callback => {
            try {
                callback(peer);
            } catch (error) {
                console.error('Peer callback error:', error);
            }
        });
    }

    private handlePeerLost(peerId: string) {
        const peer = this.peers.get(peerId);
        if (peer) {
            console.log('Peer lost:', peer.displayName);
            peer.connected = false;
            this.peers.set(peerId, peer);

            // Notify callbacks
            this.onPeerCallbacks.forEach(callback => {
                try {
                    callback(peer);
                } catch (error) {
                    console.error('Peer callback error:', error);
                }
            });
        }
    }

    // Public API
    public sendMessage(
        recipient: string,
        type: MeshMessage['type'],
        payload: string | Uint8Array
    ): string {
        const message: MeshMessage = {
            id: this.generateUUID(),
            type,
            sender: this.userId,
            recipient,
            payload,
            timestamp: Date.now(),
            ttl: 10, // Max 10 hops
            seenBy: [this.userId],
            encrypted: false // Will add encryption in Milestone 6
        };

        // Add to our own cache
        this.messageCache.add(message.id);

        // Send via native bridge
        this.sendToNative('sendMessage', { message });

        return message.id;
    }

    public onMessage(callback: MessageCallback) {
        this.onMessageCallbacks.push(callback);
    }

    public onPeerChange(callback: PeerCallback) {
        this.onPeerCallbacks.push(callback);
    }

    public getConnectedPeers(): Peer[] {
        return Array.from(this.peers.values()).filter(p => p.connected);
    }

    public disconnect() {
        this.sendToNative('stopMultipeer', {});
        this.peers.clear();
        this.messageCache.clear();
    }

    private generateUUID(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}

export default MultipeerManager;
