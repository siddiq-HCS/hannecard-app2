import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/api/client';
import { saveEntity, getLocalEntities } from '@/db/store';
import { calculateRollerPricing, discountNeedsApproval, SERVICE_LABELS, MATERIAL_LABELS, type ServiceType, type CoatingMaterial } from '@/lib/pricing';
import { money } from '@/lib/format';
import { colors } from '@/theme';

interface RollerSpec {
  id: string;
  clientId: string;
  serviceType: ServiceType;
  outerDiameterOd: number;
  coreDiameter: number;
  faceLength: number;
  totalLength: number;
  coatingMaterial: CoatingMaterial;
  hardnessShore: string;
}

export default function NewQuotationScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ rollerSpecId?: string; clientId?: string }>();

  const [specs, setSpecs] = useState<RollerSpec[]>([]);
  const [specId, setSpecId] = useState(params.rollerSpecId ?? '');
  const [clientId, setClientId] = useState(params.clientId ?? '');
  const [discount, setDiscount] = useState('0');
  const [saving, setSaving] = useState(false);

  const selected = specs.find((s) => s.id === specId);

  const calc = selected
    ? calculateRollerPricing(
        {
          serviceType: selected.serviceType,
          outerDiameterOd: selected.outerDiameterOd,
          coreDiameter: selected.coreDiameter,
          faceLength: selected.faceLength,
          totalLength: selected.totalLength,
          coatingMaterial: selected.coatingMaterial,
        },
        Number(discount) || 0,
      )
    : null;

  useEffect(() => {
    const load = async () => {
      if (token) {
        try {
          const res = await api.get('/rollers', { headers: { Authorization: `Bearer ${token}` } });
          setSpecs(res.data);
        } catch {
          // بدون اتصال
        }
      }
      const local = await getLocalEntities('ROLLER_SPEC');
      if (local.length > 0) {
        setSpecs((prev) => [
          ...prev,
          ...local.map((l) => ({
            id: l.id,
            clientId: String(l.payload.clientId ?? ''),
            serviceType: (l.payload.serviceType as ServiceType) ?? 'RECOATING',
            outerDiameterOd: Number(l.payload.outerDiameterOd ?? 0),
            coreDiameter: Number(l.payload.coreDiameter ?? 0),
            faceLength: Number(l.payload.faceLength ?? 0),
            totalLength: Number(l.payload.totalLength ?? 0),
            coatingMaterial: (l.payload.coatingMaterial as CoatingMaterial) ?? 'POLYURETHANE',
            hardnessShore: String(l.payload.hardnessShore ?? ''),
          })),
        ]);
      }
    };
    void load();
  }, [token]);

  const needsApproval = calc ? discountNeedsApproval(Number(discount) || 0) : false;

  async function onCreate() {
    if (!specId || !clientId || !calc) return Alert.alert('خطأ', 'اختر المواصفات');
    if (!calc.valid) return Alert.alert('خطأ', calc.errors.join('\n'));

    setSaving(true);
    try {
      const payload = {
        clientId,
        rollerSpecId: specId,
        discountPercentage: Number(discount) || 0,
      };

      if (token) {
        try {
          const res = await api.post('/quotations', payload, { headers: { Authorization: `Bearer ${token}` } });
          await saveEntity('QUOTATION', {
            id: res.data.id,
            quotationNumber: res.data.quotationNumber,
            clientName: '—',
            grandTotal: res.data.grandTotal,
            status: res.data.status,
          });
          router.replace(`/quotation/${res.data.id}`);
          return;
        } catch {
          // حفظ محلي
        }
      }
      await saveEntity('QUOTATION', {
        ...payload,
        clientName: '—',
        grandTotal: calc.grandTotal,
        quotationNumber: `HNC-LOCAL-${Date.now().toString(36).toUpperCase()}`,
      });
      Alert.alert('حفظ محلي', 'تم إنشاء العرض محلياً وسيُرسل للمزامنة عند الاتصال');
      router.back();
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>اختر مواصفة الأسطوانة</Text>
      {specs.map((s) => (
        <Pressable key={s.id} style={[styles.specCard, specId === s.id && styles.specActive]} onPress={() => { setSpecId(s.id); setClientId(s.clientId); }}>
          <Text style={styles.specTitle}>{SERVICE_LABELS[s.serviceType]} — {MATERIAL_LABELS[s.coatingMaterial]}</Text>
          <Text style={styles.specMeta}>OD {s.outerDiameterOd} / Core {s.coreDiameter} / Face {s.faceLength} / L {s.totalLength} mm</Text>
          <Text style={styles.specMeta}>الصلابة: {s.hardnessShore}</Text>
        </Pressable>
      ))}
      {specs.length === 0 && <Text style={styles.hint}>لا توجد مواصفات — أنشئ مواصفة أسطوانة أولاً</Text>}

      {selected && calc && (
        <>
          <Text style={styles.label}>نسبة الخصم %</Text>
          <TextInput style={styles.input} value={discount} onChangeText={setDiscount} keyboardType="decimal-pad" placeholder="0" />
          {needsApproval ? (
            <Text style={styles.warn}>الخصم يتجاوز 10% — سيصبح العرض بانتظار موافقة مدير المبيعات</Text>
          ) : (
            <Text style={styles.ok}>الخصم ضمن الحد المسموح (≤ 10%) — يُصدر فوراً</Text>
          )}

          <View style={styles.calcBox}>
            <Text style={styles.calcTitle}>تفصيل السعر</Text>
            <Text style={styles.calcRow}>تكلفة المواد: {money(calc.baseMaterialCost)}</Text>
            <Text style={styles.calcRow}>تكلفة التشغيل: {money(calc.laborMachiningCost)}</Text>
            <Text style={styles.calcRow}>الإجمالي قبل الخصم: {money(calc.subtotal)}</Text>
            {calc.discountAmount > 0 && <Text style={styles.calcRow}>الخصم ({calc.discountPercentage}%): -{money(calc.discountAmount)}</Text>}
            <Text style={styles.calcRow}>ضريبة القيمة المضافة {calc.vatRate}%: {money(calc.vatAmount)}</Text>
            <Text style={styles.calcTotal}>الإجمالي النهائي: {money(calc.grandTotal)}</Text>
          </View>

          <Pressable style={styles.saveBtn} onPress={onCreate} disabled={saving}>
            <Text style={styles.saveText}>{saving ? 'جاري الإنشاء...' : needsApproval ? 'إرسال لموافقة المدير' : 'إنشاء عرض السعر'}</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  content: { padding: 20, paddingTop: 24, paddingBottom: 60 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6, marginTop: 8 },
  hint: { fontSize: 11, color: colors.muted },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, backgroundColor: '#fff', marginBottom: 6 },
  specCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, marginBottom: 8, backgroundColor: '#fff' },
  specActive: { borderColor: colors.brand, backgroundColor: '#eff6ff' },
  specTitle: { fontWeight: '600', color: colors.text },
  specMeta: { fontSize: 12, color: colors.muted, marginTop: 3 },
  warn: { color: colors.warning, fontSize: 12, fontWeight: '600' },
  ok: { color: colors.success, fontSize: 12, fontWeight: '600' },
  calcBox: { backgroundColor: colors.bg, borderRadius: 12, padding: 16, marginTop: 16 },
  calcTitle: { fontWeight: '700', color: colors.text, marginBottom: 8 },
  calcRow: { fontSize: 13, color: colors.text, marginTop: 3 },
  calcTotal: { fontSize: 15, fontWeight: '700', color: colors.brand, marginTop: 8 },
  saveBtn: { backgroundColor: colors.brand, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 20 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
