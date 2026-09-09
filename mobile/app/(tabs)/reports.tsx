import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, RefreshControl, Image, Modal, ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { api, API_URL, DEFAULT_REQUEST_TIMEOUT } from '@/api/client';
import { getCurrentPosition } from '@/services/location';
import { requireTodayCheckIn, todayLocal } from '@/services/attendance';
import { pickWebImages, pickWebDocs, dataUrlToBlob, appendFileToForm, isWeb } from '@/services/webImagePicker';
import { Logo } from '@/components/Logo';

const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY'] as const;
const CATEGORIES = ['PLASTICS', 'PRINTING', 'PACKAGING', 'WOOD', 'METAL', 'PAPER', 'TISSUES', 'TEXTILES', 'FOOD_INDUSTRY', 'OTHERS'] as const;
const DEFAULT_VISITS_PER_DAY = 1;
const MIN_VISITS_TO_SUBMIT = 30;

type DayName = (typeof DAYS)[number];

interface PlanDocument {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedBy: string;
}

interface Visit {
  id?: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  address: string;
  purpose: string;
  companyCategory: string;
  categoryOther: string;
  notes: string;
  imageUrl?: string | null;
  pendingImage?: { uri: string; mimeType?: string; name?: string; base64?: string } | null;
  documents?: PlanDocument[];
}

interface Day {
  dayName: DayName;
  visits: Visit[];
}

interface Plan {
  id: string;
  year: number;
  weekNumber: number;
  serialNumber: string;
  startDate: string;
  endDate: string;
  status: string;
  days: { id: string; dayName: string; date?: string; visits: (Omit<Visit, 'pendingImage'>)[] }[];
}

const newVisit = (): Visit => ({
  companyName: '',
  contactPerson: '',
  phone: '',
  address: '',
  purpose: '',
  companyCategory: 'PLASTICS',
  categoryOther: '',
  notes: '',
  imageUrl: null,
  pendingImage: null,
});

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

function initDays(): Day[] {
  return DAYS.map((dayName) => ({ dayName, visits: Array.from({ length: DEFAULT_VISITS_PER_DAY }, () => newVisit()) }));
}

function currentWeek() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const year = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return { year: String(year), week: String(week) };
}

// الأحد (بداية أسبوع العمل) من سنة ISO + رقم أسبوع
function isoWeekSunday(year: number, week: number) {
  const monday = new Date(Date.UTC(year, 0, 4));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7) + 1);
  monday.setUTCDate(monday.getUTCDate() + (week - 1) * 7);
  monday.setUTCDate(monday.getUTCDate() - 1);
  return monday;
}

const DAY_MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const DAY_MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDayDate(date: Date, lang: string) {
  const day = date.getUTCDate();
  const month = date.getUTCMonth();
  if (lang === 'ar') return `${day} ${DAY_MONTHS_AR[month]}`;
  return `${DAY_MONTHS_EN[month]} ${day}`;
}

export default function WeeklyPlansScreen() {
  const { token, user } = useAuth();
  const { t, lang } = useI18n();
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const [formOpen, setFormOpen] = useState(false);
  const [planId, setPlanId] = useState<string | null>(null);
  const [planStatus, setPlanStatus] = useState('DRAFT');
  const [year, setYear] = useState(currentWeek().year);
  const [weekNumber, setWeekNumber] = useState(currentWeek().week);
  const [days, setDays] = useState<Day[]>([]);
  const [collapsed, setCollapsed] = useState<Partial<Record<DayName, boolean>>>({});
  const [pickerTarget, setPickerTarget] = useState<{ di: number; vi: number } | null>(null);
  const [pendingDocs, setPendingDocs] = useState<Record<string, { uri: string; name: string; mimeType: string; base64?: string }[]>>({});

  function auth() {
    return { Authorization: `Bearer ${token}` };
  }

  async function ensureCheckedIn(): Promise<boolean> {
    const gate = await requireTodayCheckIn(token ?? '', user?.role === 'REPRESENTATIVE');
    if (gate === 'attendance_required') {
      Alert.alert(t('attendance.requiredTitle'), t('attendance.requiredMsg'), [
        { text: t('attendance.goCheckIn'), onPress: () => router.navigate('/(tabs)/attendance') },
        { text: t('common.cancel'), style: 'cancel' },
      ]);
      return false;
    }
    return true;
  }

  async function load() {
    if (!token) return;
    const res = await api.get('/weekly-plans', { headers: auth() });
    setPlans(res.data);
  }

  useEffect(() => {
    void load();
  }, [token]);

  function closeForm() {
    setFormOpen(false);
    setPlanId(null);
    setPlanStatus('DRAFT');
    const cw = currentWeek();
    setYear(cw.year);
    setWeekNumber(cw.week);
    setDays([]);
    setCollapsed({});
    setPendingDocs({});
  }

  function openNew() {
    setPlanId(null);
    setPlanStatus('DRAFT');
    const cw = currentWeek();
    setYear(cw.year);
    setWeekNumber(cw.week);
    setDays(initDays());
    setCollapsed({});
    setFormOpen(true);
  }

  function openPlan(p: Plan) {
    setPlanId(p.id);
    setPlanStatus(p.status);
    setYear(String(p.year));
    setWeekNumber(String(p.weekNumber));
    setDays(
      DAYS.map((dayName) => {
        const existing = p.days.find((d) => d.dayName === dayName);
        return {
          dayName,
          // ضمان وجود زيارة واحدة افتراضية على الأقل لكل يوم عند الفتح
          visits: existing && existing.visits.length ? existing.visits.map((v) => ({ ...v, pendingImage: null })) : [newVisit()],
        };
      }),
    );
    setCollapsed({});
    setFormOpen(true);
  }

  function toggleDay(name: DayName) {
    setCollapsed((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  function updateVisit(di: number, vi: number, patch: Partial<Visit>) {
    setDays((prev) => prev.map((d, i) => (i === di ? { ...d, visits: d.visits.map((v, j) => (j === vi ? { ...v, ...patch } : v)) } : d)));
  }

  function addVisit(di: number) {
    setDays((prev) => prev.map((d, i) => (i === di ? { ...d, visits: [...d.visits, newVisit()] } : d)));
  }

  function removeVisit(di: number, vi: number) {
    setDays((prev) =>
      prev.map((d, i) => (i === di && d.visits.length > 1 ? { ...d, visits: d.visits.filter((_, j) => j !== vi) } : d)),
    );
  }

  async function pickImage(di: number, vi: number) {
    // على الويب (iOS Safari): فتح <input type="file"> مباشرة لضمان دورانه بسلاسة
    if (isWeb) {
      const picked = await pickWebImages(false);
      if (picked.length > 0) {
        const p = picked[0];
        updateVisit(di, vi, { pendingImage: { uri: p.uri, mimeType: p.mimeType, name: p.name, base64: p.base64 } });
      }
      return;
    }
    Alert.alert(t('weeklyPlans.pickImage'), '', [
      { text: t('weeklyPlans.gallery'), onPress: () => void pickFromLibrary(di, vi) },
      { text: t('weeklyPlans.camera'), onPress: () => void pickFromCamera(di, vi) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  async function pickFromLibrary(di: number, vi: number) {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 0.7 });
    if (!res.canceled) {
      const a = res.assets[0];
      updateVisit(di, vi, { pendingImage: { uri: a.uri, mimeType: a.mimeType } });
    }
  }

  async function pickFromCamera(di: number, vi: number) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 0.7 });
    if (!res.canceled) {
      const a = res.assets[0];
      updateVisit(di, vi, { pendingImage: { uri: a.uri, mimeType: a.mimeType } });
    }
  }

  async function pickDocForVisit(di: number, vi: number) {
    const key = `${di}-${vi}`;
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
      setPendingDocs((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), ...newDocs] }));
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
    const picked = res.assets
      .map((a) => ({ uri: a.uri, name: a.name ?? 'file.pdf', mimeType: docMime(a.name ?? '') }))
      .filter((d) => d.mimeType !== 'application/octet-stream');
    if (picked.length === 0) return Alert.alert(t('login.alertTitle'), t('common.addFile'));
    setPendingDocs((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), ...picked] }));
  }

  async function downloadVisitDoc(d: PlanDocument) {
    try {
      const dest = `${FileSystem.cacheDirectory}doc_${sanitizeFileName(d.fileName)}`;
      const res = await FileSystem.downloadAsync(
        `${API_URL}/plan-documents/${d.id}/file`,
        dest,
        { headers: auth() },
      );
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(res.uri, { mimeType: d.mimeType });
      } else {
        Alert.alert(t('login.alertTitle'), t('common.noDocuments'));
      }
    } catch {
      Alert.alert(t('login.alertTitle'), t('weeklyPlans.saveErr'));
    }
  }

  async function deleteVisitDoc(d: PlanDocument) {
    if (!token) return;
    try {
      await api.delete(`/plan-documents/${d.id}`, { headers: auth() });
      setDays((prev) => prev.map((day) => ({
        ...day,
        visits: day.visits.map((v) => (v.id ? { ...v, documents: (v.documents ?? []).filter((x) => x.id !== d.id) } : v)),
      })));
    } catch {
      Alert.alert(t('login.alertTitle'), t('weeklyPlans.saveErr'));
    }
  }

  const fileUrl = (visitId: string) => `${API_URL}/weekly-plans/visits/${visitId}/image`;

  const totalVisits = () => days.reduce((sum, d) => sum + d.visits.length, 0);

  // تحويل خطأ الخادم إلى رسالة عربية/إنجليزية دقيقة تُظهر للمندوب سبب الفشل الحقيقي
  function planErrorMessage(err: unknown, isSubmitF: boolean): string {
    const fallback = isSubmitF ? t('weeklyPlans.submitErr') : t('weeklyPlans.saveErr');
    try {
      const known = err as {
        response?: { data?: { error?: string; message?: string }; status?: number };
        code?: string;
      };
      const code = known?.response?.data?.error ?? known?.code;
      const status = known?.response?.status ?? 0;
      const map: Record<string, string> = {
        attendance_required: t('weeklyPlans.errAttendance'),
        not_editable: t('weeklyPlans.errNotEditable'),
        missing_company_name: t('weeklyPlans.errMissingCompany'),
        min_visits: t('weeklyPlans.errMinVisits'),
        invalid_input: t('weeklyPlans.errInvalid'),
      };
      if (code && map[code]) return map[code];
      if (known?.response?.data?.message) return known.response.data.message;
      if (status >= 500) return t('weeklyPlans.errServer');
      if (!known?.response && known?.code) {
        // بدون استجابة من الخادم (ECONNABORTED/ERR_NETWORK وغيرها)
        return t('weeklyPlans.errNetwork');
      }
    } catch {
      /* ignore */
    }
    return fallback;
  }

  async function save(isSubmit: boolean) {
    if (!token) return;
    if (savingRef.current) return;
    const y = Number(year);
    const w = Number(weekNumber);
    if (!year.trim() || !weekNumber.trim() || Number.isNaN(y) || Number.isNaN(w) || y < 2000 || y > 2100 || w < 1 || w > 53) {
      return Alert.alert(t('login.alertTitle'), t('weeklyPlans.needWeek'));
    }
    if (isSubmit) {
      const empty = days.some((d) => d.visits.some((v) => !v.companyName.trim()));
      if (empty) return Alert.alert(t('login.alertTitle'), t('weeklyPlans.requiredCompany'));
      if (totalVisits() < MIN_VISITS_TO_SUBMIT) {
        return Alert.alert(t('login.alertTitle'), `${t('weeklyPlans.minVisits')} (${totalVisits()})`);
      }
    }
    if (!(await ensureCheckedIn())) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const coords = await getCurrentPosition();
      const meta = { year: y, weekNumber: w, date: todayLocal(), ...(coords ?? {}) };
      let id = planId;
      if (!id) {
        const created = await api.post('/weekly-plans', meta, { headers: auth() });
        id = (created.data as Plan).id;
      }
      const payloadDays = days.map((d) => ({
        dayName: d.dayName,
        visits: d.visits.map((v) => ({
          id: v.id,
          companyName: v.companyName,
          contactPerson: v.contactPerson,
          phone: v.phone,
          address: v.address,
          purpose: v.purpose,
          companyCategory: v.companyCategory,
          categoryOther: v.categoryOther,
          notes: v.notes,
        })),
      }));
      const res = await api.put(`/weekly-plans/${id}`, { ...meta, days: payloadDays }, { headers: auth() });
      const echo = res.data as Plan;

      for (let di = 0; di < days.length; di++) {
        const echoDay = echo.days?.[di];
        if (!echoDay) continue;
        for (let vi = 0; vi < days[di].visits.length; vi++) {
          const v = days[di].visits[vi];
          const ev = echoDay.visits?.[vi];
          if (v.pendingImage && ev?.id) {
            const form = new FormData();
            if (isWeb && v.pendingImage.base64) {
              const blob = dataUrlToBlob(v.pendingImage.base64);
              if (blob) form.append('image', blob, v.pendingImage.name || 'photo.jpg');
            } else {
              form.append('image', { uri: v.pendingImage.uri, name: 'photo.jpg', type: v.pendingImage.mimeType ?? 'image/jpeg' } as unknown as Blob);
            }
            await api.post(`/weekly-plans/visits/${ev.id}/image`, form, { headers: auth() });
          }
          const pending = pendingDocs[`${di}-${vi}`];
          if (pending && pending.length > 0 && ev?.id) {
            for (const doc of pending) {
              const form = new FormData();
              if (isWeb && doc.base64) {
                // على الويب: نرفق Blob حقيقياً من base64 (react-native-web لا يدعم كائن {uri,name,type})
                if (!appendFileToForm(doc.base64, doc.mimeType, doc.name, 'file', form)) {
                  throw new Error('upload_failed');
                }
              } else {
                form.append('file', { uri: doc.uri, name: doc.name, type: doc.mimeType } as unknown as Blob);
              }
              await api.post(`/weekly-plans/visits/${ev.id}/documents`, form, { headers: auth() });
            }
          }
        }
      }

      if (isSubmit) {
        await api.post(`/weekly-plans/${id}/submit`, { date: todayLocal() }, { headers: auth() });
      }
      Alert.alert(t('weeklyPlans.ok'), isSubmit ? t('weeklyPlans.submittedMsg') : t('weeklyPlans.draftSaved'));
      closeForm();
      try {
        await load();
      } catch {
        // فشل تحديث القائمة لا يُعتبر فشلاً لعملية الحفظ — تم الحفظ بنجاح
      }
    } catch (err) {
      Alert.alert(t('login.alertTitle'), planErrorMessage(err, isSubmit));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
    // مهلة أمان (Watchdog): تحرر الأزرار وتخفي مؤشر التحميل حتى لو علق أي طلب رفع لأي سبب
    setTimeout(() => {
      savingRef.current = false;
      setSaving(false);
    }, DEFAULT_REQUEST_TIMEOUT + 15_000);
  }

  function statusBadge(status: string) {
    const map: Record<string, { text: string; style: object; textStyle: object }> = {
      DRAFT: { text: t('weeklyPlans.statusDraft'), style: styles.badgeDraft, textStyle: styles.badgeDraftText },
      SUBMITTED: { text: t('weeklyPlans.statusSubmitted'), style: styles.badgeSent, textStyle: styles.badgeSentText },
      APPROVED: { text: t('weeklyPlans.statusApproved'), style: styles.badgeApproved, textStyle: styles.badgeApprovedText },
    };
    const b = map[status] ?? map.DRAFT;
    return (
      <View style={[styles.badge, b.style]}>
        <Text style={[styles.badgeText, b.textStyle]}>{b.text}</Text>
      </View>
    );
  }

  if (formOpen) {
    const readOnly = planId != null && planStatus !== 'DRAFT';

    // ربط كل يوم من أيام العمل الخمسة بتاريخه الفعلي في الأسبوع المحدد
    const weekStart = (() => {
      const y = Number(year);
      const w = Number(weekNumber);
      if (Number.isNaN(y) || Number.isNaN(w) || y < 2000 || y > 2100 || w < 1 || w > 53) return null;
      return isoWeekSunday(y, w);
    })();
    const dayDates = weekStart ? DAYS.map((_, i) => { const d = new Date(weekStart); d.setUTCDate(d.getUTCDate() + i); return d; }) : [];
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Pressable onPress={closeForm}>
            <Text style={styles.backText}>‹ {t('weeklyPlans.back')}</Text>
          </Pressable>
          <Text style={styles.title}>{planId ? t('weeklyPlans.editPlan') : t('weeklyPlans.newPlan')}</Text>
        </View>

        {readOnly && (
          <View style={styles.readOnlyBanner}>
            <Text style={styles.readOnlyBannerText}>{t('weeklyPlans.readOnlyMsg')}</Text>
          </View>
        )}

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.formScrollContent}
        >
          <View style={styles.weekRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{t('weeklyPlans.year')}</Text>
              <TextInput
                style={styles.input}
                value={year}
                onChangeText={setYear}
                placeholder="2026"
                keyboardType="number-pad"
                maxLength={4}
                editable={!readOnly}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{t('weeklyPlans.week')}</Text>
              <TextInput
                style={styles.input}
                value={weekNumber}
                onChangeText={setWeekNumber}
                placeholder="32"
                keyboardType="number-pad"
                maxLength={2}
                editable={!readOnly}
              />
            </View>
          </View>

          <Text style={styles.workDaysLabel}>{t('weeklyPlans.workDays')}</Text>

          {days.map((d, di) => {
            const date = dayDates[di];
            const isCollapsed = !!collapsed[d.dayName];
            return (
              <View key={d.dayName} style={styles.daySection}>
                <Pressable style={styles.dayHeader} onPress={() => toggleDay(d.dayName)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dayHeaderTitle}>
                      {t(`dayNames.${d.dayName}`)}
                      {date ? `  ·  ${formatDayDate(date, lang)}` : ''}
                    </Text>
                    <Text style={styles.dayHeaderMeta}>
                      {t('weeklyPlans.dayVisits')}: {d.visits.length}
                    </Text>
                  </View>
                  <Text style={styles.dayChevron}>{isCollapsed ? '▸' : '▾'}</Text>
                </Pressable>

                {!isCollapsed && (
                  <>
                    {d.visits.map((v, vi) => (
                      <View key={`${d.dayName}-${vi}`} style={styles.visitCard}>
                        <View style={styles.visitHeader}>
                          <Text style={styles.visitTitle}>{t('weeklyPlans.visit')} {vi + 1}</Text>
                          {!readOnly && d.visits.length > 1 && (
                            <Pressable onPress={() => removeVisit(di, vi)}>
                              <Text style={styles.removeText}>{t('weeklyPlans.removeVisit')}</Text>
                            </Pressable>
                          )}
                        </View>

                        <Text style={styles.label}>{t('weeklyPlans.companyName')}</Text>
                        <TextInput style={styles.input} value={v.companyName} onChangeText={(s) => updateVisit(di, vi, { companyName: s })} placeholder={t('weeklyPlans.companyNamePlaceholder')} editable={!readOnly} />

                        <Text style={styles.label}>{t('weeklyPlans.contactPerson')}</Text>
                        <TextInput style={styles.input} value={v.contactPerson} onChangeText={(s) => updateVisit(di, vi, { contactPerson: s })} placeholder={t('weeklyPlans.contactPersonPlaceholder')} editable={!readOnly} />

                        <Text style={styles.label}>{t('weeklyPlans.phone')}</Text>
                        <TextInput style={styles.input} value={v.phone} onChangeText={(s) => updateVisit(di, vi, { phone: s })} placeholder={t('weeklyPlans.phonePlaceholder')} keyboardType="phone-pad" editable={!readOnly} />

                        <Text style={styles.label}>{t('weeklyPlans.address')}</Text>
                        <TextInput style={styles.input} value={v.address} onChangeText={(s) => updateVisit(di, vi, { address: s })} placeholder={t('weeklyPlans.addressPlaceholder')} editable={!readOnly} />

                        <Text style={styles.label}>{t('weeklyPlans.purpose')}</Text>
                        <TextInput
                          style={[styles.input, styles.multiline]}
                          value={v.purpose}
                          onChangeText={(s) => updateVisit(di, vi, { purpose: s })}
                          placeholder={t('weeklyPlans.purposePlaceholder')}
                          multiline
                          editable={!readOnly}
                        />

                        <Text style={styles.label}>{t('weeklyPlans.category')}</Text>
                        <Pressable
                          style={[styles.input, styles.pickerField]}
                          onPress={readOnly ? undefined : () => setPickerTarget({ di, vi })}
                        >
                          <Text style={v.companyCategory ? styles.pickerValue : styles.pickerPlaceholder}>
                            {v.companyCategory ? t(`companyCategory.${v.companyCategory}`) : t('weeklyPlans.categoryPlaceholder')}
                          </Text>
                          <Text style={styles.pickerChevron}>▾</Text>
                        </Pressable>
                        {v.companyCategory === 'OTHERS' && (
                          <TextInput style={[styles.input, styles.othersInput]} value={v.categoryOther} onChangeText={(s) => updateVisit(di, vi, { categoryOther: s })} placeholder={t('weeklyPlans.categoryOther')} editable={!readOnly} />
                        )}

                        <Text style={styles.label}>{t('weeklyPlans.notes')}</Text>
                        <TextInput style={[styles.input, styles.multiline]} value={v.notes} onChangeText={(s) => updateVisit(di, vi, { notes: s })} placeholder={t('weeklyPlans.notesPlaceholder')} multiline editable={!readOnly} />

                        <Text style={styles.label}>{t('weeklyPlans.image')}</Text>
                        <View style={styles.imgRow}>
                          <Pressable style={styles.pickBtn} onPress={readOnly ? undefined : () => void pickImage(di, vi)}>
                            <Text style={styles.pickBtnText}>{t('weeklyPlans.pickImage')}</Text>
                          </Pressable>
                          {(v.pendingImage || v.imageUrl) && (
                            <Image
                              source={v.pendingImage ? { uri: v.pendingImage.uri } : { uri: fileUrl(v.id ?? ''), headers: auth() }}
                              style={styles.thumb}
                            />
                          )}
                        </View>

                        <Text style={styles.label}>{t('common.documents')}</Text>
                        {!readOnly && (
                          <Pressable style={styles.addDocBtn} onPress={() => void pickDocForVisit(di, vi)}>
                            <Text style={styles.addDocBtnText}>{t('common.addFile')}</Text>
                          </Pressable>
                        )}
                        {(pendingDocs[`${di}-${vi}`] ?? []).map((doc, pi) => (
                          <View key={`p-${pi}`} style={styles.docRow}>
                            <Text style={styles.docName} numberOfLines={1}>📄 {doc.name}</Text>
                            <Pressable
                              onPress={() =>
                                setPendingDocs((prev) => ({
                                  ...prev,
                                  [`${di}-${vi}`]: (prev[`${di}-${vi}`] ?? []).filter((_, i) => i !== pi),
                                }))
                              }
                            >
                              <Text style={styles.removeText}>✕</Text>
                            </Pressable>
                          </View>
                        ))}
                        {(v.documents ?? []).map((d) => (
                          <View key={d.id} style={styles.docRow}>
                            <Text style={styles.docName} numberOfLines={1}>📄 {d.fileName}</Text>
                            <View style={{ flexDirection: 'row', gap: 12 }}>
                              <Pressable onPress={() => void downloadVisitDoc(d)}>
                                <Text style={styles.docAction}>{t('common.download')}</Text>
                              </Pressable>
                              {!readOnly && d.uploadedBy === user?.id && (
                                <Pressable onPress={() => void deleteVisitDoc(d)}>
                                  <Text style={styles.removeText}>{t('common.delete')}</Text>
                                </Pressable>
                              )}
                            </View>
                          </View>
                        ))}
                        {(v.documents?.length ?? 0) === 0 && (pendingDocs[`${di}-${vi}`]?.length ?? 0) === 0 && (
                          <Text style={styles.docEmpty}>{t('common.noDocuments')}</Text>
                        )}
                      </View>
                    ))}

                    {!readOnly && (
                      <Pressable style={styles.addVisitBtn} onPress={() => addVisit(di)}>
                        <Text style={styles.addVisitText}>{t('weeklyPlans.addVisit')}</Text>
                      </Pressable>
                    )}
                  </>
                )}
              </View>
            );
          })}

          {!readOnly && (
            <View style={styles.saveRow}>
              <Pressable style={styles.draftBtn} onPress={() => void save(false)} disabled={saving}>
                {saving ? <ActivityIndicator color="#0f172a" /> : <Text style={styles.draftBtnText}>{t('weeklyPlans.saveDraft')}</Text>}
              </Pressable>
              <Pressable style={styles.submitBtn} onPress={() => void save(true)} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>{t('weeklyPlans.submit')}</Text>}
              </Pressable>
            </View>
          )}
        </ScrollView>

        {pickerTarget && (
          <Modal visible transparent animationType="fade" onRequestClose={() => setPickerTarget(null)}>
            <Pressable style={styles.pickerOverlay} onPress={() => setPickerTarget(null)}>
              <View style={styles.pickerSheet}>
                <Text style={styles.pickerTitle}>{t('weeklyPlans.category')}</Text>
                {CATEGORIES.map((c) => {
                  const active = days[pickerTarget.di]?.visits[pickerTarget.vi]?.companyCategory === c;
                  return (
                    <Pressable
                      key={c}
                      style={[styles.pickerOption, active && styles.pickerOptionActive]}
                      onPress={() => {
                        const { di, vi } = pickerTarget;
                        setPickerTarget(null);
                        updateVisit(di, vi, { companyCategory: c });
                      }}
                    >
                      <Text style={[styles.pickerOptionText, active && styles.pickerOptionTextActive]}>{t(`companyCategory.${c}`)}</Text>
                      {active && <Text style={styles.pickerCheck}>✓</Text>}
                    </Pressable>
                  );
                })}
              </View>
            </Pressable>
          </Modal>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerTitleWrap}>
          <Logo size={30} />
          <Text style={styles.title}>{t('weeklyPlans.title')}</Text>
        </View>
        <Pressable style={styles.addBtn} onPress={openNew}>
          <Text style={styles.addBtnText}>{t('weeklyPlans.newPlan')}</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.formScrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />}
      >
        {plans.length === 0 && <Text style={styles.empty}>{t('weeklyPlans.empty')}</Text>}
        {plans.map((p) => {
          const total = (p.days ?? []).reduce((sum, d) => sum + (d.visits?.length ?? 0), 0);
          const first = (p.days ?? [])[0];
          return (
            <Pressable key={p.id} style={styles.card} onPress={() => openPlan(p)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>
                  {t('weeklyPlans.weekRange')}: {p.weekNumber} / {p.year}
                </Text>
                <Text style={styles.cardMeta}>
                  {new Date(p.startDate).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB')} →{' '}
                  {new Date(p.endDate).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB')} · {t('weeklyPlans.visit')}: {total} / {MIN_VISITS_TO_SUBMIT}
                </Text>
                <Text style={styles.cardMeta}>
                  {first?.visits?.[0]?.companyName || '—'}
                  {first?.visits?.[0]?.imageUrl ? ' · 📷' : ''}
                </Text>
                {statusBadge(p.status)}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingTop: 60 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  headerTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  title: { fontSize: 22, fontWeight: '700' },
  backText: { color: '#2563eb', fontWeight: '600', fontSize: 15 },
  addBtn: { backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
  card: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 10, padding: 14, borderRadius: 10 },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  cardMeta: { fontSize: 12, color: '#666', marginTop: 4 },
  readOnlyBanner: { backgroundColor: '#dbeafe', padding: 10, marginHorizontal: 16, borderRadius: 8 },
  readOnlyBannerText: { color: '#1d4ed8', fontSize: 13, fontWeight: '600' },
  weekRow: { flexDirection: 'row', gap: 12 },
  badge: { alignSelf: 'flex-start', marginTop: 8, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  badgeDraft: { backgroundColor: '#fef3c7' },
  badgeDraftText: { color: '#92400e' },
  badgeSent: { backgroundColor: '#dbeafe' },
  badgeSentText: { color: '#1d4ed8' },
  badgeApproved: { backgroundColor: '#dcfce7' },
  badgeApprovedText: { color: '#166534' },
  label: { fontSize: 13, color: '#374151', marginTop: 10, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 14, backgroundColor: '#fff' },
  workDaysLabel: { fontSize: 14, fontWeight: '700', color: '#374151', marginTop: 16 },
  daySection: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  dayHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12 },
  dayHeaderTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  dayHeaderMeta: { color: '#dbeafe', fontSize: 12, marginTop: 2 },
  dayChevron: { color: '#fff', fontSize: 16, marginLeft: 10 },
  visitCard: { backgroundColor: '#f8fafc', borderRadius: 8, padding: 12, marginTop: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  visitHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  visitTitle: { fontSize: 15, fontWeight: '700', color: '#2563eb' },
  removeText: { color: '#dc2626', fontWeight: '600', fontSize: 14 },
  twoCol: { flexDirection: 'row', gap: 10 },
  pickerField: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickerValue: { fontSize: 14, color: '#111827' },
  pickerPlaceholder: { fontSize: 14, color: '#9ca3af' },
  pickerChevron: { fontSize: 14, color: '#6b7280' },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  pickerSheet: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 8, maxHeight: 420 },
  pickerTitle: { fontSize: 15, fontWeight: '700', color: '#374151', paddingHorizontal: 16, paddingVertical: 10 },
  pickerOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  pickerOptionActive: { backgroundColor: '#eff6ff' },
  pickerOptionText: { fontSize: 14, color: '#374151' },
  pickerOptionTextActive: { color: '#2563eb', fontWeight: '600' },
  pickerCheck: { color: '#2563eb', fontSize: 14, fontWeight: '700' },
  othersInput: { marginTop: 8 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  imgRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pickBtn: { backgroundColor: '#7c3aed', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  pickBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  addDocBtn: { backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  addDocBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  docRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginTop: 6 },
  docName: { flex: 1, fontSize: 13, color: '#111827', marginRight: 10 },
  docAction: { color: '#2563eb', fontSize: 14, fontWeight: '600' },
  docEmpty: { fontSize: 12, color: '#9ca3af', marginTop: 6 },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: '#eee' },
  addVisitBtn: { marginTop: 12, borderWidth: 1, borderColor: '#2563eb', borderStyle: 'dashed', borderRadius: 8, padding: 12, alignItems: 'center', backgroundColor: '#eff6ff' },
  addVisitText: { color: '#2563eb', fontWeight: '600' },
  saveRow: { flexDirection: 'row', gap: 10, marginTop: 20, marginBottom: 120 },
  formScrollContent: { paddingTop: 4, paddingBottom: 140, paddingHorizontal: 16 },
  draftBtn: { flex: 1, backgroundColor: '#e5e7eb', borderRadius: 8, padding: 14, alignItems: 'center' },
  draftBtnText: { color: '#374151', fontWeight: '700' },
  submitBtn: { flex: 1, backgroundColor: '#16a34a', borderRadius: 8, padding: 14, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontWeight: '700' },
});
