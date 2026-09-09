import * as Location from 'expo-location';
import { Platform } from 'react-native';

export interface Coords {
  lat: number;
  lng: number;
  accuracy?: number;
}

// مهلة قصوى لطلب الموقع حتى لا يعلّق تسجيل الدخول على المتصفح/الويب
// إذا تأخر طلب الإذن أو تحديد الموقع (مثل رفض المستخدم الإذن أو إبطاء تتبع الموقع).
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * الحصول على الموقع الحالي بدقة مقبولة.
 * يُستدعى قبل أي طلب لإرفاق الإحداثيات (متطلب النظام: GPS مع كل حركة).
 * على الويب نضيف مهلة حتى لا يعطّل تسجيل الدخول.
 */
export async function getCurrentPosition(): Promise<Coords | null> {
  let lastKnown: Coords | null = null;
  try {
    // محاولة الحصول على آخر موقع معروف كاحتياط (لا يتطلب إذناً فورياً دائماً)
    const lk = await Location.getLastKnownPositionAsync();
    if (lk) {
      lastKnown = {
        lat: lk.coords.latitude,
        lng: lk.coords.longitude,
        accuracy: lk.coords.accuracy ?? undefined,
      };
    }
  } catch {
    /* ignore */
  }

  try {
    const timeoutMs = Platform.OS === 'web' ? 4000 : 15000;
    const { status } = await withTimeout(
      Location.requestForegroundPermissionsAsync(),
      timeoutMs,
    );
    if (status !== 'granted') {
      // لا إذن: نُعيد آخر موقع معروف إن وُجد حتى لا نمنع تسجيل الدخول/الحضور بلا داعٍ
      return lastKnown;
    }
    const pos = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      timeoutMs,
    );
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? undefined,
    };
  } catch {
    // فشل تحديد الموقع أو مهلة: نُعيد آخر موقع معروف كاحتياط
    return lastKnown;
  }
}
