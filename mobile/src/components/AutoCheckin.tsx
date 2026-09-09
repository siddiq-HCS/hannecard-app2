import { useEffect, useRef, useState } from 'react';
import { AppState, Animated, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { autoCheckin } from '@/services/attendance';

// تسجيل الحضور التلقائي عند فتح التطبيق أول مرة في اليوم:
// يعمل في الخلفية (Silent) دون إيقاف المندوب عن أي شاشة؛ يُظهر إشعاراً سريعاً أعلى
// الشاشة عند النجاح فقط، ويعيد المحاولة بأمان عند عودة الشبكة/التطبيق للمقدمة.
export function AutoCheckin() {
  const { token, user } = useAuth();
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  // منع التكرار خلال الجلسة: يتوقف التحقق نهائياً بعد النجاح (أو وجد أنه مسجّل/منصرف)
  const doneRef = useRef(false);

  const isRep = user?.role === 'REPRESENTATIVE';

  useEffect(() => {
    if (!token || !isRep) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      if (cancelled || doneRef.current) return;
      const result = await autoCheckin(token, isRep);
      if (cancelled) return;
      if (result === 'failed') return; // نُعيد المحاولة عند أول تفاعل/عودة للمقدمة
      doneRef.current = true;
      if (result !== 'checked_in') return;
      // إشعار سريع غير مزعج يؤكد للمندوب اكتمال الحضور التلقائي
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      setVisible(true);
      timer = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(({ finished }) => {
          if (finished) setVisible(false);
        });
      }, 3500);
    };

    // إعادة المحاولة عند عودة التطبيق للمقدمة، أو كل دقيقة بهدوء (Network/موقع) حتى النجاح
    const onState = (state: string) => {
      if (state === 'active') void run();
    };
    const sub = AppState.addEventListener('change', onState);
    const retry = setInterval(() => void run(), 60 * 1000);

    void run();
    return () => {
      cancelled = true;
      clearInterval(retry);
      if (timer) clearTimeout(timer);
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isRep]);

  if (!visible) return null;
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Animated.View style={[styles.banner, { opacity }]}>
        <Text style={styles.text}>{t('attendance.autoCheckedIn')}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
    paddingTop: 48,
  },
  banner: {
    backgroundColor: '#16a34a',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    marginHorizontal: 16,
    maxWidth: 420,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  text: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});