import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Linking,
} from 'react-native';
import axios from 'axios';
import { useRouter, Redirect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { getCurrentPosition } from '@/services/location';
import { Logo } from '@/components/Logo';

export default function LoginScreen() {
  const { login, token, user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // إذا كان المندوب مسجلاً بالفعل → تجاوز شاشة الدخول مباشرة إلى "حسابي"
  if (token && user?.role === 'REPRESENTATIVE') return <Redirect href="/profile" />;

  // حساب المدير (دور غير مندوب) على نسخة الويب → تحويل تلقائي للوحة الإدارية
  useEffect(() => {
    if (token && user && user.role !== 'REPRESENTATIVE') {
      if (Platform.OS === 'web') {
        globalThis.location?.replace('/');
      } else {
        Alert.alert(t('login.alertTitle'), t('login.mobileNotAllowed'));
      }
    }
  }, [token, user, t]);

  async function onLogin() {
    // حماية إضافية ضد إعادة الإرسال أثناء المعالجة
    if (loading) return;
    if (!email || !password) return Alert.alert(t('login.alertTitle'), t('login.alertHint'));
    setLoading(true);
    try {
      const coords = await getCurrentPosition();
      await login(email, password, coords ?? undefined);
      router.replace('/profile');
    } catch (err) {
      const code = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error;
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      if (code === 'mobile_not_allowed' || (err as Error).message === 'MOBILE_NOT_ALLOWED') {
        Alert.alert(t('login.alertTitle'), msg ?? t('login.mobileNotAllowed'), [
          { text: t('common.cancel') },
          { text: t('login.openAdmin'), onPress: () => void Linking.openURL(t('login.adminUrl')) },
        ]);
      } else {
        Alert.alert(t('login.failed'), t('login.failedHint'));
      }
    } finally {
      // ضمان عدم بقاء الزر معطلاً (disabled) مهما كانت نهاية العملية
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        bounces={false}
        keyboardDismissMode="on-drag"
      >
        <View style={styles.card}>
          <View style={styles.logoWrap}>
            <Logo size={Platform.OS === 'web' ? 96 : 84} />
          </View>
          <Text style={styles.title}>{t('login.title')}</Text>
          <Text style={styles.subtitle}>{t('appName')}</Text>
          <TextInput
            style={[styles.input, isWeb && styles.inputWeb]}
            placeholder={t('login.email')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            textContentType="emailAddress"
            autoComplete="email"
            placeholderTextColor="#94a3b8"
          />
          <TextInput
            style={[styles.input, isWeb && styles.inputWeb]}
            placeholder={t('login.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={() => void onLogin()}
            placeholderTextColor="#94a3b8"
          />
          <Pressable
            style={({ pressed }) => [styles.button, isWeb && styles.buttonWeb, pressed && !loading && styles.buttonPressed]}
            onPress={() => void onLogin()}
            disabled={loading}
            accessibilityRole="button"
            accessibilityState={{ disabled: loading, busy: loading }}
          >
            <Text style={styles.buttonText}>{loading ? t('login.loading') : t('login.submit')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const isWeb = Platform.OS === 'web';

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: isWeb ? 32 : 24,
    // على الويب نوسّط الحاوي وأقصى عرض موضوعي للشاشات الكبيرة
    ...(isWeb ? { alignItems: 'center' } : {}),
  },
  card: {
    width: '100%',
    ...(isWeb ? { maxWidth: 420 } : {}),
    ...(isWeb
      ? {
          backgroundColor: '#fff',
          borderRadius: 16,
          borderWidth: 1,
          borderColor: '#e2e8f0',
          padding: 36,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.06,
          shadowRadius: 24,
          elevation: 4,
        }
      : {}),
  },
  logoWrap: { alignItems: 'center', marginBottom: 18 },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center', marginBottom: 4, color: '#0f172a' },
  subtitle: { fontSize: 15, color: '#64748b', textAlign: 'center', marginBottom: 28 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 14, marginBottom: 14, fontSize: 16, color: '#0f172a', backgroundColor: '#f8fafc' },
  inputWeb: { padding: 16, fontSize: 15 },
  button: { backgroundColor: '#2563eb', borderRadius: 10, padding: 15, alignItems: 'center' },
  buttonWeb: { padding: 16, borderRadius: 10, marginTop: 4 },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});