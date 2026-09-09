import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, RefreshControl, Image, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { api, API_URL, DEFAULT_REQUEST_TIMEOUT } from '@/api/client';
import { getSocket } from '@/services/socket';
import { getCurrentPosition } from '@/services/location';
import { requireTodayCheckIn, todayLocal } from '@/services/attendance';
import { pickWebImages, pickWebDocs, dataUrlToBlob, appendFileToForm, isWeb } from '@/services/webImagePicker';
import { Logo } from '@/components/Logo';
import { DatePickerModal } from '@/components/DatePickerModal';
import { SelectModal } from '@/components/SelectModal';

const REQUIRED_WORK = ['NORMAL', 'COMPLETE_MANUFACTURING', 'MANUFACTURING', 'RE_COVERING', 'RE_GRINDING', 'REPAIR', 'OTHERS'] as const;
const WORK_ENVIRONMENTS = ['NORMAL', 'CHEMICALS', 'TEMPERATURE', 'PRESSURE', 'OTHERS'] as const;
const FINISHING_TYPES = ['NORMAL_CYLINDRICAL', 'PARABOLIC_CROWNING', 'GROOVING', 'OTHERS'] as const;
const REQUIRED_TIMES = ['TOP_URGENT', 'URGENT', 'NORMAL', 'OTHERS'] as const;
const PAYMENT_TERMS = ['CASH', 'CREDIT'] as const;

interface RfqDocument {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedBy: string;
}

interface RfqComment {
  id: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
  author?: { id: string; name: string; role: string } | null;
}

interface SelectedDoc {
  uri: string;
  name: string;
  mimeType: string;
  base64?: string;
}

interface PickedImageItem {
  uri: string;
  mimeType?: string;
  name?: string;
  base64?: string;
}

function docMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'doc': return 'application/msword';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xls': return 'application/vnd.ms-excel';
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'ppt': return 'application/vnd.ms-powerpoint';
    case 'pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'txt': return 'text/plain';
    default: return 'application/octet-stream';
  }
}

function sanitizeFileName(name: string): string {
  return (name || 'file').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
}

interface Rfq {
  id: string;
  serialNumber?: string;
  clientName: string;
  contactName: string;
  contactPhone: string;
  items: {
    description: string;
    quantity: string;
    finishingType: string;
    finishingTypeOther?: string;
    requiredWork: string[];
    requiredWorkOther?: string;
    workEnvironment: string;
    workEnvironmentOther?: string;
    rollMaterialId?: string;
    outerDiameter?: number;
    innerDiameter?: number;
    rollLength?: number;
    calculatedPrice?: number;
  }[];
  requiredTime: string;
  requiredTimeOther?: string;
  paymentTerms: string;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  workOrderDate?: string;
  price?: string | null;
  currency?: string;
  pricingStatus?: string;
  approvedAt?: string | null;
  approvedBy?: string | null;
  createdAt: string;
  documents?: RfqDocument[];
  comments?: RfqComment[];
}

interface Item {
  description: string;
  quantity: string;
  finishingType: string;
  finishingTypeOther: string;
  requiredWork: string[];
  requiredWorkOther: string;
  workEnvironment: string;
  workEnvironmentOther: string;
  rollMaterialId?: string;
  outerDiameter?: string;
  innerDiameter?: string;
  rollLength?: string;
  calculatedPrice?: number;
}

const newItem = (): Item => ({
  description: '',
  quantity: '',
  finishingType: 'NORMAL_CYLINDRICAL',
  finishingTypeOther: '',
  requiredWork: ['NORMAL'],
  requiredWorkOther: '',
  workEnvironment: 'NORMAL',
  workEnvironmentOther: '',
  rollMaterialId: undefined,
  outerDiameter: '',
  innerDiameter: '',
  rollLength: '',
  calculatedPrice: undefined,
});

// إجمالي الرولات = مجموع كميات أصناف الطلب
function totalRolls(items?: { quantity?: string }[]): number {
  let sum = 0;
  for (const it of items ?? []) {
    const m = String(it.quantity ?? '').match(/\d+(\.\d+)?/);
    if (m) sum += parseFloat(m[0]);
  }
  return sum;
}

export default function RfqScreen() {
  const { token, user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [requests, setRequests] = useState<Rfq[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const submittingRef = useRef(false);

  const [clientName, setClientName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [items, setItems] = useState<Item[]>([newItem()]);
  const [requiredTime, setRequiredTime] = useState<string>(REQUIRED_TIMES[0]);
  const [requiredTimeOther, setRequiredTimeOther] = useState('');
  const [workOrderDate, setWorkOrderDate] = useState('');
  const [paymentTerms, setPaymentTerms] = useState<string>(PAYMENT_TERMS[0]);

  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [finishPickerFor, setFinishPickerFor] = useState<number | null>(null);
  const [envPickerFor, setEnvPickerFor] = useState<number | null>(null);
  const [detailRfq, setDetailRfq] = useState<Rfq | null>(null);
  const [images, setImages] = useState<PickedImageItem[]>([]);
  const [docs, setDocs] = useState<SelectedDoc[]>([]);
  const [editingRfq, setEditingRfq] = useState<Rfq | null>(null);
  const [rollMaterials, setRollMaterials] = useState<{ id: string; name: string }[]>([]);
  const [materialPickerFor, setMaterialPickerFor] = useState<number | null>(null);

  async function load() {
    if (!token) return;
    const res = await api.get('/rfqs', { headers: { Authorization: `Bearer ${token}` } });
    setRequests(res.data);
  }

  // تحديث فوري لوحة المندوب عند تسعير/اعتماد الطلب من الإدارة
  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    const onRfqUpdated = (payload: Rfq) => {
      if (!payload?.id) return;
      setRequests((prev) => {
        const exists = prev.some((r) => r.id === payload.id);
        return exists ? prev.map((r) => (r.id === payload.id ? { ...r, ...payload } : r)) : prev;
      });
      setDetailRfq((prev) => (prev?.id === payload.id ? { ...prev, ...payload } : prev));
    };
    socket.on('rfq:updated', onRfqUpdated);
    return () => {
      socket.off('rfq:updated', onRfqUpdated);
    };
  }, [token]);

  useEffect(() => {
    void load();
  }, [token]);

  useEffect(() => {
    if (!editingRfq) return;
    setClientName(editingRfq.clientName);
    setContactName(editingRfq.contactName);
    setContactPhone(editingRfq.contactPhone);
    setRequiredTime(editingRfq.requiredTime);
    setRequiredTimeOther(editingRfq.requiredTimeOther ?? '');
    setWorkOrderDate(editingRfq.workOrderDate?.split('T')[0] ?? '');
    setPaymentTerms(editingRfq.paymentTerms);
    setItems(editingRfq.items.map((it) => ({
      description: it.description ?? '',
      quantity: it.quantity ?? '',
      finishingType: it.finishingType ?? 'NORMAL_CYLINDRICAL',
      finishingTypeOther: it.finishingTypeOther ?? '',
      requiredWork: Array.isArray(it.requiredWork) ? it.requiredWork : it.requiredWork ? [it.requiredWork] : ['NORMAL'],
      requiredWorkOther: it.requiredWorkOther ?? '',
      workEnvironment: it.workEnvironment ?? 'NORMAL',
      workEnvironmentOther: it.workEnvironmentOther ?? '',
      rollMaterialId: it.rollMaterialId ?? undefined,
      outerDiameter: it.outerDiameter != null ? String(it.outerDiameter) : '',
      innerDiameter: it.innerDiameter != null ? String(it.innerDiameter) : '',
      rollLength: it.rollLength != null ? String(it.rollLength) : '',
      calculatedPrice: it.calculatedPrice ?? undefined,
    })));
    setImages([]);
    setDocs([]);
  }, [editingRfq]);

  useEffect(() => {
    if (!token) return;
    api.get('/roll-materials?active=true', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setRollMaterials(r.data))
      .catch(() => {});
  }, [token]);

  function updateItem(index: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function toggleRequiredWork(index: number, value: string) {
    setItems((prev) => prev.map((it, i) => {
      if (i !== index) return it;
      const current = it.requiredWork;
      let next: string[];
      if (value === 'NORMAL') {
        next = ['NORMAL'];
      } else {
        next = current.filter((v) => v !== 'NORMAL');
        if (next.includes(value)) {
          next = next.filter((v) => v !== value);
          if (next.length === 0) next = ['NORMAL'];
        } else {
          next.push(value);
        }
      }
      return { ...it, requiredWork: next };
    }));
  }

  function addItem() {
    setItems((prev) => [...prev, newItem()]);
  }

  function removeItem(index: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function calcItemPrice(index: number) {
    if (!token) return;
    const it = items[index];
    if (!it.rollMaterialId || !it.outerDiameter || !it.innerDiameter || !it.rollLength) return;
    try {
      const res = await api.post('/roll-materials/calculate', {
        materialId: it.rollMaterialId,
        outerDiameter: parseFloat(it.outerDiameter),
        innerDiameter: parseFloat(it.innerDiameter),
        length: parseFloat(it.rollLength),
      }, { headers: { Authorization: `Bearer ${token}` } });
      updateItem(index, { calculatedPrice: res.data.total });
    } catch {
      updateItem(index, { calculatedPrice: undefined });
    }
  }

  async function pickImage() {
    // على الويب (iOS Safari): فتح <input type="file"> مباشرة لضمان عمل المعرض والكاميرا
    if (isWeb) {
      const picked = await pickWebImages(true);
      if (picked.length > 0) {
        setImages((prev) => [...prev, ...picked.map((p) => ({ uri: p.uri, mimeType: p.mimeType, name: p.name, base64: p.base64 }))]);
      }
      return;
    }
    Alert.alert(t('rfq.pickImage'), '', [
      { text: t('rfq.camera'), onPress: () => void launchCamera() },
      { text: t('rfq.gallery'), onPress: () => void launchGallery() },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  async function launchCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert(t('login.alertTitle'), t('rfq.cameraPermission'));
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 0.7 });
    if (!res.canceled) setImages((prev) => [...prev, { uri: res.assets[0].uri, mimeType: res.assets[0].mimeType }]);
  }

  async function launchGallery() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.7 });
    if (!res.canceled) {
      const newImages = res.assets.map((a) => ({ uri: a.uri, mimeType: a.mimeType }));
      setImages((prev) => [...prev, ...newImages]);
    }
  }

  async function pickDoc() {
    // على الويب: فتح <input type="file"> وقراءة الملف كـ base64 ليعمل الرفع في Chrome بشكل موثوق
    if (isWeb) {
      const picked = await pickWebDocs(
        '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain',
        true,
      );
      const newDocs = picked
        .map((p) => ({ uri: p.uri, name: p.name ?? 'file.pdf', mimeType: p.mimeType || docMime(p.name ?? ''), base64: p.base64 }))
        .filter((d) => d.mimeType !== 'application/octet-stream');
      if (newDocs.length === 0) return Alert.alert(t('login.alertTitle'), t('common.addFile'));
      setDocs((prev) => [...prev, ...newDocs]);
      return;
    }
    const res = await DocumentPicker.getDocumentAsync({
      type: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
      ],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (res.canceled) return;
    const newDocs = res.assets
      .map((a) => ({
        uri: a.uri,
        name: a.name ?? 'file.pdf',
        mimeType: docMime(a.name ?? ''),
      }))
      .filter((d) => d.mimeType !== 'application/octet-stream');
    if (newDocs.length === 0) return Alert.alert(t('login.alertTitle'), t('common.addFile'));
    setDocs((prev) => [...prev, ...newDocs]);
  }

  async function downloadDoc(d: RfqDocument) {
    try {
      const dest = `${FileSystem.cacheDirectory}doc_${sanitizeFileName(d.fileName)}`;
      const res = await FileSystem.downloadAsync(
        `${API_URL}/rfq-documents/${d.id}/file`,
        dest,
        { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
      );
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(res.uri, { mimeType: d.mimeType });
      } else {
        Alert.alert(t('login.alertTitle'), t('common.noDocuments'));
      }
    } catch {
      Alert.alert(t('login.alertTitle'), t('rfq.fail'));
    }
  }

  async function deleteDoc(d: RfqDocument) {
    if (!token) return;
    try {
      await api.delete(`/rfq-documents/${d.id}`, { headers: { Authorization: `Bearer ${token}` } });
      await load();
      setDetailRfq((prev) => (prev ? { ...prev, documents: (prev.documents ?? []).filter((x) => x.id !== d.id) } : prev));
    } catch {
      Alert.alert(t('login.alertTitle'), t('rfq.fail'));
    }
  }

  async function submit() {
    if (!token) return;
    if (submittingRef.current) return;
    const validItems = items.map((it) => ({ ...it, description: it.description.trim(), quantity: it.quantity.trim() }));
    if (!clientName.trim() || !workOrderDate || validItems.some((it) => !it.description)) {
      return Alert.alert(t('login.alertTitle'), t('rfq.fillRequired'));
    }
    if (requiredTime === 'OTHERS' && !requiredTimeOther.trim()) {
      return Alert.alert(t('login.alertTitle'), t('rfq.fillRequired'));
    }
    if (validItems.some((it) => it.finishingType === 'OTHERS' && !it.finishingTypeOther.trim())) {
      return Alert.alert(t('login.alertTitle'), t('rfq.fillRequired'));
    }
    if (validItems.some((it) => it.workEnvironment === 'OTHERS' && !it.workEnvironmentOther.trim())) {
      return Alert.alert(t('login.alertTitle'), t('rfq.fillRequired'));
    }
    if (validItems.some((it) => it.requiredWork.includes('OTHERS') && !it.requiredWorkOther.trim())) {
      return Alert.alert(t('login.alertTitle'), t('rfq.fillRequired'));
    }
    const gate = await requireTodayCheckIn(token, user?.role === 'REPRESENTATIVE');
    if (gate === 'attendance_required') {
      Alert.alert(t('attendance.requiredTitle'), t('attendance.requiredMsg'), [
        { text: t('attendance.goCheckIn'), onPress: () => router.navigate('/(tabs)/attendance') },
        { text: t('common.cancel'), style: 'cancel' },
      ]);
      return;
    }
    submittingRef.current = true;
    setSending(true);
    try {
      const itemPayload = validItems.map((it) => ({
        description: it.description,
        quantity: it.quantity,
        finishingType: it.finishingType,
        finishingTypeOther: it.finishingTypeOther.trim() || '',
        requiredWork: it.requiredWork,
        requiredWorkOther: it.requiredWork.includes('OTHERS') ? it.requiredWorkOther.trim() : '',
        workEnvironment: it.workEnvironment,
        workEnvironmentOther: it.workEnvironment !== 'NORMAL' ? it.workEnvironmentOther.trim() : '',
        ...(it.rollMaterialId ? {
          rollMaterialId: it.rollMaterialId,
          outerDiameter: parseFloat(it.outerDiameter || '0'),
          innerDiameter: parseFloat(it.innerDiameter || '0'),
          rollLength: parseFloat(it.rollLength || '0'),
          calculatedPrice: it.calculatedPrice,
        } : {}),
      }));

      let rfqId: string;
      if (editingRfq) {
        const res = await api.put(
          `/rfqs/${editingRfq.id}`,
          {
            clientName: clientName.trim(),
            contactName: contactName.trim(),
            contactPhone: contactPhone.trim(),
            items: itemPayload,
            requiredTime,
            requiredTimeOther: requiredTime === 'OTHERS' ? requiredTimeOther.trim() : undefined,
            workOrderDate,
            paymentTerms,
          },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        rfqId = res.data.id;
      } else {
        const coords = await getCurrentPosition();
        const created = await api.post(
          '/rfqs',
          {
            clientName: clientName.trim(),
            contactName: contactName.trim(),
            contactPhone: contactPhone.trim(),
            items: itemPayload,
            requiredTime,
            requiredTimeOther: requiredTime === 'OTHERS' ? requiredTimeOther.trim() : undefined,
            workOrderDate,
            paymentTerms,
            date: todayLocal(),
            ...(coords ?? {}),
          },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        rfqId = created.data.id;
      }

      if (images.length > 0 && rfqId) {
        const form = new FormData();
        images.forEach((img, i) => {
          if (isWeb && img.base64) {
            // على الويب: تحويل base64 إلى Blob حقيقي ليعمل الرفع في iOS Safari
            const blob = dataUrlToBlob(img.base64);
            if (blob) form.append('images', blob, img.name || `photo_${i}.jpg`);
            return;
          }
          form.append('images', { uri: img.uri, name: `photo_${i}.jpg`, type: img.mimeType ?? 'image/jpeg' } as unknown as Blob);
        });
        await api.post(`/rfqs/${rfqId}/image`, form, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
      }

      if (docs.length > 0 && rfqId) {
        for (const doc of docs) {
          const form = new FormData();
          if (isWeb && doc.base64) {
            // على الويب: نرفق Blob حقيقياً من base64 (react-native-web لا يدعم كائن {uri,name,type})
            if (!appendFileToForm(doc.base64, doc.mimeType, doc.name, 'file', form)) {
              throw new Error('upload_failed');
            }
          } else {
            form.append('file', { uri: doc.uri, name: doc.name, type: doc.mimeType } as unknown as Blob);
          }
          await api.post(`/rfqs/${rfqId}/documents`, form, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          });
        }
      }
      setClientName('');
      setContactName('');
      setContactPhone('');
      setItems([newItem()]);
      setRequiredTimeOther('');
      setWorkOrderDate('');
      setRequiredTime(REQUIRED_TIMES[0]);
      setPaymentTerms(PAYMENT_TERMS[0]);
      setImages([]);
      setDocs([]);
      setEditingRfq(null);
      Alert.alert(t('rfq.ok'), t('rfq.success'));
      await load();
    } catch (err) {
      const isDuplicate = (err as { response?: { data?: { error?: string } } })?.response?.data?.error === 'duplicate_rfq';
      Alert.alert(t('login.alertTitle'), isDuplicate ? t('rfq.duplicate') : t('rfq.fail'));
    } finally {
      // ضمان عودة الزر للحالة النشطة دائماً فور اكتمال الرفع أو فشله أو تعليقه
      submittingRef.current = false;
      setSending(false);
    }
    // مهلة أمان (Watchdog): في حال علق أي طلب رفع لأي سبب ولم تُفعّل finally
    // (مثلاً تجمّد synchronous في المتصفح)، نحرر الزر بعد مهلة قصوى حتى لا يبقى معطلاً.
    setTimeout(() => {
      if (submittingRef.current) {
        submittingRef.current = false;
        setSending(false);
      }
    }, DEFAULT_REQUEST_TIMEOUT + 15_000);
  }

  function renderChips<T extends readonly string[]>(options: T, value: string, onChange: (v: string) => void, label: (k: string) => string) {
    return (
      <View style={styles.chipRow}>
        {options.map((o) => (
          <Pressable key={o} onPress={() => onChange(o)} style={[styles.chip, value === o && styles.chipActive]}>
            <Text style={[styles.chipText, value === o && styles.chipTextActive]}>{label(o)}</Text>
          </Pressable>
        ))}
      </View>
    );
  }

  const othersInput = (value: string, setter: (v: string) => void) => (
    <TextInput
      style={[styles.input, styles.othersInput]}
      value={value}
      onChangeText={setter}
      placeholder={t('rfq.othersDetail')}
      multiline
    />
  );

  const detailInput = (value: string, setter: (v: string) => void, placeholder: string) => (
    <TextInput
      style={[styles.input, styles.othersInput]}
      value={value}
      onChangeText={setter}
      placeholder={placeholder}
      multiline
    />
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Logo size={30} />
        <Text style={styles.title}>{t('rfq.title')}</Text>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />
        }
      >
        <Text style={styles.label}>{t('rfq.clientName')}</Text>
        <TextInput style={styles.input} value={clientName} onChangeText={setClientName} placeholder={t('rfq.clientNamePlaceholder')} />

        <Text style={styles.label}>{t('rfq.contactName')}</Text>
        <TextInput style={styles.input} value={contactName} onChangeText={setContactName} placeholder={t('rfq.contactNamePlaceholder')} />

        <Text style={styles.label}>{t('rfq.contactPhone')}</Text>
        <TextInput style={styles.input} value={contactPhone} onChangeText={setContactPhone} placeholder={t('rfq.contactPhonePlaceholder')} keyboardType="phone-pad" />

        <Text style={styles.label}>{t('rfq.items')}</Text>

        {items.map((item, index) => (
          <View key={index} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemTitle}>{t('rfq.itemTitle')} {index + 1}</Text>
              {items.length > 1 && (
                <Pressable onPress={() => removeItem(index)}>
                  <Text style={styles.removeText}>{t('rfq.removeItem')}</Text>
                </Pressable>
              )}
            </View>

            <Text style={styles.label}>{t('rfq.description')}</Text>
            <TextInput
              style={[styles.input, styles.multilineSmall]}
              value={item.description}
              onChangeText={(v) => updateItem(index, { description: v })}
              placeholder={t('rfq.descriptionPlaceholder')}
              multiline
            />

            <Text style={styles.label}>{t('rfq.quantity')}</Text>
            <TextInput
              style={styles.input}
              value={item.quantity}
              onChangeText={(v) => updateItem(index, { quantity: v })}
              placeholder={t('rfq.quantityPlaceholder')}
              keyboardType="numbers-and-punctuation"
            />

            <Text style={styles.label}>{t('rfq.requiredWork')}</Text>
            <View style={styles.chipRow}>
              {REQUIRED_WORK.map((w) => {
                const active = item.requiredWork.includes(w);
                return (
                  <Pressable key={w} onPress={() => toggleRequiredWork(index, w)} style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{t(`requiredWorkOptions.${w}`)}</Text>
                  </Pressable>
                );
              })}
            </View>
            {item.requiredWork.includes('OTHERS') && othersInput(item.requiredWorkOther, (v) => updateItem(index, { requiredWorkOther: v }))}

            <Text style={styles.label}>{t('rfq.workEnvironment')}</Text>
            <Pressable style={[styles.input, styles.dateInput]} onPress={() => setEnvPickerFor(index)}>
              <Text style={item.workEnvironment ? styles.dateValue : styles.datePlaceholder}>
                {t(`workEnvironmentOptions.${item.workEnvironment}`)}
              </Text>
              <Text style={styles.calendarIcon}>▾</Text>
            </Pressable>
            {item.workEnvironment !== 'NORMAL' && (
              <>
                <Text style={styles.label}>{t('rfq.workEnvironmentDetail')}</Text>
                {detailInput(item.workEnvironmentOther, (v) => updateItem(index, { workEnvironmentOther: v }), t('rfq.workEnvironmentDetailPlaceholder'))}
              </>
            )}

            <Text style={styles.label}>{t('rfq.selectFinishing')}</Text>
            <Pressable style={[styles.input, styles.dateInput]} onPress={() => setFinishPickerFor(index)}>
              <Text style={item.finishingType ? styles.dateValue : styles.datePlaceholder}>
                {t(`finishingOptions.${item.finishingType}`)}
              </Text>
              <Text style={styles.calendarIcon}>▾</Text>
            </Pressable>
            <Text style={styles.label}>{t('rfq.finishingDetail')}</Text>
            {detailInput(item.finishingTypeOther, (v) => updateItem(index, { finishingTypeOther: v }), t('rfq.finishingDetailPlaceholder'))}
            {rollMaterials.length > 0 && (
              <>
                <Text style={styles.label}>{t('rfq.rollMaterial') || 'خامة الرول'}</Text>
                <Pressable style={[styles.input, styles.dateInput]} onPress={() => setMaterialPickerFor(index)}>
                  <Text style={item.rollMaterialId ? styles.dateValue : styles.datePlaceholder}>
                    {item.rollMaterialId
                      ? rollMaterials.find((m) => m.id === item.rollMaterialId)?.name || t('rfq.changeMaterial')
                      : t('rfq.selectMaterial') || 'اختر الخامة...'}
                  </Text>
                  <Text style={styles.calendarIcon}>▾</Text>
                </Pressable>
                {item.rollMaterialId && (
                  <>
                    <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.label, { paddingHorizontal: 0 }]}>{t('rfq.outerDia') || 'القطر الخارجي D'}</Text>
                        <TextInput
                          style={styles.input}
                          value={item.outerDiameter}
                          onChangeText={(v) => updateItem(index, { outerDiameter: v, calculatedPrice: undefined })}
                          placeholder="mm"
                          keyboardType="numeric"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.label, { paddingHorizontal: 0 }]}>{t('rfq.innerDia') || 'القطر الداخلي d'}</Text>
                        <TextInput
                          style={styles.input}
                          value={item.innerDiameter}
                          onChangeText={(v) => updateItem(index, { innerDiameter: v, calculatedPrice: undefined })}
                          placeholder="mm"
                          keyboardType="numeric"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.label, { paddingHorizontal: 0 }]}>{t('rfq.rollLen') || 'الطول L'}</Text>
                        <TextInput
                          style={styles.input}
                          value={item.rollLength}
                          onChangeText={(v) => updateItem(index, { rollLength: v, calculatedPrice: undefined })}
                          placeholder="mm"
                          keyboardType="numeric"
                        />
                      </View>
                    </View>
                    <Pressable
                      style={[styles.addItemBtn, { backgroundColor: '#2563eb', borderStyle: 'solid', marginTop: 8 }]}
                      onPress={() => void calcItemPrice(index)}
                    >
                      <Text style={[styles.addItemText, { color: '#fff' }]}>{t('rfq.calc') || 'احسب السعر'}</Text>
                    </Pressable>
                    {item.calculatedPrice != null && (
                      <View style={{ marginHorizontal: 16, marginTop: 8, padding: 10, backgroundColor: '#dcfce7', borderRadius: 8 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#166534' }}>
                          {t('rfq.estimatedPrice') || 'السعر التقديري'}: {item.calculatedPrice.toLocaleString('ar-EG')} SAR
                        </Text>
                      </View>
                    )}
                  </>
                )}
              </>
            )}
          </View>
        ))}

        <Pressable style={styles.addItemBtn} onPress={addItem}>
          <Text style={styles.addItemText}>{t('rfq.addItem')}</Text>
        </Pressable>

        <Text style={styles.label}>{t('rfq.requiredTime')}</Text>
        {renderChips(REQUIRED_TIMES, requiredTime, setRequiredTime, (k) => t(`requiredTimeOptions.${k}`))}
        {requiredTime === 'OTHERS' && othersInput(requiredTimeOther, setRequiredTimeOther)}

        <Text style={styles.label}>{t('rfq.workOrderDate')}</Text>
        <Pressable style={[styles.input, styles.dateInput]} onPress={() => setDatePickerOpen(true)}>
          <Text style={workOrderDate ? styles.dateValue : styles.datePlaceholder}>{workOrderDate || 'YYYY-MM-DD'}</Text>
          <Text style={styles.calendarIcon}>📅</Text>
        </Pressable>

        <Text style={styles.label}>{t('rfq.paymentTerms')}</Text>
        {renderChips(PAYMENT_TERMS, paymentTerms, setPaymentTerms, (k) => t(`paymentOptions.${k}`))}

        <Text style={styles.label}>{t('rfq.attachment')}</Text>
        {images.length > 0 ? (
          <>
            <View style={styles.multiImageRow}>
              {images.map((img, i) => (
                <View key={i} style={styles.imagePreviewItem}>
                  <Image source={{ uri: img.uri }} style={styles.attachPreview} />
                  <Pressable onPress={() => setImages((prev) => prev.filter((_, idx) => idx !== i))} style={styles.removeImgBtn}>
                    <Text style={styles.removeImgText}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </View>
            <Pressable style={styles.pickBtn} onPress={() => void pickImage()}>
              <Text style={styles.pickBtnText}>{t('rfq.pickImage')}</Text>
            </Pressable>
          </>
        ) : (
          <Pressable style={styles.pickBtn} onPress={() => void pickImage()}>
            <Text style={styles.pickBtnText}>{t('rfq.pickImage')}</Text>
          </Pressable>
        )}

        <Text style={styles.label}>{t('common.documents')}</Text>
        <Pressable style={styles.pickBtn} onPress={() => void pickDoc()}>
          <Text style={styles.pickBtnText}>{t('common.addFile')}</Text>
        </Pressable>
        {docs.length > 0 && (
          <View style={styles.docList}>
            {docs.map((doc, i) => (
              <View key={i} style={styles.docRow}>
                <Text style={styles.docName} numberOfLines={1}>📄 {doc.name}</Text>
                <Pressable onPress={() => setDocs((prev) => prev.filter((_, idx) => idx !== i))}>
                  <Text style={styles.removeImgText}>✕</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <Pressable style={[styles.submitBtn, sending && styles.submitDisabled]} onPress={() => void submit()} disabled={sending} accessibilityState={{ disabled: sending }}>
          {sending && <ActivityIndicator color="#fff" style={styles.submitSpinner} />}
          <Text style={styles.submitText}>{sending ? t('rfq.submitting') : editingRfq ? t('rfq.edit') + ' & ' + t('rfq.submit') : t('rfq.submit')}</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>{t('rfq.myRequests')}</Text>
        {requests.length > 0 && (
          <TextInput
            style={[styles.input, { marginBottom: 10 }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('rfq.searchPlaceholder') || 'بحث...'}
          />
        )}
        {(() => {
          const sq = searchQuery.trim().toLowerCase();
          const filtered = sq
            ? requests.filter((r) =>
                r.serialNumber?.toLowerCase().includes(sq) ||
                r.clientName.toLowerCase().includes(sq) ||
                r.items?.some((it) => it.description?.toLowerCase().includes(sq))
              )
            : requests;
          if (filtered.length === 0) return <Text style={styles.empty}>{t('rfq.empty')}</Text>;
          return filtered.map((r) => {
            const first = r.items?.[0];
          return (
            <Pressable key={r.id} style={styles.card} onPress={() => setDetailRfq(r)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{r.serialNumber || r.clientName}</Text>
                {r.serialNumber && <Text style={styles.cardMeta}>{r.clientName}</Text>}
                {first && ((first.requiredWork?.length && !(first.requiredWork.length === 1 && first.requiredWork[0] === 'NORMAL')) || first.workEnvironment !== 'NORMAL') && (
                  <Text style={styles.cardMeta}>
                    {first.requiredWork?.length && !(first.requiredWork.length === 1 && first.requiredWork[0] === 'NORMAL')
                      ? first.requiredWork.map((w) => t(`requiredWorkOptions.${w}`)).join(', ')
                      : ''}
                    {first.requiredWork?.length && !(first.requiredWork.length === 1 && first.requiredWork[0] === 'NORMAL') && first.workEnvironment !== 'NORMAL' ? ' · ' : ''}
                    {first.workEnvironment !== 'NORMAL' ? t(`workEnvironmentOptions.${first.workEnvironment}`) : ''}
                  </Text>
                )}
                <Text style={styles.cardMeta}>{t('rfq.items')}: {r.items?.length ?? 0} · {t('rfq.totalRolls')}: {totalRolls(r.items)} · {t(`paymentOptions.${r.paymentTerms}`)}</Text>
                <Text style={styles.cardMeta}>{t('rfq.sentOn')}: {new Date(r.createdAt).toLocaleString('ar-EG')}</Text>
                {r.pricingStatus === 'APPROVED' && r.price != null && String(r.price) !== '' ? (
                  <>
                    <Text style={styles.approvedChip}>
                      {t('rfq.approved')}: {Number(r.price).toLocaleString('ar-EG')} {r.currency || 'SAR'}
                    </Text>
                    {r.approvedAt && (
                      <Text style={styles.cardMeta}>
                        {t('rfq.approvedOn')}: {new Date(r.approvedAt).toLocaleString('ar-EG')}
                        {r.approvedBy ? ` · ${r.approvedBy}` : ''}
                      </Text>
                    )}
                  </>
                ) : r.pricingStatus === 'PRICED' && r.price != null && String(r.price) !== '' ? (
                  <Text style={styles.pricedChip}>
                    {t('rfq.priced')}: {Number(r.price).toLocaleString('ar-EG')} {r.currency || 'SAR'}
                  </Text>
                ) : (
                  <Text style={styles.unpricedChip}>{t('rfq.unpriced')}</Text>
              )}
                </View>
              {r.imageUrl && (
                <Image
                  source={{ uri: `${API_URL}/rfqs/${r.id}/image`, headers: token ? { Authorization: `Bearer ${token}` } : undefined }}
                  style={styles.thumb}
                />
              )}
              {!r.imageUrl && r.imageUrls && r.imageUrls.length > 0 && (
                <Image
                  source={{ uri: `${API_URL}/rfqs/${r.id}/image/0`, headers: token ? { Authorization: `Bearer ${token}` } : undefined }}
                  style={styles.thumb}
                />
              )}
            </Pressable>
          );
          });
        })()}
      </ScrollView>

      <DatePickerModal
        visible={datePickerOpen}
        value={workOrderDate || null}
        title={t('rfq.workOrderDate')}
        onSelect={setWorkOrderDate}
        onClose={() => setDatePickerOpen(false)}
      />

      <SelectModal
        visible={finishPickerFor != null}
        title={t('rfq.selectFinishing')}
        options={FINISHING_TYPES.map((f) => ({ value: f, label: t(`finishingOptions.${f}`) }))}
        onSelect={(v) => {
          if (finishPickerFor != null) updateItem(finishPickerFor, { finishingType: v });
        }}
        onClose={() => setFinishPickerFor(null)}
      />

      <SelectModal
        visible={envPickerFor != null}
        title={t('rfq.workEnvironment')}
        options={WORK_ENVIRONMENTS.map((w) => ({ value: w, label: t(`workEnvironmentOptions.${w}`) }))}
        onSelect={(v) => {
          if (envPickerFor != null) updateItem(envPickerFor, { workEnvironment: v });
        }}
        onClose={() => setEnvPickerFor(null)}
      />

      <SelectModal
        visible={materialPickerFor != null}
        title={t('rfq.selectMaterial') || 'اختر الخامة'}
        options={rollMaterials.map((m) => ({ value: m.id, label: m.name }))}
        onSelect={(v) => {
          if (materialPickerFor != null) updateItem(materialPickerFor, { rollMaterialId: v, calculatedPrice: undefined, outerDiameter: '', innerDiameter: '', rollLength: '' });
        }}
        onClose={() => setMaterialPickerFor(null)}
      />

      {detailRfq && (
        <View style={styles.detailOverlay}>
          <View style={styles.detailModal}>
            <ScrollView>
              <View style={styles.detailHeader}>
                <Text style={styles.detailTitle}>{detailRfq.serialNumber || t('rfq.details')}</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Pressable onPress={() => { setEditingRfq(detailRfq); setDetailRfq(null); }}>
                    <Text style={styles.editBtnText}>{t('rfq.edit')}</Text>
                  </Pressable>
                  <Pressable onPress={() => setDetailRfq(null)}>
                    <Text style={styles.detailClose}>{t('rfq.close')}</Text>
                  </Pressable>
                </View>
              </View>

              <Text style={styles.detailLabel}>{t('rfq.clientName')}</Text>
              <Text style={styles.detailValue}>{detailRfq.clientName}</Text>

              {detailRfq.contactName ? <><Text style={styles.detailLabel}>{t('rfq.contactName')}</Text><Text style={styles.detailValue}>{detailRfq.contactName}</Text></> : null}
              {detailRfq.contactPhone ? <><Text style={styles.detailLabel}>{t('rfq.contactPhone')}</Text><Text style={styles.detailValue}>{detailRfq.contactPhone}</Text></> : null}

              <Text style={styles.detailLabel}>{t('rfq.sentOn')}</Text>
              <Text style={styles.detailValue}>{new Date(detailRfq.createdAt).toLocaleString('ar-EG')}</Text>

              <Text style={styles.detailLabel}>{t('rfq.requiredTime')}</Text>
              <Text style={styles.detailValue}>{t(`requiredTimeOptions.${detailRfq.requiredTime}`)}</Text>

              <Text style={styles.detailLabel}>{t('rfq.paymentTerms')}</Text>
              <Text style={styles.detailValue}>{t(`paymentOptions.${detailRfq.paymentTerms}`)}</Text>

              {detailRfq.pricingStatus === 'APPROVED' && detailRfq.price != null && String(detailRfq.price) !== '' && (
                <>
                  <Text style={styles.detailLabel}>{t('rfq.approved')}</Text>
                  <Text style={styles.detailValue}>{Number(detailRfq.price).toLocaleString('ar-EG')} {detailRfq.currency || 'SAR'}</Text>
                </>
              )}
              {detailRfq.pricingStatus === 'PRICED' && detailRfq.price != null && String(detailRfq.price) !== '' && (
                <>
                  <Text style={styles.detailLabel}>{t('rfq.priced')}</Text>
                  <Text style={styles.detailValue}>{Number(detailRfq.price).toLocaleString('ar-EG')} {detailRfq.currency || 'SAR'}</Text>
                </>
              )}

              <Text style={[styles.detailLabel, { marginTop: 12 }]}>{t('rfq.comments')}</Text>
              {(detailRfq.comments ?? []).length === 0 && <Text style={styles.detailValue}>{t('rfq.noComments')}</Text>}
              {(detailRfq.comments ?? []).map((c) => (
                <View key={c.id} style={[styles.detailItemCard, { marginTop: 8 }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[styles.detailItemTitle, { color: '#2563eb' }]}>{c.author?.name ?? '—'}</Text>
                    <Text style={{ fontSize: 11, color: '#9ca3af' }}>{new Date(c.createdAt).toLocaleString('ar-EG')}</Text>
                  </View>
                  <Text style={[styles.detailItemText, { marginTop: 4 }]}>{c.text}</Text>
                </View>
              ))}

              <Text style={[styles.detailLabel, { marginTop: 12 }]}>{t('rfq.items')} ({detailRfq.items?.length ?? 0}) · {t('rfq.totalRolls')}: {totalRolls(detailRfq.items)}</Text>
              {(detailRfq.items ?? []).map((it, i) => (
                <View key={i} style={styles.detailItemCard}>
                  <Text style={styles.detailItemTitle}>{t('rfq.itemTitle')} {i + 1}</Text>
                  <Text style={styles.detailItemText}>{t('rfq.description')}: {it.description || '—'}</Text>
                  <Text style={styles.detailItemText}>{t('rfq.quantity')}: {it.quantity || '—'}</Text>
                  <Text style={styles.detailItemText}>{t('rfq.selectFinishing')}: {t(`finishingOptions.${it.finishingType}`)}{it.finishingType === 'OTHERS' && it.finishingTypeOther ? ` (${it.finishingTypeOther})` : ''}</Text>
                  {it.requiredWork && it.requiredWork.length > 0 && !(it.requiredWork.length === 1 && it.requiredWork[0] === 'NORMAL') && (
                    <Text style={styles.detailItemText}>{t('rfq.requiredWork')}: {it.requiredWork.map((w) => t(`requiredWorkOptions.${w}`)).join(', ')}</Text>
                  )}
                  {it.workEnvironment !== 'NORMAL' && (
                    <Text style={styles.detailItemText}>{t('rfq.workEnvironment')}: {t(`workEnvironmentOptions.${it.workEnvironment}`)}{it.workEnvironment === 'OTHERS' && it.workEnvironmentOther ? ` (${it.workEnvironmentOther})` : ''}</Text>
                  )}
                  {it.outerDiameter && it.innerDiameter && it.rollLength && (
                    <Text style={styles.detailItemText}>{t('rfq.rollDimensions') || 'أبعاد الرول'}: D:{it.outerDiameter} × d:{it.innerDiameter} × L:{it.rollLength} mm</Text>
                  )}
                  {it.calculatedPrice != null && (
                    <Text style={[styles.detailItemText, { color: '#166534', fontWeight: '700' }]}>{t('rfq.calculatedPriceLabel') || 'السعر المحسوب'}: {Number(it.calculatedPrice).toLocaleString('ar-EG')} SAR</Text>
                  )}
                </View>
              ))}

              {detailRfq.imageUrls && detailRfq.imageUrls.length > 0 && (
                <View style={styles.detailImageGrid}>
                  {detailRfq.imageUrls.map((url, i) => (
                    <Image key={i} source={{ uri: `${API_URL}/rfqs/${detailRfq.id}/image/${i}`, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.detailImageItem} />
                  ))}
                </View>
              )}
              {!detailRfq.imageUrls && detailRfq.imageUrl && (
                <Image source={{ uri: `${API_URL}/rfqs/${detailRfq.id}/image`, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.detailImage} />
              )}

              {detailRfq.documents && detailRfq.documents.length > 0 && (
                <>
                  <Text style={[styles.detailLabel, { marginTop: 12 }]}>{t('common.documents')}</Text>
                  {detailRfq.documents.map((d) => (
                    <View key={d.id} style={[styles.detailItemCard, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                      <Text style={[styles.detailItemText, { flex: 1 }]} numberOfLines={1}>📄 {d.fileName}</Text>
                      <View style={{ flexDirection: 'row', gap: 14 }}>
                        <Pressable onPress={() => void downloadDoc(d)}>
                          <Text style={styles.downloadLink}>{t('common.download')}</Text>
                        </Pressable>
                        {d.uploadedBy === user?.id && (
                          <Pressable onPress={() => void deleteDoc(d)}>
                            <Text style={styles.removeImgText}>{t('common.delete')}</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingTop: 60 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  label: { fontSize: 13, color: '#374151', marginTop: 12, marginBottom: 4, paddingHorizontal: 16 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 14, marginHorizontal: 16, backgroundColor: '#fff' },
  multilineSmall: { minHeight: 60, textAlignVertical: 'top' },
  othersInput: { marginTop: 8, minHeight: 60, textAlignVertical: 'top' },
  dateInput: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateValue: { fontSize: 14, color: '#111827' },
  datePlaceholder: { fontSize: 14, color: '#9ca3af' },
  calendarIcon: { fontSize: 16 },
  itemCard: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 10, paddingBottom: 6, paddingTop: 10, marginTop: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16 },
  itemTitle: { fontSize: 15, fontWeight: '700', color: '#2563eb' },
  removeText: { color: '#dc2626', fontWeight: '600', fontSize: 14 },
  addItemBtn: { marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderColor: '#2563eb', borderStyle: 'dashed', borderRadius: 8, padding: 12, alignItems: 'center', backgroundColor: '#eff6ff' },
  addItemText: { color: '#2563eb', fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#e5e7eb' },
  chipActive: { backgroundColor: '#2563eb' },
  chipText: { color: '#374151', fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  submitBtn: { backgroundColor: '#16a34a', borderRadius: 8, padding: 14, alignItems: 'center', marginHorizontal: 16, marginTop: 20, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  submitDisabled: { opacity: 0.6 },
  submitSpinner: {},
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', paddingHorizontal: 16, marginTop: 24, marginBottom: 10 },
  empty: { color: '#999', textAlign: 'center', marginTop: 8, marginBottom: 24 },
  card: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 10, padding: 14, borderRadius: 10, flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  cardMeta: { fontSize: 12, color: '#666', marginTop: 4 },
  thumb: { width: 48, height: 48, borderRadius: 8, marginLeft: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  pricedChip: { marginTop: 8, alignSelf: 'flex-start', backgroundColor: '#dcfce7', color: '#166534', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, fontSize: 12, fontWeight: '700', overflow: 'hidden' },
  approvedChip: { marginTop: 8, alignSelf: 'flex-start', backgroundColor: '#16a34a', color: '#fff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, fontSize: 12, fontWeight: '800', overflow: 'hidden' },
  unpricedChip: { marginTop: 8, alignSelf: 'flex-start', backgroundColor: '#f3f4f6', color: '#6b7280', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, fontSize: 12, fontWeight: '700', overflow: 'hidden' },
  pickBtn: { marginHorizontal: 16, borderWidth: 1, borderColor: '#2563eb', borderStyle: 'dashed', borderRadius: 8, padding: 12, alignItems: 'center', backgroundColor: '#eff6ff' },
  pickBtnText: { color: '#2563eb', fontWeight: '600' },
  pickerBtn: { marginHorizontal: 16, borderWidth: 1, borderColor: '#2563eb', borderStyle: 'dashed', borderRadius: 8, padding: 12, alignItems: 'center', backgroundColor: '#eff6ff' },
  docList: { marginHorizontal: 16, marginTop: 10 },
  docRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  docName: { flex: 1, fontSize: 13, color: '#111827', marginRight: 10 },
  downloadLink: { color: '#2563eb', fontSize: 14, fontWeight: '600' },
  imagePreviewRow: { marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  multiImageRow: { marginHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  imagePreviewItem: { position: 'relative' },
  removeImgBtn: { position: 'absolute', top: -6, right: -6, backgroundColor: '#dc2626', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  attachPreview: { width: 84, height: 84, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  removeImgText: { color: '#dc2626', fontWeight: '600', fontSize: 14 },
  detailOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16, zIndex: 100 },
  detailModal: { backgroundColor: '#fff', borderRadius: 14, maxHeight: '85%', padding: 20 },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  detailTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  detailClose: { fontSize: 16, color: '#2563eb', fontWeight: '600' },
  editBtnText: { fontSize: 16, color: '#16a34a', fontWeight: '600' },
  detailLabel: { fontSize: 12, color: '#6b7280', marginTop: 8 },
  detailValue: { fontSize: 14, color: '#111827', marginTop: 2 },
  detailItemCard: { backgroundColor: '#f9fafb', borderRadius: 8, padding: 12, marginTop: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  detailItemTitle: { fontSize: 14, fontWeight: '700', color: '#2563eb', marginBottom: 4 },
  detailItemText: { fontSize: 13, color: '#374151', marginTop: 2 },
  detailImageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  detailImageItem: { width: 120, height: 120, borderRadius: 8, resizeMode: 'cover' },
  detailImage: { width: '100%', height: 200, borderRadius: 8, marginTop: 12, resizeMode: 'cover' },
});
