import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { registerForPushNotifications } from '@/services/notifications';
import { I18nProvider } from '@/i18n';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { AutoCheckin } from '@/components/AutoCheckin';
import { useEffect } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';

// بوابة تحميل الجلسة: لا نعرض أي شاشة حتى تنتهي قراءة التخزين، لمنع وميض/شاشة بيضاء
function SessionGate({ children }: { children: React.ReactNode }) {
  const { ready } = useAuth();
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#f59e0b" />
      </View>
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  useEffect(() => {
    // غير مهم على الويب: نقوم بذلك داخل login() بشكل محمي بـ try/catch
    if (Platform.OS !== 'web') {
      void registerForPushNotifications().catch(() => {});
    }
  }, []);

  return (
    <AppErrorBoundary>
      <I18nProvider>
        <AuthProvider>
          <SessionGate>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0f172a' } }}>
              <Stack.Screen name="login" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="conversation/[id]" />
            </Stack>
            <AutoCheckin />
            <StatusBar style="light" />
          </SessionGate>
        </AuthProvider>
      </I18nProvider>
    </AppErrorBoundary>
  );
}
