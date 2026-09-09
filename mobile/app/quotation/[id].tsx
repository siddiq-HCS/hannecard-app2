import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ScrollView, PanResponder } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { api, API_URL } from '@/api/client';
import { money, formatDate } from '@/lib/format';
import { colors } from '@/theme';

interface QuotationDetail {
  id: string;
  quotationNumber: string;
  status: string;
  baseMaterialCost: string;
  laborMachiningCost: string;
  subtotal: string;
  discountPercentage: string;
  discountAmount: string;
  vatAmount: string;
  grandTotal: string;
  pdfUrl?: string | null;
  qrCodeUrl?: string | null;
  clientSignature?: number[][];
  createdAt: string;
  client: { companyName: string; contactPerson: string; phone: string };
  rollerSpec: {
    serviceType: string;
    outerDiameterOd: number;
    coreDiameter: number;
    faceLength: number;
    totalLength: number;
    coatingMaterial: string;
    hardnessShore: string;
  };
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'مسودة',
  PENDING_APPROVAL: 'بانتظار الموافقة',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
  CONVERTED_TO_WORK_ORDER: 'تحول لأمر إنتاج',
};

export default function QuotationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const [q, setQ] = useState<QuotationDetail | null>(null);
  const [strokes, setStrokes] = useState<number[][]>([]);
  const [signing, setSigning] = useState(false);
  const currentStroke = useRef<number[]>([]);
  const canvasRef = useRef<View>(null);

  useEffect(() => {
    const load = async () => {
      if (!token || !id || id.startsWith('local-')) return;
      try {
        const res = await api.get(`/quotations/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        setQ(res.data);
      } catch {
        Alert.alert('خطأ', 'تعذر تحميل العرض');
      }
    };
    void load();
  }, [token, id]);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      currentStroke.current = [];
    },
    onPanResponderMove: (evt) => {
      currentStroke.current.push(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
      setStrokes((prev) => {
        const next = [...prev];
        if (next.length > 0 && currentStroke.current.length === 2) return prev;
        return next;
      });
    },
    onPanResponderRelease: () => {
      if (currentStroke.current.length >= 4) {
        setStrokes((prev) => [...prev, currentStroke.current]);
      }
      currentStroke.current = [];
    },
  });

  async function saveSignature() {
    if (!token || !id || strokes.length === 0) return;
    setSigning(true);
    try {
      const flat = strokes.flat();
      await api.patch(`/quotations/${id}/signature`, { strokes: flat }, { headers: { Authorization: `Bearer ${token}` } });
      Alert.alert('تم', 'تم حفظ توقيع العميل');
    } catch {
      Alert.alert('خطأ', 'تعذر حفظ التوقيع');
    } finally {
      setSigning(false);
    }
  }

  if (!q) return <View style={styles.container}><Text style={styles.muted}>جاري التحميل...</Text></View>;

  const detail = q;
  const pdfUrl = detail.pdfUrl?.replace('http://localhost:4001', API_URL.replace('/api/v1', '')) ?? '';

  function shareWhatsApp() {
    const text = encodeURIComponent(`عرض سعر ${detail.quotationNumber} — ${detail.client.companyName} — الإجمالي: ${money(detail.grandTotal)}`);
    const url = `https://wa.me/?text=${text}`;
    void (async () => {
      const Linking = await import('expo-linking');
      Linking.openURL(url);
    })();
  }

  function shareEmail() {
    const subject = encodeURIComponent(`عرض سعر ${detail.quotationNumber}`);
    const body = encodeURIComponent(`السادة ${detail.client.companyName},\n\nعرض سعر: ${detail.quotationNumber}\nالإجمالي: ${money(detail.grandTotal)}\n${pdfUrl}`);
    void (async () => {
      const Linking = await import('expo-linking');
      Linking.openURL(`mailto:?subject=${subject}&body=${body}`);
    })();
  }

  function openPdf() {
    void (async () => {
      const Linking = await import('expo-linking');
      if (!pdfUrl) return Alert.alert('خطأ', 'لا يوجد ملف PDF بعد');
      Linking.openURL(pdfUrl);
    })();
  }

  

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.number}>{detail.quotationNumber}</Text>
        <Text style={[styles.badge, q.status === 'PENDING_APPROVAL' && styles.badgeWarn]}>{STATUS_LABELS[q.status] ?? q.status}</Text>
      </View>
      <Text style={styles.date}>{formatDate(q.createdAt)}</Text>

      <Text style={styles.sectionTitle}>العميل</Text>
      <Text style={styles.text}>{detail.client.companyName}</Text>
      <Text style={styles.muted}>{detail.client.contactPerson} · {detail.client.phone}</Text>

      <Text style={styles.sectionTitle}>مواصفات الأسطوانة</Text>
      <Text style={styles.muted}>
        OD {detail.rollerSpec.outerDiameterOd} / Core {detail.rollerSpec.coreDiameter} / Face {detail.rollerSpec.faceLength} / L {detail.rollerSpec.totalLength} mm
      </Text>
      <Text style={styles.muted}>المادة: {detail.rollerSpec.coatingMaterial} · الصلابة: {detail.rollerSpec.hardnessShore}</Text>

      <Text style={styles.sectionTitle}>التفاصيل المالية</Text>
      <View style={styles.calcBox}>
        <Text style={styles.calcRow}>تكلفة المواد: {money(q.baseMaterialCost)}</Text>
        <Text style={styles.calcRow}>تكلفة التشغيل: {money(q.laborMachiningCost)}</Text>
        <Text style={styles.calcRow}>الإجمالي قبل الخصم: {money(q.subtotal)}</Text>
        {Number(q.discountAmount) > 0 && <Text style={styles.calcRow}>الخصم ({detail.discountPercentage}%): -{money(q.discountAmount)}</Text>}
        <Text style={styles.calcRow}>ضريبة القيمة المضافة 15%: {money(q.vatAmount)}</Text>
        <Text style={styles.calcTotal}>الإجمالي النهائي: {money(q.grandTotal)}</Text>
      </View>

      <Text style={styles.sectionTitle}>توقيع العميل</Text>
      <View ref={canvasRef} style={styles.canvas} {...panResponder.panHandlers}>
        {strokes.length > 0 && (
          <Text style={styles.canvasHint}>محرر — أعد الرسم من البداية لمسحه</Text>
        )}
        {strokes.length === 0 && <Text style={styles.canvasHint}>وقّع هنا بإصبعك</Text>}
      </View>
      {strokes.length > 0 && (
        <Pressable style={styles.signBtn} onPress={saveSignature} disabled={signing}>
          <Text style={styles.signText}>{signing ? 'جاري الحفظ...' : 'حفظ التوقيع'}</Text>
        </Pressable>
      )}

      <View style={styles.row}>
        <Pressable style={styles.actionBtn} onPress={openPdf}>
          <Text style={styles.actionText}>📄 فتح PDF</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={shareWhatsApp}>
          <Text style={styles.actionText}>واتساب</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={shareEmail}>
          <Text style={styles.actionText}>بريد</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  content: { padding: 20, paddingTop: 30, paddingBottom: 60 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  number: { fontSize: 18, fontWeight: '700', color: colors.text },
  badge: { fontSize: 12, color: colors.success, backgroundColor: '#dcfce7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, fontWeight: '600' },
  badgeWarn: { color: colors.warning, backgroundColor: '#fef3c7' },
  date: { fontSize: 12, color: colors.muted, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 20, marginBottom: 6 },
  text: { fontSize: 14, color: colors.text },
  muted: { fontSize: 13, color: colors.muted, marginTop: 2 },
  calcBox: { backgroundColor: colors.bg, borderRadius: 12, padding: 14 },
  calcRow: { fontSize: 13, color: colors.text, marginTop: 3 },
  calcTotal: { fontSize: 15, fontWeight: '700', color: colors.brand, marginTop: 8 },
  canvas: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, height: 140, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  canvasHint: { color: colors.muted, fontSize: 12 },
  signBtn: { backgroundColor: colors.success, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 10 },
  signText: { color: '#fff', fontWeight: '700' },
  row: { flexDirection: 'row', gap: 10, marginTop: 24 },
  actionBtn: { flex: 1, borderWidth: 1, borderColor: colors.brand, borderRadius: 10, padding: 14, alignItems: 'center' },
  actionText: { color: colors.brand, fontWeight: '600' },
});
