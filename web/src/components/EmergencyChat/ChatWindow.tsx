import React, { useState, useEffect, useRef } from 'react';
import MultipeerManager from '../../lib/mesh/multipeer';
import type { ChatMessage, Peer } from '../../lib/mesh/types';
import './ChatWindow.css';

interface ChatWindowProps {
    userId: string;
    userName: string;
    recipientId: string;
    recipientName: string;
}

const ChatWindow: React.FC<ChatWindowProps> = ({
    userId,
    userName,
    recipientId,
    recipientName
}) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [connectedPeers, setConnectedPeers] = useState<Peer[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const multipeerRef = useRef<MultipeerManager | null>(null);

    useEffect(() => {
        // Initialize Multipeer
        const multipeer = new MultipeerManager(userId, userName);
        multipeerRef.current = multipeer;

        // Listen for incoming messages
        multipeer.onMessage((meshMessage) => {
            if (meshMessage.type === 'text' &&
                (meshMessage.sender === recipientId || meshMessage.recipient === userId)) {
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

                setMessages(prev => [...prev, chatMsg]);
            }
        });

        // Listen for peer changes
        multipeer.onPeerChange((_peer) => {
            setConnectedPeers(multipeer.getConnectedPeers());
        });

        return () => {
            multipeer.disconnect();
        };
    }, [userId, userName, recipientId, recipientName]);

    useEffect(() => {
        // Auto-scroll to bottom
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = () => {
        if (!inputText.trim() || !multipeerRef.current) return;

        const messageId = multipeerRef.current.sendMessage(
            recipientId,
            'text',
            inputText
        );

        // Add to local messages
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

        setMessages(prev => [...prev, chatMsg]);
        setInputText('');
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="chat-window">
            <div className="chat-header">
                <h2>{recipientName}</h2>
                <div className="peer-status">
                    {connectedPeers.length} peer{connectedPeers.length !== 1 ? 's' : ''} connected
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
                                        {msg.delivered ? '✓✓' : '✓'}
                                    </span>
                                )}
                                {msg.hopCount > 0 && (
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
                <button onClick={handleSend} disabled={!inputText.trim()}>
                    Send
                </button>
            </div>
        </div>
    );
};

export default ChatWindow;
