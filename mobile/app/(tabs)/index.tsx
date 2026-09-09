import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/api/client';
import { getCurrentPosition } from '@/services/location';
import { saveEntity, getLocalEntities, type LocalEntity } from '@/db/store';
import { syncPending, watchConnectivity } from '@/services/sync';
import { colors } from '@/theme';
import { formatDateTime } from '@/lib/format';

interface Visit {
  id: string;
  client?: { companyName: string } | null;
  lat: number;
  lng: number;
  notes?: string | null;
  visitedAt: string;
}

export default function DashboardScreen() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [offlineVisits, setOfflineVisits] = useState<LocalEntity[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [locating, setLocating] = useState(false);
  const [online, setOnline] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.get('/visits', { headers: { Authorization: `Bearer ${token}` } });
      setVisits(res.data);
    } catch {
      setOnline(false);
    }
    setOfflineVisits(await getLocalEntities('VISIT'));
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token) return;
    const sub = watchConnectivity(token, setOnline);
    return () => sub();
  }, [token]);

  async function checkIn() {
    if (!token) return;
    setLocating(true);
    try {
      const coords = await getCurrentPosition();
      if (!coords) return Alert.alert('خطأ', 'تعذر الحصول على موقع GPS');

      const visit = { lat: coords.lat, lng: coords.lng, accuracy: coords.accuracy, notes: 'زيارة ميدانية' };
      try {
        const res = await api.post('/visits', visit, { headers: { Authorization: `Bearer ${token}` } });
        await saveEntity('VISIT', res.data, res.data.id);
        Alert.alert('تم', 'تم تسجيل زيارة الموقع');
      } catch {
        await saveEntity('VISIT', visit);
        Alert.alert('حفظ محلي', 'لا يوجد اتصال — تم حفظ الزيارة محلياً وستتم مزامنتها لاحقاً');
      }
      await load();
    } finally {
      setLocating(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    if (token) {
      const { synced } = await syncPending(token).catch(() => ({ synced: 0, failed: 0 }));
      if (synced > 0) setOnline(true);
    }
    await load().catch(() => {});
    setRefreshing(false);
  }

  const items = [...visits, ...offlineVisits.map((o) => ({ id: `local-${o.id}`, client: null, lat: 0, lng: 0, notes: `محلي: ${String(o.payload.notes ?? 'زيارة')}`, visitedAt: o.createdAt }))];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>أهلاً {user?.name}</Text>
        <Text style={styles.status}>{online ? 'متصل' : 'وضع عدم الاتصال'}</Text>
      </View>

      <Pressable style={styles.checkinBtn} onPress={checkIn} disabled={locating}>
        <Text style={styles.checkinText}>{locating ? 'جاري تحديد الموقع...' : 'بدء زيارة ميدانية (تسجيل GPS)'}</Text>
      </Pressable>

      <View style={styles.row}>
        <Pressable style={styles.action} onPress={() => router.push('/client/new')}>
          <Text style={styles.actionTitle}>عميل جديد</Text>
          <Text style={styles.actionSub}>إضافة عميل مع موقع GPS</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={() => router.push('/roller/new')}>
          <Text style={styles.actionTitle}>أسطوانة</Text>
          <Text style={styles.actionSub}>قياس ومواصفات أسطوانة</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>زيارات اليوم</Text>
      <FlatList
        data={items}
        keyExtractor={(v) => v.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.client?.companyName ?? 'زيارة ميدانية'}</Text>
            <Text style={styles.cardMeta}>
              {item.lat ? `${item.lat.toFixed(5)}, ${item.lng.toFixed(5)}` : ''} · {formatDateTime(item.visitedAt)}
            </Text>
            {item.notes ? <Text style={styles.cardNotes}>{item.notes}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 60 },
  header: { paddingHorizontal: 16, marginBottom: 12 },
  greeting: { fontSize: 20, fontWeight: '700', color: colors.text },
  status: { fontSize: 12, color: colors.muted, marginTop: 2 },
  checkinBtn: { backgroundColor: colors.brand, marginHorizontal: 16, borderRadius: 12, padding: 18, alignItems: 'center' },
  checkinText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  row: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 12 },
  action: { flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 14 },
  actionTitle: { fontWeight: '700', color: colors.brand },
  actionSub: { fontSize: 11, color: colors.muted, marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', paddingHorizontal: 16, marginTop: 20, marginBottom: 8, color: colors.text },
  card: { backgroundColor: colors.card, marginHorizontal: 16, marginBottom: 10, padding: 14, borderRadius: 10 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  cardMeta: { fontSize: 12, color: colors.muted, marginTop: 4 },
  cardNotes: { fontSize: 12, color: colors.text, marginTop: 4 },
});
