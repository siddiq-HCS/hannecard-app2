import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/api/client';
import { saveEntity, getLocalEntities } from '@/db/store';
import {
  SERVICE_LABELS,
  MATERIAL_LABELS,
  GROOVING_LABELS,
  calculateRollerPricing,
  type ServiceType,
  type CoatingMaterial,
  type GroovingType,
} from '@/lib/pricing';
import { money } from '@/lib/format';
import { colors } from '@/theme';

export default function RollerConfiguratorScreen() {
  const { token } = useAuth();
  const router = useRouter();

  const [clients, setClients] = useState<{ id: string; companyName: string }[]>([]);
  const [clientId, setClientId] = useState('');

  const [serviceType, setServiceType] = useState<ServiceType>('RECOATING');
  const [od, setOd] = useState('');
  const [core, setCore] = useState('');
  const [face, setFace] = useState('');
  const [total, setTotal] = useState('');
  const [material, setMaterial] = useState<CoatingMaterial>('POLYURETHANE');
  const [hardness, setHardness] = useState('75 Shore A');
  const [grooving, setGrooving] = useState<GroovingType>('SMOOTH');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (token) {
        try {
          const res = await api.get('/clients', { headers: { Authorization: `Bearer ${token}` } });
          setClients(res.data.map((c: { id: string; companyName: string }) => ({ id: c.id, companyName: c.companyName })));
        } catch {
          // بدون اتصال
        }
      }
      const local = await getLocalEntities('CLIENT');
      if (local.length > 0) {
        setClients((prev) => [
          ...prev,
          ...local.map((l) => ({ id: l.id, companyName: String(l.payload.companyName ?? '') })),
        ]);
      }
    };
    void load();
  }, [token]);

  const input = {
    serviceType,
    outerDiameterOd: Number(od),
    coreDiameter: Number(core),
    faceLength: Number(face),
    totalLength: Number(total),
    coatingMaterial: material,
  };
  const calc = calculateRollerPricing(input);

  async function pickPhotos() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (!result.canceled) {
      setPhotos((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
    }
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert('خطأ', 'لا يوجد إذن للكاميرا');
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) setPhotos((prev) => [...prev, result.assets[0].uri]);
  }

  async function onSave() {
    if (!clientId) return Alert.alert('خطأ', 'اختر العميل');
    if (!calc.valid) return Alert.alert('أبعاد غير صحيحة', calc.errors.join('\n'));

    setSaving(true);
    try {
      const payload = {
        clientId,
        serviceType,
        outerDiameterOd: Number(od),
        coreDiameter: Number(core),
        faceLength: Number(face),
        totalLength: Number(total),
        coatingMaterial: material,
        hardnessShore: hardness,
        groovingType: grooving,
        notes,
        damagePhotos: photos,
      };

      if (token) {
        try {
          const res = await api.post('/rollers', payload, { headers: { Authorization: `Bearer ${token}` } });
          await saveEntity('ROLLER_SPEC', res.data, res.data.id);
          Alert.alert('تم', 'تم حفظ المواصفات', [
            { text: 'عرض سعر', onPress: () => router.replace(`/quotation/new?rollerSpecId=${res.data.id}&clientId=${clientId}`) },
            { text: 'إغلاق', style: 'cancel' },
          ]);
          return;
        } catch (e: unknown) {
          if ((e as { response?: { data?: { errors?: string[] } } })?.response?.data?.errors) {
            return Alert.alert('خطأ في التحقق', (e as { response: { data: { errors: string[] } } }).response.data.errors.join('\n'));
          }
          // حفظ محلي
        }
      }
      await saveEntity('ROLLER_SPEC', payload);
      Alert.alert('حفظ محلي', 'تم الحفظ محلياً وسيتم مزامنته لاحقاً');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>العميل *</Text>
      <View style={styles.chips}>
        {clients.map((c) => (
          <Pressable key={c.id} style={[styles.chip, clientId === c.id && styles.chipActive]} onPress={() => setClientId(c.id)}>
            <Text style={[styles.chipText, clientId === c.id && styles.chipTextActive]}>{c.companyName}</Text>
          </Pressable>
        ))}
      </View>
      {clients.length === 0 && <Text style={styles.hint}>لا يوجد عملاء — أضف عميلاً أولاً من شاشة العملاء</Text>}

      <Text style={styles.label}>نوع الخدمة</Text>
      <View style={styles.chips}>
        {(Object.keys(SERVICE_LABELS) as ServiceType[]).map((s) => (
          <Pressable key={s} style={[styles.chip, serviceType === s && styles.chipActive]} onPress={() => setServiceType(s)}>
            <Text style={[styles.chipText, serviceType === s && styles.chipTextActive]}>{SERVICE_LABELS[s]}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>الأبعاد (ملم)</Text>
      <Text style={styles.hint}>رسم توضيحي: |===[ القطر الخارجي ]===|  القطر الخارجي يجب أن يكون أكبر من قطر المعدن</Text>
      <View style={styles.dimRow}>
        <View style={styles.dimField}>
          <Text style={styles.label}>القطر الخارجي OD</Text>
          <TextInput style={styles.input} value={od} onChangeText={setOd} keyboardType="decimal-pad" placeholder="مثال: 250" />
        </View>
        <View style={styles.dimField}>
          <Text style={styles.label}>قطر المعدن Core</Text>
          <TextInput style={styles.input} value={core} onChangeText={setCore} keyboardType="decimal-pad" placeholder="مثال: 120" />
        </View>
      </View>
      <View style={styles.dimRow}>
        <View style={styles.dimField}>
          <Text style={styles.label}>طول الوجه Face</Text>
          <TextInput style={styles.input} value={face} onChangeText={setFace} keyboardType="decimal-pad" placeholder="مثال: 1400" />
        </View>
        <View style={styles.dimField}>
          <Text style={styles.label}>الطول الكلي Total</Text>
          <TextInput style={styles.input} value={total} onChangeText={setTotal} keyboardType="decimal-pad" placeholder="مثال: 1600" />
        </View>
      </View>
      {calc.errors.length > 0 && (
        <View style={styles.errorBox}>
          {calc.errors.map((e, i) => (
            <Text key={i} style={styles.errorText}>{e}</Text>
          ))}
        </View>
      )}

      <Text style={styles.label}>مادة التغطية</Text>
      <View style={styles.chips}>
        {(Object.keys(MATERIAL_LABELS) as CoatingMaterial[]).map((m) => (
          <Pressable key={m} style={[styles.chip, material === m && styles.chipActive]} onPress={() => setMaterial(m)}>
            <Text style={[styles.chipText, material === m && styles.chipTextActive]}>{MATERIAL_LABELS[m]}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>الصلابة (Shore)</Text>
      <TextInput style={styles.input} value={hardness} onChangeText={setHardness} placeholder="مثال: 70 Shore A / 50 Shore D" />

      <Text style={styles.label}>نوع التحزيز</Text>
      <View style={styles.chips}>
        {(Object.keys(GROOVING_LABELS) as GroovingType[]).map((g) => (
          <Pressable key={g} style={[styles.chip, grooving === g && styles.chipActive]} onPress={() => setGrooving(g)}>
            <Text style={[styles.chipText, grooving === g && styles.chipTextActive]}>{GROOVING_LABELS[g]}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>ملاحظات</Text>
      <TextInput style={[styles.input, { minHeight: 60 }]} value={notes} onChangeText={setNotes} multiline />

      <Text style={styles.label}>صور التلف (اختياري)</Text>
      <View style={styles.row}>
        <Pressable style={styles.photoBtn} onPress={takePhoto}>
          <Text style={styles.photoText}>📷 تصوير</Text>
        </Pressable>
        <Pressable style={styles.photoBtn} onPress={pickPhotos}>
          <Text style={styles.photoText}>🖼️ من المعرض</Text>
        </Pressable>
      </View>
      {photos.length > 0 && (
        <View style={styles.photoGrid}>
          {photos.map((p, i) => (
            <Image key={i} source={{ uri: p }} style={styles.photo} />
          ))}
        </View>
      )}

      <View style={styles.calcBox}>
        <Text style={styles.calcTitle}>حساب فوري</Text>
        <Text style={styles.calcRow}>سماكة التغطية: {calc.coatingThickness} ملم</Text>
        <Text style={styles.calcRow}>تكلفة المواد: {money(calc.baseMaterialCost)}</Text>
        <Text style={styles.calcRow}>تكلفة التشغيل: {money(calc.laborMachiningCost)}</Text>
        <Text style={styles.calcTotal}>الإجمالي (شامل 15% ضريبة): {money(calc.grandTotal)}</Text>
      </View>

      <Pressable style={styles.saveBtn} onPress={onSave} disabled={saving}>
        <Text style={styles.saveText}>{saving ? 'جاري الحفظ...' : 'حفظ المواصفات'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  content: { padding: 20, paddingTop: 24, paddingBottom: 60 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6, marginTop: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 16 },
  hint: { fontSize: 11, color: colors.muted, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, backgroundColor: '#fff' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 12, color: colors.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  dimRow: { flexDirection: 'row', gap: 10 },
  dimField: { flex: 1 },
  errorBox: { backgroundColor: '#fee2e2', borderRadius: 8, padding: 10, marginTop: 8 },
  errorText: { color: colors.danger, fontSize: 12 },
  row: { flexDirection: 'row', gap: 10 },
  photoBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, alignItems: 'center', backgroundColor: '#f8fafc' },
  photoText: { color: colors.brand, fontWeight: '600' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  photo: { width: 80, height: 80, borderRadius: 8 },
  calcBox: { backgroundColor: colors.bg, borderRadius: 12, padding: 16, marginTop: 20 },
  calcTitle: { fontWeight: '700', color: colors.text, marginBottom: 8 },
  calcRow: { fontSize: 13, color: colors.text, marginTop: 3 },
  calcTotal: { fontSize: 15, fontWeight: '700', color: colors.brand, marginTop: 8 },
  saveBtn: { backgroundColor: colors.brand, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 20 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
