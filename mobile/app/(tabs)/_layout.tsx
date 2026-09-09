import { Tabs, Redirect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { Text, View, StyleSheet } from 'react-native';

const TabIcon = ({ emoji, focused }: { emoji: string; focused: boolean }) => (
  <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
  </View>
);

export default function TabsLayout() {
  const { token, user } = useAuth();
  const { t } = useI18n();

  // لا يمكن الوصول لأي شاشة داخل التبويبات إلا بعد تسجيل الدخول
  // تطبيق الجوال مخصص للمناديب (REPRESENTATIVE) فقط — أي دور آخر يُعاد لصفحة الدخول
  if (!token || user?.role !== 'REPRESENTATIVE') return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#f59e0b',
        tabBarInactiveTintColor: '#64748b',
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.attendance'),
          tabBarIcon: ({ focused }) => <TabIcon emoji="🕐" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="rfq"
        options={{
          title: t('tabs.rfq'),
          tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: t('tabs.reports'),
          tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('tabs.messages'),
          tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 8,
    left: 12,
    right: 12,
    height: 64,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderRadius: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.08)',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    paddingBottom: 4,
    paddingTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.08)',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 12,
  },
  iconWrapActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
});
