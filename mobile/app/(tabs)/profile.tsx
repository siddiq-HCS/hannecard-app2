import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'expo-router';
import { colors } from '@/theme';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  async function onLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.meta}>الهاتف: {user?.phone}</Text>
        <Text style={styles.meta}>الدور: {user?.role === 'SALES_MANAGER' ? 'مدير المبيعات' : 'مندوب'}</Text>
      </View>
      <Pressable style={styles.logoutBtn} onPress={() => void onLogout()}>
        <Text style={styles.logoutText}>تسجيل الخروج</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 60, paddingHorizontal: 16 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 20 },
  name: { fontSize: 20, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 6 },
  logoutBtn: { backgroundColor: colors.danger, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 20 },
  logoutText: { color: '#fff', fontWeight: '700' },
});
