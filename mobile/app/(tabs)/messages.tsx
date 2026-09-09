import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { api } from '@/api/client';
import { getSocket } from '@/services/socket';
import { Logo } from '@/components/Logo';

interface Conversation {
  id: string;
  other: { id: string; name: string; role: string } | null;
  lastMessage: { id: string; content: string; senderId: string; senderName: string; createdAt: string } | null;
  unreadCount: number;
  updatedAt: string;
}

interface Contact {
  id: string;
  name: string;
  phone: string;
  role: string;
  isActive: boolean;
}

function timeLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('ar-EG');
}

export default function MessagesScreen() {
  const { token } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showContacts, setShowContacts] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const res = await api.get('/conversations', { headers: { Authorization: `Bearer ${token}` } });
    setConversations(res.data);
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    const onNew = () => void load();
    socket.on('message:new', onNew);
    socket.on('conversation:read', onNew);
    return () => {
      socket.off('message:new', onNew);
      socket.off('conversation:read', onNew);
    };
  }, [token, load]);

  async function openContacts() {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.get('/conversations/contacts', { headers: { Authorization: `Bearer ${token}` } });
      setContacts(res.data);
      setShowContacts(true);
    } finally {
      setLoading(false);
    }
  }

  async function startChat(contactId: string) {
    if (!token) return;
    const res = await api.post('/conversations', { participantId: contactId }, { headers: { Authorization: `Bearer ${token}` } });
    setShowContacts(false);
    router.push(`/conversation/${(res.data as Conversation).id}`);
  }

  if (showContacts) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <View style={styles.headerTitleWrap}>
            <Logo size={30} />
            <Text style={styles.title}>{t('messages.newTitle')}</Text>
          </View>
          <Pressable onPress={() => setShowContacts(false)}>
            <Text style={styles.cancel}>{t('messages.back')}</Text>
          </Pressable>
        </View>
        <FlatList
          data={contacts}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => void startChat(item.id)}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name.slice(0, 1)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardMeta}>{item.role === 'REPRESENTATIVE' ? t('messages.rep') : t('messages.manager')} · {item.phone}</Text>
              </View>
            </Pressable>
          )}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerTitleWrap}>
          <Logo size={30} />
          <Text style={styles.title}>{t('messages.title')}</Text>
        </View>
        <Pressable style={styles.newBtn} onPress={() => void openContacts()} disabled={loading}>
          <Text style={styles.newBtnText}>{loading ? '...' : t('messages.new')}</Text>
        </Pressable>
      </View>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {
              void load();
            }}
          />
        }
        ListEmptyComponent={<Text style={styles.empty}>{t('messages.empty')}</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push(`/conversation/${item.id}`)}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.other?.name.slice(0, 1) ?? '؟'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{item.other?.name ?? t('messages.unknown')}</Text>
                {item.lastMessage && <Text style={styles.time}>{timeLabel(item.lastMessage.createdAt)}</Text>}
              </View>
              <View style={styles.cardHeader}>
                <Text style={styles.preview} numberOfLines={1}>
                  {item.lastMessage ? item.lastMessage.content : t('messages.startChat')}
                </Text>
                {item.unreadCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.unreadCount}</Text>
                  </View>
                )}
              </View>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingTop: 60 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 },
  headerTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  cancel: { color: '#2563eb', fontWeight: '600', fontSize: 15 },
  newBtn: { backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  newBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 10, padding: 12, borderRadius: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center', marginEnd: 12 },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  time: { fontSize: 12, color: '#999' },
  preview: { fontSize: 13, color: '#666', flex: 1, marginEnd: 8 },
  badge: { backgroundColor: '#dc2626', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  cardMeta: { fontSize: 12, color: '#666', marginTop: 4 },
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
});
