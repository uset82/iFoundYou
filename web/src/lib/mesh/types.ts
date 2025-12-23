// TypeScript types for mesh messaging
export interface MeshMessage {
    id: string;              // UUID
    type: 'text' | 'voice' | 'location' | 'sos';
    sender: string;          // User ID
    recipient: string;       // User ID or 'broadcast'
    payload: string | Uint8Array;
    timestamp: number;
    ttl: number;             // Hops remaining (max 10)
    seenBy: string[];        // Peer IDs that relayed this
    encrypted: boolean;
    signature?: string;      // Optional message signature
}

export interface Peer {
    id: string;
    displayName: string;
    connected: boolean;
    lastSeen: number;
    distance?: number;       // Estimated distance in meters
}

export interface ChatMessage {
    id: string;
    senderId: string;
    senderName: string;
    recipientId: string;
    content: string;
    timestamp: number;
    delivered: boolean;
    hopCount: number;
}

export interface VoiceMessage extends ChatMessage {
    audioData: Uint8Array;
    duration: number;        // seconds
    compressed: boolean;
}

export type MessageCallback = (message: MeshMessage) => void;
export type PeerCallback = (peer: Peer) => void;
