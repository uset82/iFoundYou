import { useEffect, useRef, useState } from 'react';
import {
  loadRoomThread,
  rowToRoomView,
  sendRoomMessage,
  subscribeRoom,
  listRoomMembers,
} from '../../lib/chat/rooms';
import type { ChatRoom, RoomMessageView } from '../../lib/chat/rooms';
import './GroupChatPanel.css';

interface GroupChatPanelProps {
  userId: string;
  userName: string;
  room: ChatRoom;
  onClose: () => void;
}

export default function GroupChatPanel({ userId, userName, room, onClose }: GroupChatPanelProps) {
  const [messages, setMessages] = useState<RoomMessageView[]>([]);
  const [members, setMembers] = useState<Array<{ userId: string; displayName: string }>>([]);
  const [inputText, setInputText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load + subscribe
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const [rows, memberList] = await Promise.all([
        loadRoomThread(room.id),
        listRoomMembers(room.id),
      ]);
      if (cancelled) return;
      setMessages(rows.map((r) => rowToRoomView(r, userId)));
      setMembers(memberList);
    };
    void init();

    const cleanup = subscribeRoom(room.id, (row) => {
      if (cancelled) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev;
        return [...prev, rowToRoomView(row, userId)];
      });
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [room.id, userId]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text) return;
    setError(null);
    setInputText('');

    const result = await sendRoomMessage(userId, room.id, text);
    if (result.error) {
      setError(result.error);
      setInputText(text);
    }
  };

  const memberSummary = members.length
    ? `${members.length} member${members.length === 1 ? '' : 's'}`
    : 'Loading members…';

  const memberNameMap = new Map(members.map((m) => [m.userId, m.displayName]));

  return (
    <div className="group-chat-panel">
      <div className="group-chat-toolbar">
        <div>
          <strong>{room.name}</strong>
          <span className="muted"> · {memberSummary}</span>
        </div>
        <button type="button" className="ghost small" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="group-chat-messages">
        {messages.length === 0 ? (
          <p className="muted">Be the first to say hello — {userName} 👋</p>
        ) : (
          messages.map((msg) => {
            const senderName =
              msg.senderId === userId
                ? userName
                : memberNameMap.get(msg.senderId) ?? 'Member';
            return (
              <div
                key={msg.id}
                className={`group-msg ${msg.senderId === userId ? 'sent' : 'received'}`}
              >
                <div className="group-msg-bubble">
                  <div className="group-msg-name">{senderName}</div>
                  <div className="group-msg-content">{msg.body}</div>
                  <div className="group-msg-time">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="group-chat-input">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder={`Message ${room.name}…`}
          rows={2}
        />
        <button
          type="button"
          className="primary"
          onClick={() => void handleSend()}
          disabled={!inputText.trim()}
        >
          Send
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
