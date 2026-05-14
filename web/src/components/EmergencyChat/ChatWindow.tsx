import React, { useState, useEffect, useRef } from 'react';
import MultipeerManager from '../../lib/mesh/multipeer';
import { hasSupabaseConfig } from '../../lib/supabase';
import { useTypingIndicator } from '../../lib/chat/useTypingIndicator';
import { useDocumentVisibility } from '../../lib/chat/useDocumentVisibility';
import {
    loadThread,
    markDelivered,
    markRead,
    rowToView,
    subscribeThread,
} from '../../lib/chat/realtimeChat';
import type { ChatMessageView, MessageStatus } from '../../lib/chat/realtimeChat';
import {
    cacheServerRow,
    drainOutbox,
    sendWithOutbox,
    storedToView,
} from '../../lib/chat/offlineSync';
import { loadDirectThread } from '../../lib/chat/messageStore';
import { isEmergencyEncoded } from '../../lib/chat/emergency';
import EmergencyBubble from '../MeshGuardian/EmergencyBubble';
import EmergencyComposer from '../MeshGuardian/EmergencyComposer';
import TransportIndicator from '../MeshGuardian/TransportIndicator';
import { useNetworkStatus } from '../../lib/chat/useNetworkStatus';
import type { ChatMessage, Peer } from '../../lib/mesh/types';
import './ChatWindow.css';

interface ChatWindowProps {
    userId: string;
    userName: string;
    recipientId: string;
    recipientName: string;
    mode: 'native' | 'web';
    /** Optional GPS to attach to emergency messages */
    position?: { lat: number; lon: number } | null;
}

type WebMessage = ChatMessage & { status?: MessageStatus };

const STATUS_LABEL: Record<MessageStatus, string> = {
    pending: 'Sending…',
    sent: 'Sent',
    delivered: 'Delivered',
    read: 'Read',
};

const ChatWindow: React.FC<ChatWindowProps> = ({
    userId,
    userName,
    recipientId,
    recipientName,
    mode,
    position
}) => {
    const [messages, setMessages] = useState<WebMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [connectedPeers, setConnectedPeers] = useState<Peer[]>([]);
    const [sendError, setSendError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const scrollPositionsRef = useRef<Map<string, number>>(new Map());
    const previousRecipientRef = useRef<string | null>(null);
    const multipeerRef = useRef<MultipeerManager | null>(null);
    const { isPeerTyping, notifyTyping } = useTypingIndicator(
        mode === 'web' ? userId : null,
        mode === 'web' ? recipientId : null
    );
    const isWindowActive = useDocumentVisibility();
    const isWindowActiveRef = useRef(isWindowActive);
    useEffect(() => {
        isWindowActiveRef.current = isWindowActive;
    }, [isWindowActive]);

    // Phase 3.8 — auto-open Emergency Mode when offline.
    const { status: networkStatus } = useNetworkStatus();
    const [emergencyOpen, setEmergencyOpen] = useState(false);
    useEffect(() => {
        if (networkStatus === 'offline') {
            setEmergencyOpen(true);
        }
    }, [networkStatus]);

    useEffect(() => {
        if (mode !== 'native') {
            return undefined;
        }
        const multipeer = new MultipeerManager(userId, userName);
        multipeerRef.current = multipeer;

        multipeer.onMessage((meshMessage) => {
            if (
                meshMessage.type === 'text' &&
                (meshMessage.sender === recipientId || meshMessage.recipient === userId)
            ) {
                const chatMsg: ChatMessage = {
                    id: meshMessage.id,
                    senderId: meshMessage.sender,
                    senderName: meshMessage.sender === userId ? userName : recipientName,
                    recipientId: meshMessage.recipient,
                    content: meshMessage.payload as string,
                    timestamp: meshMessage.timestamp,
                    delivered: true,
                    hopCount: 10 - meshMessage.ttl
                };

                setMessages((prev) => [...prev, chatMsg]);
            }
        });

        multipeer.onPeerChange((_peer) => {
            setConnectedPeers(multipeer.getConnectedPeers());
        });

        return () => {
            multipeer.disconnect();
        };
    }, [mode, userId, userName, recipientId, recipientName]);

    useEffect(() => {
        if (mode !== 'web') {
            return undefined;
        }
        if (!hasSupabaseConfig) {
            setSendError('Supabase config missing.');
            return undefined;
        }

        let isCancelled = false;
        setMessages([]);
        setSendError(null);

        const viewToWebMessage = (view: ChatMessageView): WebMessage => ({
            id: view.id,
            senderId: view.senderId,
            senderName: view.senderId === userId ? userName : recipientName,
            recipientId: view.recipientId,
            content: view.body,
            timestamp: view.timestamp,
            delivered: view.status === 'delivered' || view.status === 'read',
            hopCount: 0,
            status: view.status,
        });

        const upsertMessage = (next: WebMessage) => {
            setMessages((prev) => {
                const existingIndex = prev.findIndex((m) => m.id === next.id);
                if (existingIndex === -1) {
                    return [...prev, next];
                }
                const copy = prev.slice();
                copy[existingIndex] = next;
                return copy;
            });
        };

        const initialLoad = async () => {
            // 1. Pre-hydrate from local cache so the chat shows immediately.
            try {
                const cached = await loadDirectThread(userId, recipientId);
                if (!isCancelled && cached.length > 0) {
                    const views = cached.map((row) => {
                        const v = storedToView(row);
                        return {
                            id: v.id,
                            senderId: v.senderId,
                            senderName: v.senderId === userId ? userName : recipientName,
                            recipientId: v.recipientId,
                            content: v.body,
                            timestamp: v.timestamp,
                            delivered: v.status === 'delivered' || v.status === 'read',
                            hopCount: 0,
                            status: v.status,
                        } as WebMessage;
                    });
                    setMessages(views);
                }
            } catch {
                // ignore IndexedDB errors
            }

            // 2. Fetch the canonical thread from Supabase.
            const rows = await loadThread(userId, recipientId);
            if (isCancelled) return;
            const views = rows.map((row) => viewToWebMessage(rowToView(row, userId)));
            setMessages(views);

            // 3. Cache the canonical thread locally for next time.
            await Promise.all(rows.map((row) => cacheServerRow(row, userId)));

            // Mark received messages as delivered + read since the chat is open
            void markDelivered(userId, recipientId);
            void markRead(userId, recipientId);

            // 4. Drain any outbox entries left over from a previous offline session.
            void drainOutbox().catch(() => {});
        };
        void initialLoad();

        const cleanup = subscribeThread({
            userId,
            recipientId,
            onInsert: (row) => {
                if (isCancelled) return;
                upsertMessage(viewToWebMessage(rowToView(row, userId)));
                void cacheServerRow(row, userId);
                if (row.recipient_id === userId) {
                    void markDelivered(userId, recipientId);
                    void markRead(userId, recipientId);

                    // Browser notification when the window isn't focused
                    if (
                        !isWindowActiveRef.current &&
                        typeof Notification !== 'undefined' &&
                        Notification.permission === 'granted'
                    ) {
                        try {
                            new Notification(`Message from ${recipientName}`, {
                                body: row.body,
                                tag: `chat-${recipientId}`,
                                icon: '/apple-touch-icon-180.png',
                            });
                        } catch {
                            // Ignore notification errors (e.g. iOS Safari without PWA install)
                        }
                    }
                }
            },
            onUpdate: (row) => {
                if (isCancelled) return;
                upsertMessage(viewToWebMessage(rowToView(row, userId)));
                void cacheServerRow(row, userId);
            },
        });

        return () => {
            isCancelled = true;
            cleanup();
        };
    }, [mode, recipientId, recipientName, userId, userName]);

    // Save scroll position when leaving a peer + restore when re-entering.
    // Falls back to scrolling to the bottom when there's no saved position.
    useEffect(() => {
        const previousRecipient = previousRecipientRef.current;
        if (previousRecipient && previousRecipient !== recipientId) {
            const container = messagesContainerRef.current;
            if (container) {
                scrollPositionsRef.current.set(previousRecipient, container.scrollTop);
            }
        }
        previousRecipientRef.current = recipientId;
    }, [recipientId]);

    useEffect(() => {
        const container = messagesContainerRef.current;
        if (!container) return;

        const savedScroll = scrollPositionsRef.current.get(recipientId);
        if (savedScroll !== undefined) {
            // Restore saved position when switching back to a chat
            container.scrollTop = savedScroll;
        } else {
            // No saved position — scroll to bottom (newest message)
            messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
        }
    }, [recipientId, messages.length]);

    const handleSend = async () => {
        if (!inputText.trim()) {
            return;
        }

        if (mode === 'native') {
            if (!multipeerRef.current) {
                return;
            }
            const messageId = multipeerRef.current.sendMessage(
                recipientId,
                'text',
                inputText
            );

            const chatMsg: ChatMessage = {
                id: messageId,
                senderId: userId,
                senderName: userName,
                recipientId,
                content: inputText,
                timestamp: Date.now(),
                delivered: false,
                hopCount: 0
            };

            setMessages((prev) => [...prev, chatMsg]);
            setInputText('');
            return;
        }

        if (!hasSupabaseConfig) {
            setSendError('Supabase config missing.');
            return;
        }

        setSendError(null);

        // Optimistic write through offlineSync (writes to IndexedDB + outbox first,
        // then attempts the actual send). Even when the user is offline, the
        // message is queued and will surface in the UI.
        const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const optimistic: WebMessage = {
            id: tempId,
            senderId: userId,
            senderName: userName,
            recipientId,
            content: inputText,
            timestamp: Date.now(),
            delivered: false,
            hopCount: 0,
            status: 'pending',
        };
        setMessages((prev) => [...prev, optimistic]);
        const sentText = inputText;
        setInputText('');

        const result = await sendWithOutbox(userId, recipientId, sentText);

        if (result.pending) {
            // Send failed (or we're offline) — keep the pending bubble visible.
            // It stays in the outbox and will be retried when network returns.
            if (result.error) {
                setSendError(result.error);
            }
            return;
        }

        if (!result.serverRow) return;

        // Swap the temp bubble with the canonical server row
        const view = rowToView(result.serverRow, userId);
        setMessages((prev) =>
            prev.map((m) =>
                m.id === tempId
                    ? {
                          id: view.id,
                          senderId: view.senderId,
                          senderName: userName,
                          recipientId: view.recipientId,
                          content: view.body,
                          timestamp: view.timestamp,
                          delivered:
                              view.status === 'delivered' || view.status === 'read',
                          hopCount: 0,
                          status: view.status,
                      }
                    : m,
            ),
        );
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void handleSend();
        }
    };

    return (
        <div className="chat-window">
            <div className="chat-header">
                <h2>{recipientName}</h2>
                <div className="peer-status">
                    {mode === 'native'
                        ? `${connectedPeers.length} peer${connectedPeers.length !== 1 ? 's' : ''} connected`
                        : isPeerTyping
                            ? 'typing…'
                            : 'Online chat'}
                </div>
                {mode === 'web' && <TransportIndicator compact />}
                {mode === 'web' && (
                    <button
                        type="button"
                        className={`chat-emergency-toggle ${emergencyOpen ? 'is-open' : ''}`}
                        onClick={() => setEmergencyOpen((v) => !v)}
                        title={
                            emergencyOpen
                                ? 'Hide emergency composer'
                                : 'Open emergency composer (compact LoRa-friendly messages)'
                        }
                    >
                        {emergencyOpen ? '× Close' : '⚠ Emergency'}
                    </button>
                )}
            </div>

            <div className="messages-container" ref={messagesContainerRef}>
                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`message ${msg.senderId === userId ? 'sent' : 'received'}`}
                    >
                        <div className="message-bubble">
                            {isEmergencyEncoded(msg.content) ? (
                                <EmergencyBubble encoded={msg.content} />
                            ) : (
                                <div className="message-content">{msg.content}</div>
                            )}
                            <div className="message-meta">
                                <span className="message-time">
                                    {new Date(msg.timestamp).toLocaleTimeString()}
                                </span>
                                {msg.senderId === userId && (
                                    <span className={`message-status status-${msg.status ?? (msg.delivered ? 'delivered' : 'sent')}`}>
                                        {mode === 'web' && msg.status
                                            ? STATUS_LABEL[msg.status]
                                            : msg.delivered
                                                ? 'Delivered'
                                                : 'Sent'}
                                    </span>
                                )}
                                {mode === 'native' && msg.hopCount > 0 && (
                                    <span className="hop-count">
                                        {msg.hopCount} hop{msg.hopCount > 1 ? 's' : ''}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {mode === 'web' && emergencyOpen && (
                <div className="chat-emergency-wrap">
                    <EmergencyComposer
                        position={position ?? null}
                        onSend={async (encoded) => {
                            // Reuse the same web-mode send path. The encoded `EWS|...`
                            // string is what gets stored and shown via EmergencyBubble.
                            const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                            const optimistic: WebMessage = {
                                id: tempId,
                                senderId: userId,
                                senderName: userName,
                                recipientId,
                                content: encoded,
                                timestamp: Date.now(),
                                delivered: false,
                                hopCount: 0,
                                status: 'pending',
                            };
                            setMessages((prev) => [...prev, optimistic]);
                            const result = await sendWithOutbox(userId, recipientId, encoded);
                            if (!result.pending && result.serverRow) {
                                setMessages((prev) =>
                                    prev.map((m) => {
                                        if (m.id !== tempId) return m;
                                        return {
                                            ...m,
                                            id: result.serverRow!.id,
                                            timestamp: new Date(
                                                result.serverRow!.created_at,
                                            ).getTime(),
                                            status: 'sent',
                                        };
                                    }),
                                );
                            }
                        }}
                    />
                </div>
            )}

            <div className="chat-input">
                <textarea
                    value={inputText}
                    onChange={(e) => {
                        setInputText(e.target.value);
                        if (mode === 'web' && e.target.value.length > 0) {
                            notifyTyping();
                        }
                    }}
                    onKeyPress={handleKeyPress}
                    placeholder="Type a message..."
                    rows={2}
                />
                <button onClick={() => void handleSend()} disabled={!inputText.trim()}>
                    Send
                </button>
            </div>
            {sendError && <p className="error">{sendError}</p>}
        </div>
    );
};

export default ChatWindow;
