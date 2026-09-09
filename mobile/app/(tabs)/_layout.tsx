import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'الرئيسية' }} />
      <Tabs.Screen name="attendance" options={{ title: 'الحضور' }} />
      <Tabs.Screen name="clients" options={{ title: 'العملاء' }} />
      <Tabs.Screen name="quotations" options={{ title: 'عروض الأسعار' }} />
      <Tabs.Screen name="profile" options={{ title: 'حسابي' }} />
    </Tabs>
  );
}
