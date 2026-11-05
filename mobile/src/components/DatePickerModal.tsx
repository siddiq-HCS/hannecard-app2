import { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useI18n } from '../i18n';

interface Props {
  visible: boolean;
  value: string | null; // YYYY-MM-DD
  onSelect: (v: string) => void;
  onClose: () => void;
  title: string;
}

const DAY_LETTERS = {
  ar: ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};
const MONTH_NAMES = {
  ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

const pad = (n: number) => String(n).padStart(2, '0');

export function DatePickerModal({ visible, value, onSelect, onClose, title }: Props) {
  const { lang, t } = useI18n();
  const now = new Date();
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() });

  useEffect(() => {
    if (!visible) return;
    if (value) {
      const [y, m] = value.split('-').map(Number);
      setView({ y, m: m - 1 });
    } else {
      setView({ y: now.getFullYear(), m: now.getMonth() });
    }
  }, [visible]);

  const firstDayIndex = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  function move(dir: number) {
    setView((v) => {
      const d = new Date(v.y, v.m + dir, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayIndex; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* غلاف قابل للتمرير: إذا تجاوزت البطاقة ارتفاع الشاشة تبقى قابلة للتمرير */}
      <ScrollView style={styles.backdrop} contentContainerStyle={styles.backdropContent} bounces={false} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>

          <View style={styles.monthRow}>
            <Pressable style={styles.navBtn} onPress={() => move(-1)}>
              <Text style={styles.navText}>◀</Text>
            </Pressable>
            <Text style={styles.monthLabel}>{MONTH_NAMES[lang][view.m]} {view.y}</Text>
            <Pressable style={styles.navBtn} onPress={() => move(1)}>
              <Text style={styles.navText}>▶</Text>
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {DAY_LETTERS[lang].map((d, i) => (
              <Text key={i} style={styles.weekCell}>{d}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((d, i) => {
              if (d == null) return <View key={i} style={styles.dayCell} />;
              const iso = `${view.y}-${pad(view.m + 1)}-${pad(d)}`;
              const selected = iso === value;
              const isToday = iso === today;
              return (
                <Pressable
                  key={i}
                  style={[styles.dayCell, selected && styles.daySelected, isToday && !selected && styles.dayToday]}
                  onPress={() => onSelect(iso)}
                >
                  <Text style={[styles.dayText, selected && styles.dayTextSelected]}>{d}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* أزرار ثابتة أسفل الشبكة — تظهر دائماً بصرف النظر عن عدد الأيام */}
          <View style={styles.btnRow}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable style={styles.okBtn} onPress={onClose}>
              <Text style={styles.okText}>{t('common.done')}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  backdropContent: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: { width: 320, minWidth: 320, maxWidth: 320, alignSelf: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 18, maxHeight: '95%', overflow: 'hidden' },
  title: { fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  navBtn: { paddingHorizontal: 14, paddingVertical: 6 },
  navText: { fontSize: 14, color: '#2563eb' },
  monthLabel: { fontSize: 15, fontWeight: '600' },
  weekRow: { width: 276, flexDirection: 'row', justifyContent: 'center', gap: 4, marginBottom: 2, alignSelf: 'center' },
  weekCell: { width: 36, height: 36, minWidth: 36, minHeight: 36, flexShrink: 0, textAlign: 'center', textAlignVertical: 'center', fontSize: 12, color: '#6b7280', fontWeight: '700' },
  grid: { width: 276, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4, paddingVertical: 4, alignSelf: 'center' },
  dayCell: { width: 36, height: 36, minWidth: 36, minHeight: 36, maxWidth: 36, maxHeight: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  daySelected: { backgroundColor: '#2563eb', borderRadius: 18 },
  dayToday: { borderWidth: 1, borderColor: '#2563eb', borderRadius: 18 },
  dayText: { fontSize: 14, color: '#111827' },
  dayTextSelected: { color: '#fff', fontWeight: '700' },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
  },
  cancelBtn: { flex: 1, backgroundColor: '#e5e7eb', borderRadius: 8, padding: 12, alignItems: 'center' },
  cancelText: { color: '#374151', fontWeight: '600' },
  okBtn: { flex: 1, backgroundColor: '#2563eb', borderRadius: 8, padding: 12, alignItems: 'center' },
  okText: { color: '#fff', fontWeight: '600' },
});