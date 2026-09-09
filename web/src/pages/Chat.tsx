import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { api, authHeaders, SOCKET_URL } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useI18n, formatTime } from '../i18n';

interface Conversation {
  id: string;
  other: { id: string; name: string; role: string } | null;
  lastMessage: { id: string; content: string; senderId: string; senderName: string; readAt: string | null; createdAt: string } | null;
  unreadCount: number;
  updatedAt: string;
}

interface ChatMessage {
  id: string;
  conversationId?: string;
  senderId: string;
  senderName: string;
  content: string;
  readAt: string | null;
  createdAt: string;
}

interface Rep {
  id: string;
  name: string;
  phone: string;
  isActive: boolean;
}

export function Chat() {
  const { token, user } = useAuth();
  const { t, lang } = useI18n();
  const [searchParams] = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [reps, setReps] = useState<Rep[]>([]);
  const [showNew, setShowNew] = useState(false);
  const myId = user?.id;
  const activeRef = useRef<string | null>(null);
  activeRef.current = activeId;

  const loadConversations = useCallback(async () => {
    if (!token) return;
    const res = await api.get('/conversations', authHeaders(token));
    setConversations(res.data);
  }, [token]);

  useEffect(() => {
    void loadConversations();
    if (token) {
      api.get('/manager/reps', authHeaders(token)).then((r) => setReps(r.data));
    }
  }, [token, loadConversations]);

  // فتح/إنشاء محادثة مباشرة عبر ?userId=
  useEffect(() => {
    const userId = searchParams.get('userId');
    if (!userId || !token) return;
    api
      .post('/conversations', { participantId: userId }, authHeaders(token))
      .then((res) => {
        const conv = res.data as Conversation;
        setActiveId(conv.id);
        setSearchParamsRemoved();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, token]);

  function setSearchParamsRemoved() {
    const url = new URL(window.location.href);
    url.searchParams.delete('userId');
    window.history.replaceState({}, '', url.pathname + url.search);
  }

  // اتصال لحظي
  useEffect(() => {
    if (!token) return;
    const socket = io(SOCKET_URL, { auth: { token } });
    socket.on('message:new', (payload: { conversationId: string; message: ChatMessage }) => {
      const { conversationId, message } = payload;
      setConversations((prev) => {
        const target = prev.find((c) => c.id === conversationId);
        if (!target) {
          void loadConversations();
          return prev;
        }
        const rest = prev.filter((c) => c.id !== conversationId);
        const updated: Conversation = {
          ...target,
          lastMessage: { ...message, id: message.id, content: message.content, senderId: message.senderId, senderName: message.senderName, readAt: message.readAt, createdAt: message.createdAt },
          unreadCount: conversationId === activeRef.current ? 0 : target.unreadCount + 1,
          updatedAt: message.createdAt,
        };
        return [updated, ...rest];
      });
      if (conversationId === activeRef.current) {
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      }
    });
    socket.on('conversation:read', (payload: { conversationId: string; userId: string }) => {
      setMessages((prev) =>
        prev.map((m) => (m.senderId === payload.userId && !m.readAt ? { ...m, readAt: new Date().toISOString() } : m)),
      );
    });
    return () => {
      socket.disconnect();
    };
  }, [token, loadConversations]);

  async function openConversation(convId: string) {
    if (!token) return;
    setActiveId(convId);
    const res = await api.get(`/conversations/${convId}/messages`, { params: { limit: 200 }, ...authHeaders(token) });
    setMessages(res.data);
    await api.post(`/conversations/${convId}/read`, {}, authHeaders(token)).catch(() => {});
    setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c)));
  }

  async function startChat(repId: string) {
    if (!token) return;
    const res = await api.post('/conversations', { participantId: repId }, authHeaders(token));
    const conv = res.data as Conversation;
    setShowNew(false);
    await loadConversations();
    await openConversation(conv.id);
  }

  async function send() {
    const content = input.trim();
    if (!content || !token || !activeId) return;
    setInput('');
    const res = await api.post(`/conversations/${activeId}/messages`, { content }, authHeaders(token));
    const message = res.data as ChatMessage;
    setMessages((prev) => [...prev, message]);
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeId
          ? { ...c, lastMessage: { ...message, id: message.id, content: message.content, senderId: message.senderId, senderName: message.senderName, readAt: message.readAt, createdAt: message.createdAt }, updatedAt: message.createdAt }
          : c,
      ),
    );
  }

  const activeConv = conversations.find((c) => c.id === activeId);

  return (
    <div>
      <h2>{t('chat.title')}</h2>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
        <button onClick={() => setShowNew((v) => !v)} style={btnStyle}>{t('chat.newConv')}</button>
        {showNew && (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) void startChat(e.target.value);
            }}
            style={inputStyle}
          >
            <option value="">{t('chat.selectRep')}</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.phone}){r.isActive ? '' : ` ${t('chat.suspended')}`}
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, height: '70vh' }}>
        <div style={{ width: 320, overflowY: 'auto', background: 'rgba(30, 41, 59, 0.4)', borderRadius: 10, padding: 8, border: '1px solid rgba(148, 163, 184, 0.08)' }}>
          {conversations.map((c) => (
            <div
              key={c.id}
              onClick={() => void openConversation(c.id)}
              style={{
                padding: 12,
                borderRadius: 8,
                cursor: 'pointer',
                marginBottom: 6,
                background: c.id === activeId ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{c.other?.name ?? t('chat.unknown')}</strong>
                {c.unreadCount > 0 && (
                  <span style={{ background: '#dc2626', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 12 }}>{c.unreadCount}</span>
                )}
              </div>
              <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c.lastMessage ? c.lastMessage.content : t('chat.startChat')}
              </div>
            </div>
          ))}
          {conversations.length === 0 && <div style={{ color: '#64748b', textAlign: 'center', padding: 24 }}>{t('chat.noConversations')}</div>}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(30, 41, 59, 0.4)', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(148, 163, 184, 0.08)' }}>
          <div style={{ padding: 12, borderBottom: '1px solid rgba(148, 163, 184, 0.08)', fontWeight: '700', color: '#f8fafc' }}>
            {activeConv?.other?.name ?? t('chat.selectConv')}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            {messages.map((m) => {
              const mine = m.senderId === myId;
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                  <div
                    style={{
                      maxWidth: '70%',
                      padding: '8px 12px',
                      borderRadius: 12,
                      background: mine ? '#f59e0b' : 'rgba(15, 23, 42, 0.5)',
                      color: mine ? '#fff' : '#e2e8f0',
                    }}
                  >
                    {m.content}
                    <div style={{ fontSize: 10, marginTop: 4, color: mine ? '#dbeafe' : '#999' }}>
                      {formatTime(m.createdAt, lang)}
                      {mine ? (m.readAt ? ' ✓✓' : ' ✓') : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {activeId && (
            <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #e5e7eb' }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder={t('chat.placeholder')}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={() => void send()} style={btnStyle}>{t('chat.send')}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: 8, borderRadius: 8 };
const btnStyle: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' };
