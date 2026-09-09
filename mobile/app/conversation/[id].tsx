import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { api } from '@/api/client';
import { getSocket } from '@/services/socket';

interface ChatMessage {
  id: string;
  conversationId?: string;
  senderId: string;
  senderName: string;
  content: string;
  readAt: string | null;
  createdAt: string;
}

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token, user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [title, setTitle] = useState(t('conversation.title'));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const myId = user?.id;

  const loadTitle = useCallback(async () => {
    if (!token) return;
    const res = await api.get('/conversations', { headers: { Authorization: `Bearer ${token}` } });
    const found = (res.data as { id: string; other: { name: string } | null }[]).find((c) => c.id === id);
    if (found?.other) setTitle(found.other.name);
  }, [token, id]);

  const loadMessages = useCallback(async () => {
    if (!token) return;
    const res = await api.get(`/conversations/${id}/messages`, {
      params: { limit: 200 },
      headers: { Authorization: `Bearer ${token}` },
    });
    setMessages((res.data as ChatMessage[]).slice().reverse());
  }, [token, id]);

  useEffect(() => {
    void loadTitle();
    void loadMessages();
  }, [loadTitle, loadMessages]);

  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    const onNew = (payload: { conversationId: string; message: ChatMessage }) => {
      if (payload.conversationId !== id) return;
      setMessages((prev) => (prev.some((m) => m.id === payload.message.id) ? prev : [...prev, payload.message]));
    };
    const onRead = (payload: { conversationId: string; userId: string }) => {
      if (payload.conversationId !== id) return;
      setMessages((prev) => prev.map((m) => (m.senderId === payload.userId && !m.readAt ? { ...m, readAt: new Date().toISOString() } : m)));
    };
    socket.on('message:new', onNew);
    socket.on('conversation:read', onRead);
    return () => {
      socket.off('message:new', onNew);
      socket.off('conversation:read', onRead);
    };
  }, [token, id]);

  async function send() {
    const content = input.trim();
    if (!content || !token) return;
    setInput('');
    setSending(true);
    try {
      const res = await api.post(
        `/conversations/${id}/messages`,
        { content },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setMessages((prev) => [...prev, res.data as ChatMessage]);
    } catch {
      setInput(content);
    } finally {
      setSending(false);
    }
  }

  const sorted = useMemo(() => messages.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [messages]);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>{t('conversation.back')}</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={{ width: 56 }} />
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => {
          const mine = item.senderId === myId;
          return (
            <View style={[styles.bubbleWrap, mine ? styles.mineWrap : styles.theirsWrap]}>
              <View style={[styles.bubble, mine ? styles.mineBubble : styles.theirsBubble]}>
                <Text style={mine ? styles.mineText : styles.theirsText}>{item.content}</Text>
                <Text style={[styles.time, mine ? styles.mineTime : styles.theirsTime]}>
                  {new Date(item.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                  {mine && <Text> {item.readAt ? '✓✓' : '✓'}</Text>}
                </Text>
              </View>
            </View>
          );
        }}
      />

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={t('conversation.placeholder')}
          multiline
          onSubmitEditing={() => void send()}
        />
        <Pressable style={[styles.sendBtn, sending && styles.sendDisabled]} onPress={() => void send()} disabled={sending}>
          <Text style={styles.sendText}>{t('conversation.send')}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  backBtn: { width: 56 },
  backText: { color: '#2563eb', fontWeight: '600' },
  headerTitle: { fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
  bubbleWrap: { flexDirection: 'row', marginBottom: 8 },
  mineWrap: { justifyContent: 'flex-end' },
  theirsWrap: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '78%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  mineBubble: { backgroundColor: '#2563eb', borderBottomRightRadius: 4 },
  theirsBubble: { backgroundColor: '#fff', borderBottomLeftRadius: 4 },
  mineText: { color: '#fff', fontSize: 15 },
  theirsText: { color: '#111', fontSize: 15 },
  time: { fontSize: 10, marginTop: 4 },
  mineTime: { color: '#dbeafe' },
  theirsTime: { color: '#999' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  input: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 18, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, maxHeight: 100, backgroundColor: '#f9fafb' },
  sendBtn: { backgroundColor: '#2563eb', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10, marginStart: 8 },
  sendDisabled: { opacity: 0.6 },
  sendText: { color: '#fff', fontWeight: '600' },
});
