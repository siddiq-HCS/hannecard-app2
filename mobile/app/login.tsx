import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { colors } from '@/theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function onLogin() {
    if (!phone || !password) return Alert.alert('خطأ', 'أدخل رقم الهاتف وكلمة المرور');
    setLoading(true);
    try {
      await login(phone, password);
      router.replace('/(tabs)');
    } catch {
      Alert.alert('فشل تسجيل الدخول', 'تأكد من البيانات أو راجع مسؤول النظام');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.brand}>
        <Text style={styles.brandAr}>شركة هانيكارد السعودية</Text>
        <Text style={styles.brandEn}>HANYCARD SAUDI — Field Sales</Text>
      </View>
      <Text style={styles.title}>تسجيل الدخول</Text>
      <TextInput
        style={styles.input}
        placeholder="رقم الهاتف"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoCapitalize="none"
      />
      <TextInput style={styles.input} placeholder="كلمة المرور" value={password} onChangeText={setPassword} secureTextEntry />
      <Pressable style={styles.button} onPress={onLogin} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'جاري الدخول...' : 'دخول'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.card },
  brand: { alignItems: 'center', marginBottom: 40 },
  brandAr: { fontSize: 22, fontWeight: '700', color: colors.brandDark },
  brandEn: { fontSize: 12, color: colors.muted, marginTop: 4, letterSpacing: 1 },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 20, color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, marginBottom: 12, backgroundColor: '#fff' },
  button: { backgroundColor: colors.brand, borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
