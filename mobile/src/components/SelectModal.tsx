import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';

interface Option {
  value: string;
  label: string;
}

interface Props {
  visible: boolean;
  title: string;
  options: Option[];
  onSelect: (value: string) => void;
  onClose: () => void;
}

export function SelectModal({ visible, title, options, onSelect, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {options.map((o) => (
            <Pressable
              key={o.value}
              style={styles.option}
              onPress={() => {
                onSelect(o.value);
                onClose();
              }}
            >
              <Text style={styles.optionText}>{o.label}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>إلغاء</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 32 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  title: { fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  option: { paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  optionText: { fontSize: 15, color: '#111827' },
  cancelBtn: { marginTop: 8, padding: 12, alignItems: 'center', backgroundColor: '#e5e7eb', borderRadius: 8 },
  cancelText: { color: '#374151', fontWeight: '600' },
});
