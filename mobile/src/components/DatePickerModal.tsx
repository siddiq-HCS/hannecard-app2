import { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';

interface Props {
  visible: boolean;
  value: string | null; // YYYY-MM-DD
  onSelect: (v: string) => void;
  onClose: () => void;
  title: string;
}

const DAY_LETTERS = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج']; // السبت → الجمعة
const MONTH_NAMES = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const pad = (n: number) => String(n).padStart(2, '0');

export function DatePickerModal({ visible, value, onSelect, onClose, title }: Props) {
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

  const firstDayIndex = (new Date(view.y, view.m, 1).getDay() + 1) % 7; // السبت أولاً
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const today = now.toISOString().slice(0, 10);

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
            <Text style={styles.monthLabel}>{MONTH_NAMES[view.m]} {view.y}</Text>
            <Pressable style={styles.navBtn} onPress={() => move(1)}>
              <Text style={styles.navText}>▶</Text>
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {DAY_LETTERS.map((d, i) => (
              <Text key={i} style={styles.weekCell}>{d}</Text>
            ))}
          </View>

          {/* شبكة الأيام داخل تمرير بارتفاع محدود حتى تبقى الأزرار ظاهرة دائماً */}
          <ScrollView
            style={styles.gridScroll}
            contentContainerStyle={styles.grid}
            bounces={false}
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
          >
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
          </ScrollView>

          {/* أزرار ثابتة أسفل الشبكة — تظهر دائماً بصرف النظر عن عدد الأيام */}
          <View style={styles.btnRow}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>إلغاء</Text>
            </Pressable>
            <Pressable style={styles.okBtn} onPress={onClose}>
              <Text style={styles.okText}>تم</Text>
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
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 18, maxHeight: '95%', overflow: 'hidden' },
  title: { fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  navBtn: { paddingHorizontal: 14, paddingVertical: 6 },
  navText: { fontSize: 14, color: '#2563eb' },
  monthLabel: { fontSize: 15, fontWeight: '600' },
  weekRow: { flexDirection: 'row', marginBottom: 2 },
  weekCell: { flex: 1, textAlign: 'center', fontSize: 12, color: '#6b7280', paddingVertical: 6 },
  gridScroll: { maxHeight: 280, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 4 },
  dayCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: '#2563eb', borderRadius: 8 },
  dayToday: { borderWidth: 1, borderColor: '#2563eb', borderRadius: 8 },
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