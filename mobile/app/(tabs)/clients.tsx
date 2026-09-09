import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, TextInput, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/api/client';
import { getLocalEntities } from '@/db/store';
import { colors } from '@/theme';

interface Client {
  id: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  address?: string | null;
  _count?: { rollerSpecs: number; quotations: number };
}

interface OfflineClient {
  id: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  address?: string | null;
  _count?: { rollerSpecs: number; quotations: number };
}

export default function ClientsScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [offlineClients, setOfflineClients] = useState<OfflineClient[]>([]);
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.get('/clients', { params: q ? { q } : {}, headers: { Authorization: `Bearer ${token}` } });
      setClients(res.data);
    } catch {
      // بدون اتصال
    }
    const local = await getLocalEntities('CLIENT');
    setOfflineClients(local.map((l) => ({
      id: `local-${l.id}`,
      companyName: String(l.payload.companyName ?? ''),
      contactPerson: String(l.payload.contactPerson ?? ''),
      phone: String(l.payload.phone ?? ''),
      address: l.payload.address ? String(l.payload.address) : null,
    })));
  }, [token, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = [...clients, ...offlineClients];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>العملاء</Text>
        <Pressable style={styles.addBtn} onPress={() => router.push('/client/new')}>
          <Text style={styles.addText}>+ جديد</Text>
        </Pressable>
      </View>

      <TextInput style={styles.search} placeholder="بحث بالاسم أو الهاتف..." value={q} onChangeText={setQ} />

      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card}>
            <Text style={styles.cardTitle}>{item.companyName}</Text>
            <Text style={styles.cardMeta}>المسؤول: {item.contactPerson} · {item.phone}</Text>
            {item.address ? <Text style={styles.cardMeta}>{item.address}</Text> : null}
            {item._count ? (
              <Text style={styles.cardCount}>أسطوانات: {item._count.rollerSpecs} · عروض: {item._count.quotations}</Text>
            ) : (
              <Text style={styles.cardCount}>غير مزامن بعد</Text>
            )}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  addBtn: { backgroundColor: colors.brand, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addText: { color: '#fff', fontWeight: '700' },
  search: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, marginHorizontal: 16, marginTop: 12, marginBottom: 12 },
  card: { backgroundColor: colors.card, marginHorizontal: 16, marginBottom: 10, padding: 14, borderRadius: 10 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  cardMeta: { fontSize: 12, color: colors.muted, marginTop: 4 },
  cardCount: { fontSize: 11, color: colors.brand, marginTop: 6, fontWeight: '600' },
});
