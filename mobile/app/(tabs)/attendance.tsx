import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/api/client';
import { getCurrentPosition } from '@/services/location';
import { colors } from '@/theme';
import { formatDate, formatDateTime } from '@/lib/format';

interface AttendanceRecord {
  id: string;
  date: string;
  checkInTime: string;
  lat: number;
  lng: number;
  accuracy?: number | null;
}

export default function AttendanceScreen() {
  const { token, user } = useAuth();
  const [today, setToday] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [todayRes, historyRes] = await Promise.all([
        api.get('/attendance/today', { headers: { Authorization: `Bearer ${token}` } }),
        api.get('/attendance', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setToday(todayRes.data);
      setHistory(historyRes.data);
    } catch {
      // يبقى العرض كما هو عند عدم الاتصال
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function checkIn() {
    if (!token || locating) return;
    setLocating(true);
    try {
      const coords = await getCurrentPosition();
      if (!coords) return Alert.alert('خطأ', 'تعذر الحصول على موقع GPS');

      try {
        const res = await api.post(
          '/attendance/check-in',
          { lat: coords.lat, lng: coords.lng, accuracy: coords.accuracy },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        setToday(res.data);
        Alert.alert('تم', 'تم تسجيل حضورك اليوم');
      } catch (e) {
        if ((e as { response?: { status?: number } }).response?.status === 409) {
          Alert.alert('منع', 'تم تسجيل حضورك اليوم مسبقاً — مرة واحدة لكل يوم');
        } else {
          Alert.alert('تعذر الحفظ', 'لا يوجد اتصال — حاول مرة أخرى');
        }
      }
      await load();
    } finally {
      setLocating(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await load().catch(() => {});
    setRefreshing(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>أهلاً {user?.name}</Text>
        <Text style={styles.status}>تسجيل الحضور — مرة واحدة فقط في اليوم</Text>
      </View>

      {loading ? (
        <Text style={styles.loading}>جاري التحميل...</Text>
      ) : today ? (
        <View style={styles.presentCard}>
          <Text style={styles.presentTitle}>تم تسجيل حضورك اليوم</Text>
          <Text style={styles.presentTime}>الساعة {formatDateTime(today.checkInTime).split(' ')[1]}</Text>
          <Text style={styles.presentMeta}>
            {today.lat.toFixed(5)}, {today.lng.toFixed(5)}
          </Text>
        </View>
      ) : (
        <Pressable style={styles.checkinBtn} onPress={checkIn} disabled={locating}>
          <Text style={styles.checkinText}>{locating ? 'جاري تحديد الموقع...' : 'تسجيل الحضور (تحديد GPS)'}</Text>
        </Pressable>
      )}

      <Text style={styles.sectionTitle}>سجل الحضور</Text>
      <FlatList
        data={history}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{formatDate(item.date)}</Text>
            <Text style={styles.cardMeta}>حضور {formatDateTime(item.checkInTime)}</Text>
            <Text style={styles.cardMeta}>
              {item.lat.toFixed(5)}, {item.lng.toFixed(5)}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.cardMeta}>لا يوجد سجل حضور بعد</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 60 },
  header: { paddingHorizontal: 16, marginBottom: 16 },
  greeting: { fontSize: 20, fontWeight: '700', color: colors.text },
  status: { fontSize: 12, color: colors.muted, marginTop: 2 },
  loading: { textAlign: 'center', color: colors.muted, marginTop: 20 },
  checkinBtn: { backgroundColor: colors.brand, marginHorizontal: 16, borderRadius: 12, padding: 18, alignItems: 'center' },
  checkinText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  presentCard: { backgroundColor: colors.success, marginHorizontal: 16, borderRadius: 12, padding: 18 },
  presentTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  presentTime: { color: '#fff', fontSize: 32, fontWeight: '800', marginTop: 6 },
  presentMeta: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', paddingHorizontal: 16, marginTop: 20, marginBottom: 8, color: colors.text },
  list: { paddingBottom: 20 },
  card: { backgroundColor: colors.card, marginHorizontal: 16, marginBottom: 10, padding: 14, borderRadius: 10 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  cardMeta: { fontSize: 12, color: colors.muted, marginTop: 4 },
});