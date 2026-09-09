import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import type { Lang } from '@/i18n/translations';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const initials = user?.name?.slice(0, 2) || '??';

  async function onLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <View style={s.container}>
      <View style={s.scroll}>
        {/* Avatar */}
        <View style={s.avatarRing}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
        </View>
        <Text style={s.name}>{user?.name}</Text>
        <Text style={s.phone}>{user?.phone}</Text>

        {/* Info Card */}
        <View style={s.card}>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>{t('profile.name')}</Text>
            <Text style={s.infoValue}>{user?.name}</Text>
          </View>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>{t('profile.phone')}</Text>
            <Text style={s.infoValue}>{user?.phone}</Text>
          </View>
        </View>

        {/* Language */}
        <Text style={s.sectionTitle}>{t('profile.language')}</Text>
        <View style={s.langRow}>
          {(['ar', 'en'] as Lang[]).map((l) => (
            <Pressable
              key={l}
              onPress={() => setLang(l)}
              style={[s.langBtn, lang === l && s.langBtnActive]}
            >
              <Text style={[s.langText, lang === l && s.langTextActive]}>
                {l === 'ar' ? t('profile.arabic') : t('profile.english')}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Logout */}
        <Pressable style={s.logoutBtn} onPress={() => void onLogout()}>
          <Text style={s.logoutText}>{t('profile.logout')}</Text>
        </Pressable>
      </View>

      {/* Spacer for tab bar */}
      <View style={{ height: 100 }} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  scroll: { paddingHorizontal: 24, paddingTop: 60, alignItems: 'center' },

  avatarRing: {
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 2, borderColor: '#f59e0b',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#f59e0b', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 30, fontWeight: '800', color: '#f59e0b' },
  name: { fontSize: 22, fontWeight: '800', color: '#f8fafc', marginTop: 16 },
  phone: { fontSize: 14, color: '#64748b', marginTop: 4 },

  card: {
    width: '100%', backgroundColor: 'rgba(30, 41, 59, 0.4)',
    borderRadius: 20, padding: 20, marginTop: 24,
    borderWidth: 1, borderColor: 'rgba(148, 163, 184, 0.08)',
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(148, 163, 184, 0.1)',
  },
  infoLabel: { fontSize: 14, color: '#64748b' },
  infoValue: { fontSize: 14, fontWeight: '600', color: '#e2e8f0' },

  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#94a3b8', alignSelf: 'flex-start', marginTop: 24, marginBottom: 10 },
  langRow: { flexDirection: 'row', gap: 10, alignSelf: 'flex-start' },
  langBtn: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12,
    backgroundColor: 'rgba(30, 41, 59, 0.5)', borderWidth: 1, borderColor: 'rgba(148, 163, 184, 0.08)',
  },
  langBtnActive: { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: '#f59e0b' },
  langText: { color: '#94a3b8', fontWeight: '600', fontSize: 14 },
  langTextActive: { color: '#f59e0b' },

  logoutBtn: {
    width: '100%', borderRadius: 14, paddingVertical: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.12)', borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)', alignItems: 'center', marginTop: 32,
  },
  logoutText: { color: '#ef4444', fontWeight: '700', fontSize: 16 },
});
