import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { api } from '@/api/client';
import { getCurrentPosition } from '@/services/location';
import { todayLocal, type AttendanceRecord } from '@/services/attendance';

function fmtTime(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtCoords(lat: number | null, lng: number | null) {
  if (lat == null || lng == null) return '—';
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function workHours(rec: AttendanceRecord | null) {
  if (!rec?.checkInTime || !rec.checkOutTime) return null;
  const diff = new Date(rec.checkOutTime).getTime() - new Date(rec.checkInTime).getTime();
  if (diff < 0) return null;
  const h = Math.floor(diff / 3600000);
  const m = Math.round((diff % 3600000) / 60000);
  return `${h}س ${m}د`;
}

export default function AttendanceScreen() {
  const { token, user } = useAuth();
  const { t, lang } = useI18n();
  const router = useRouter();
  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [st, hs] = await Promise.all([
        api.get(`/attendance/status?date=${todayLocal()}`, { headers: { Authorization: `Bearer ${token}` } }),
        api.get('/attendance/history?limit=10', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setRecord((st.data as { attendance: AttendanceRecord | null }).attendance);
      setHistory((hs.data as AttendanceRecord[]) ?? []);
    } catch {
      // تُترك الحالة الحالية
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const todayLabel = new Date().toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  async function onCheckIn() {
    if (!token || busy) return;
    setBusy(true);
    try {
      const coords = await getCurrentPosition();
      if (!coords) {
        // تنبيه واضح: راهن الموقع والصلاحيات، دون حجز العملية من جديد لاحقاً
        Alert.alert(t('login.alertTitle'), `${t('attendance.gpsRequired')}\n\n${t('attendance.gpsHelp')}`);
        return;
      }
      const res = await api.post(
        '/attendance/check-in',
        { date: todayLocal(), ...coords },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      // تحديث الحالة فوراً من استجابة السيرفر حتى يتحوّل الزر إلى "تم تسجيل الحضور"
      const rec = res.data as AttendanceRecord;
      setRecord(rec);
      setHistory((prev) => {
        const rest = (prev ?? []).filter((h) => h.date !== rec.date);
        return [rec, ...rest];
      });
      Alert.alert(t('attendance.checkedInDone'), `${t('attendance.checkedInAt')} ${fmtTime(rec.checkInTime ?? new Date().toISOString())}`);
      // إعادة تحميل متزامنة في الخلفية دون حجب واجهة المستخدم
      void load();
    } catch {
      Alert.alert(t('login.alertTitle'), `${t('attendance.gpsFailed')}\n\n${t('attendance.gpsHelp')}`);
    } finally {
      setBusy(false);
    }
  }

  async function onCheckOut() {
    if (!token || busy) return;
    setBusy(true);
    try {
      const coords = await getCurrentPosition();
      if (!coords) {
        Alert.alert(t('login.alertTitle'), `${t('attendance.gpsRequired')}\n\n${t('attendance.gpsHelp')}`);
        return;
      }
      const res = await api.post(
        '/attendance/check-out',
        { date: todayLocal(), ...coords },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      // تحديث الحالة فوراً من استجابة السيرفر
      const rec = res.data as AttendanceRecord;
      setRecord(rec);
      setHistory((prev) => {
        const rest = (prev ?? []).filter((h) => h.date !== rec.date);
        return [rec, ...rest];
      });
      Alert.alert(t('attendance.checkedOutDone'), `${t('attendance.checkedOutAt')} ${fmtTime(rec.checkOutTime ?? new Date().toISOString())}`);
      void load();
    } catch {
      Alert.alert(t('login.alertTitle'), `${t('attendance.gpsFailed')}\n\n${t('attendance.gpsHelp')}`);
    } finally {
      setBusy(false);
    }
  }

  const hours = workHours(record);
  const initials = user?.name?.slice(0, 2) || '??';

  return (
    <View style={s.container}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor="#f59e0b" />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with avatar */}
        <View style={s.header}>
          <View style={s.avatarRing}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{initials}</Text>
            </View>
          </View>
          <Text style={s.greeting}>{t('attendance.title')}</Text>
          <Text style={s.dateLabel}>{todayLabel}</Text>
        </View>

        {/* Quick Actions */}
        <View style={s.quickRow}>
          <Pressable style={s.quickCard} onPress={() => router.push('/rfq')}>
            <Text style={s.quickEmoji}>📋</Text>
            <Text style={s.quickLabel}>{t('tabs.rfq')}</Text>
          </Pressable>
          <Pressable style={s.quickCard} onPress={() => router.push('/reports')}>
            <Text style={s.quickEmoji}>📊</Text>
            <Text style={s.quickLabel}>{t('tabs.reports')}</Text>
          </Pressable>
          <Pressable style={s.quickCard} onPress={() => router.push('/messages')}>
            <Text style={s.quickEmoji}>💬</Text>
            <Text style={s.quickLabel}>{t('tabs.messages')}</Text>
          </Pressable>
        </View>

        {/* Main Status Card */}
        {loading ? (
          <ActivityIndicator size="large" color="#f59e0b" style={{ marginVertical: 40 }} />
        ) : (
          <View style={s.card}>
            {!record ? (
              <>
                <View style={s.statusDot} />
                <Text style={s.statusText}>{t('attendance.notCheckedIn')}</Text>
                <Text style={s.hintText}>{t('attendance.notCheckedInHint')}</Text>
                <Pressable style={[s.mainBtn, s.inBtn]} onPress={() => void onCheckIn()} disabled={busy}>
                  {busy ? <ActivityIndicator color="#0f172a" /> : <Text style={s.mainBtnText}>{t('attendance.checkIn')}</Text>}
                </Pressable>
              </>
            ) : record.status === 'CHECKED_IN' ? (
              <>
                <View style={[s.statusDot, { backgroundColor: '#22c55e' }]} />
                <Text style={[s.statusText, { color: '#22c55e' }]}>
                  {t('attendance.present')} · {fmtTime(record.checkInTime)}
                </Text>
                <View style={s.detailRow}>
                  <Text style={s.detailLabel}>{t('attendance.checkedInAt')}</Text>
                  <Text style={s.detailValue}>{fmtTime(record.checkInTime)}</Text>
                </View>
                <View style={s.detailRow}>
                  <Text style={s.detailLabel}>{t('attendance.location')}</Text>
                  <Text style={s.detailValue}>{fmtCoords(record.checkInLat, record.checkInLng)}</Text>
                </View>
                {record.checkInAccuracy != null && (
                  <View style={s.detailRow}>
                    <Text style={s.detailLabel}>{t('attendance.accuracy')}</Text>
                    <Text style={s.detailValue}>±{Math.round(record.checkInAccuracy)} م</Text>
                  </View>
                )}
                <Pressable style={[s.mainBtn, s.outBtn]} onPress={() => void onCheckOut()} disabled={busy}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.mainBtnText}>{t('attendance.checkOut')}</Text>}
                </Pressable>
              </>
            ) : (
              <>
                <View style={[s.statusDot, { backgroundColor: '#ef4444' }]} />
                <Text style={[s.statusText, { color: '#ef4444' }]}>
                  {t('attendance.finished')} · {fmtTime(record.checkOutTime)}
                </Text>
                <View style={s.detailRow}>
                  <Text style={s.detailLabel}>{t('attendance.checkedInAt')}</Text>
                  <Text style={s.detailValue}>{fmtTime(record.checkInTime)}</Text>
                </View>
                <View style={s.detailRow}>
                  <Text style={s.detailLabel}>{t('attendance.checkedOutAt')}</Text>
                  <Text style={s.detailValue}>{fmtTime(record.checkOutTime)}</Text>
                </View>
                {hours && (
                  <View style={s.detailRow}>
                    <Text style={s.detailLabel}>{t('attendance.workHours')}</Text>
                    <Text style={[s.detailValue, { color: '#f59e0b' }]}>{hours}</Text>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* History */}
        <Text style={s.sectionTitle}>{t('attendance.history')}</Text>
        {history.length === 0 ? (
          <Text style={s.emptyText}>{t('attendance.noHistory')}</Text>
        ) : (
          history.map((h) => (
            <View key={h.id} style={s.historyRow}>
              <View>
                <Text style={s.historyDate}>{h.date}</Text>
                <Text style={s.historyTime}>{fmtTime(h.checkInTime)} → {fmtTime(h.checkOutTime)}</Text>
              </View>
              <View style={[s.historyBadge, h.status === 'CHECKED_IN' ? s.historyIn : s.historyOut]}>
                <Text style={[s.historyBadgeText, h.status === 'CHECKED_IN' ? { color: '#22c55e' } : { color: '#ef4444' }]}>
                  {h.status === 'CHECKED_IN' ? t('attendance.present') : t('attendance.finished')}
                </Text>
              </View>
            </View>
          ))
        )}

        {/* Spacer for tab bar */}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  scroll: { paddingHorizontal: 20, paddingTop: 60 },

  // Header
  header: { alignItems: 'center', marginBottom: 24 },
  avatarRing: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 2, borderColor: '#f59e0b',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#f59e0b', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 28, fontWeight: '800', color: '#f59e0b' },
  greeting: { fontSize: 22, fontWeight: '800', color: '#f8fafc', marginTop: 12 },
  dateLabel: { fontSize: 13, color: '#64748b', marginTop: 4 },

  // Quick Actions
  quickRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  quickCard: {
    flex: 1, alignItems: 'center', paddingVertical: 14,
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(148, 163, 184, 0.08)',
  },
  quickEmoji: { fontSize: 24, marginBottom: 4 },
  quickLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },

  // Main Card
  card: {
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
    borderRadius: 20, padding: 24, marginBottom: 24,
    borderWidth: 1, borderColor: 'rgba(148, 163, 184, 0.08)',
    alignItems: 'center',
  },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#f59e0b', marginBottom: 12 },
  statusText: { fontSize: 18, fontWeight: '700', color: '#f8fafc', marginBottom: 4 },
  hintText: { fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 20, lineHeight: 20 },

  // Buttons
  mainBtn: {
    flexDirection: 'row', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 48,
    alignItems: 'center', justifyContent: 'center', marginTop: 8, width: '100%',
  },
  inBtn: { backgroundColor: '#f59e0b' },
  outBtn: { backgroundColor: '#ef4444' },
  mainBtnText: { fontWeight: '700', fontSize: 16 },

  // Details
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', width: '100%',
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(148, 163, 184, 0.1)',
  },
  detailLabel: { fontSize: 13, color: '#64748b' },
  detailValue: { fontSize: 13, fontWeight: '600', color: '#e2e8f0' },

  // History
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#94a3b8', marginBottom: 12 },
  emptyText: { fontSize: 14, color: '#475569', textAlign: 'center', paddingVertical: 16 },
  historyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(148, 163, 184, 0.06)',
  },
  historyDate: { fontSize: 14, fontWeight: '600', color: '#e2e8f0' },
  historyTime: { fontSize: 12, color: '#64748b', marginTop: 2 },
  historyBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  historyIn: { backgroundColor: 'rgba(34, 197, 94, 0.12)' },
  historyOut: { backgroundColor: 'rgba(239, 68, 68, 0.12)' },
  historyBadgeText: { fontSize: 12, fontWeight: '700' },
});
