import React, { useState, useEffect, useRef } from 'react';
import MultipeerManager from '../../lib/mesh/multipeer';
import { hasSupabaseConfig, supabase } from '../../lib/supabase';
import type { ChatMessage, Peer } from '../../lib/mesh/types';
import './ChatWindow.css';

interface ChatWindowProps {
    userId: string;
    userName: string;
    recipientId: string;
    recipientName: string;
    mode: 'native' | 'web';
}

const ChatWindow: React.FC<ChatWindowProps> = ({
    userId,
    userName,
    recipientId,
    recipientName,
    mode
}) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [connectedPeers, setConnectedPeers] = useState<Peer[]>([]);
    const [sendError, setSendError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const multipeerRef = useRef<MultipeerManager | null>(null);

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

        const mapMessages = (rows: any[]) =>
            rows.map((row) => ({
                id: row.id,
                senderId: row.sender_id,
                senderName: row.sender_id === userId ? userName : recipientName,
                recipientId: row.recipient_id,
                content: row.body,
                timestamp: new Date(row.created_at).getTime(),
                delivered: true,
                hopCount: 0
            }));

        const loadMessages = async () => {
            const { data, error } = await supabase
                .from('messages')
                .select('id, sender_id, recipient_id, body, created_at')
                .or(
                    `and(sender_id.eq.${userId},recipient_id.eq.${recipientId}),and(sender_id.eq.${recipientId},recipient_id.eq.${userId})`
                )
                .order('created_at', { ascending: true });

            if (error || !data || isCancelled) {
                if (error && !isCancelled) {
                    setSendError(error.message);
                }
                return;
            }
            setMessages(mapMessages(data));
            setSendError(null);
        };

        void loadMessages();
        const pollId = window.setInterval(loadMessages, 5000);

        const handleInsert = (payload: any) => {
            const row = payload.new;
            if (!row || isCancelled) {
                return;
            }
            const isThreadMatch =
                (row.sender_id === userId && row.recipient_id === recipientId) ||
                (row.sender_id === recipientId && row.recipient_id === userId);
            if (!isThreadMatch) {
                return;
            }
            setMessages((prev) => {
                if (prev.some((msg) => msg.id === row.id)) {
                    return prev;
                }
                return [
                    ...prev,
                    {
                        id: row.id,
                        senderId: row.sender_id,
                        senderName: row.sender_id === userId ? userName : recipientName,
                        recipientId: row.recipient_id,
                        content: row.body,
                        timestamp: new Date(row.created_at).getTime(),
                        delivered: true,
                        hopCount: 0
                    }
                ];
            });
        };

        const senderChannel = supabase
            .channel(`messages-sender-${userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `sender_id=eq.${userId}`
                },
                handleInsert
            )
            .subscribe();

        const recipientChannel = supabase
            .channel(`messages-recipient-${userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `recipient_id=eq.${userId}`
                },
                handleInsert
            )
            .subscribe();

        return () => {
            isCancelled = true;
            window.clearInterval(pollId);
            supabase.removeChannel(senderChannel);
            supabase.removeChannel(recipientChannel);
        };
    }, [mode, recipientId, recipientName, userId, userName]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

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
        const { data, error } = await supabase
            .from('messages')
            .insert({
                sender_id: userId,
                recipient_id: recipientId,
                body: inputText
            })
            .select('id, sender_id, recipient_id, body, created_at')
            .single();

        if (error || !data) {
            setSendError(error?.message ?? 'Unable to send message.');
            return;
        }

        setMessages((prev) => [
            ...prev,
            {
                id: data.id,
                senderId: data.sender_id,
                senderName: userName,
                recipientId: data.recipient_id,
                content: data.body,
                timestamp: new Date(data.created_at).getTime(),
                delivered: true,
                hopCount: 0
            }
        ]);
        setInputText('');
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
                        : 'Online chat'}
                </div>
            </div>

            <div className="messages-container">
                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`message ${msg.senderId === userId ? 'sent' : 'received'}`}
                    >
                        <div className="message-bubble">
                            <div className="message-content">{msg.content}</div>
                            <div className="message-meta">
                                <span className="message-time">
                                    {new Date(msg.timestamp).toLocaleTimeString()}
                                </span>
                                {msg.senderId === userId && (
                                    <span className="message-status">
                                        {msg.delivered ? 'Delivered' : 'Sent'}
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

            <div className="chat-input">
                <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
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
