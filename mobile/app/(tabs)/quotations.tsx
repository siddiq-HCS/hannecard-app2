import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/api/client';
import { getLocalEntities } from '@/db/store';
import { colors } from '@/theme';
import { money, formatDate } from '@/lib/format';

interface Quotation {
  id: string;
  quotationNumber: string;
  client: { companyName: string };
  status: string;
  grandTotal: string | number;
  createdAt: string;
}

interface OfflineQuotation {
  id: string;
  quotationNumber: string;
  client: string;
  status: string;
  grandTotal: string | number;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'مسودة',
  PENDING_APPROVAL: 'بانتظار الموافقة',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
  CONVERTED_TO_WORK_ORDER: 'تحول لأمر إنتاج',
};

export default function QuotationsScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [offline, setOffline] = useState<OfflineQuotation[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.get('/quotations', { headers: { Authorization: `Bearer ${token}` } });
      setQuotations(res.data);
    } catch {
      // بدون اتصال
    }
    const local = await getLocalEntities('QUOTATION');
    setOffline(local.map((l) => ({
      id: `local-${l.id}`,
      quotationNumber: String(l.payload.quotationNumber ?? 'مسودة محلية'),
      client: String(l.payload.clientName ?? 'عميل محلي'),
      status: 'DRAFT',
      grandTotal: Number(l.payload.grandTotal ?? 0),
      createdAt: l.createdAt,
    })));
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = [...quotations, ...offline];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>عروض الأسعار</Text>
        <Pressable style={styles.addBtn} onPress={() => router.push('/quotation/new')}>
          <Text style={styles.addText}>+ عرض</Text>
        </Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push(`/quotation/${item.id}`)}>
            <View style={styles.cardRow}>
              <Text style={styles.cardNumber}>{item.quotationNumber}</Text>
              <Text style={[styles.badge, item.status === 'PENDING_APPROVAL' && styles.badgeWarn]}>{STATUS_LABELS[item.status] ?? item.status}</Text>
            </View>
            <Text style={styles.cardClient}>{typeof item.client === 'string' ? item.client : item.client.companyName}</Text>
            <Text style={styles.cardMeta}>{formatDate(item.createdAt)} · الإجمالي: {money(item.grandTotal)}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  addBtn: { backgroundColor: colors.brand, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addText: { color: '#fff', fontWeight: '700' },
  card: { backgroundColor: colors.card, marginHorizontal: 16, marginBottom: 10, padding: 14, borderRadius: 10 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardNumber: { fontWeight: '700', color: colors.text, fontSize: 14 },
  badge: { fontSize: 11, color: colors.success, backgroundColor: '#dcfce7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, fontWeight: '600' },
  badgeWarn: { color: colors.warning, backgroundColor: '#fef3c7' },
  cardClient: { fontSize: 13, color: colors.muted, marginTop: 6 },
  cardMeta: { fontSize: 12, color: colors.muted, marginTop: 4 },
});
