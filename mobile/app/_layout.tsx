import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/context/AuthContext';
import { useEffect } from 'react';
import { initDb } from '@/db/store';

export default function RootLayout() {
  useEffect(() => {
    void initDb().catch((e) => console.warn('db init failed', e));
  }, []);

  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="client/new" options={{ presentation: 'modal', title: 'عميل جديد' }} />
        <Stack.Screen name="roller/new" options={{ presentation: 'modal', title: 'مواصفات الأسطوانة' }} />
        <Stack.Screen name="quotation/new" options={{ presentation: 'modal', title: 'عرض سعر جديد' }} />
        <Stack.Screen name="quotation/[id]" options={{ title: 'تفاصيل العرض' }} />
      </Stack>
      <StatusBar style="auto" />
    </AuthProvider>
  );
}
