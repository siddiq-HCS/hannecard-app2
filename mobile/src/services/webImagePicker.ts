import { Platform } from 'react-native';

export interface PickedImage {
  uri: string;
  mimeType?: string;
  name?: string;
  /** البيانات كـ base64 لرفعها على الويب بدون الاعتماد على كائن الـ File */
  base64?: string;
}

/**
 * اختيار صورة بشكل متوافق مع iOS Safari على الويب.
 *
 * على الويب يستخدم <input type="file" accept="image/*"> (الذي يفتح المعرض أو الكاميرا
 * في الآيفون مباشرة) ثم يقرأ الصورة كـ base64 بيانات URL يمكن رفعها عبر FormData.
 * على الأجهزة المحمولة (iOS/Android) يستخدم expo-image-picker (المعرض).
 *
 * @param multiple هل يسمح باختيار أكثر من صورة
 */
/**
 * اختيار عدة مستندات على الويب (Chrome/Safari) عبر <input type="file">
 * وقراءتها كـ base64 data URL لرفعها عبر FormData بشكل موثوق (بدون الاعتماد
 * على كائن {uri,name,type} غير المدعوم في react-native-web).
 */
export async function pickWebDocs(accept: string, multiple = true): Promise<PickedImage[]> {
  if (Platform.OS !== 'web') return [];

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';

    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      const out: PickedImage[] = [];
      let pending = files.length;
      if (pending === 0) return resolve(out);

      files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result ?? '');
          out.push({ uri: dataUrl, mimeType: file.type || 'application/octet-stream', name: file.name || 'file', base64: dataUrl });
          pending -= 1;
          if (pending === 0) resolve(out);
        };
        reader.onerror = () => {
          pending -= 1;
          if (pending === 0) resolve(out);
        };
        reader.readAsDataURL(file);
      });
    };

    input.oncancel = () => resolve([]);
    (document.body ?? document.documentElement).appendChild(input);
    input.click();
    setTimeout(() => input.remove(), 60000);
  });
}

export async function pickWebImages(multiple: boolean): Promise<PickedImage[]> {
  if (Platform.OS !== 'web') return [];

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = multiple;
    input.style.display = 'none';

    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      const out: PickedImage[] = [];
      let pending = files.length;

      if (pending === 0) {
        resolve(out);
        return;
      }

      files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result ?? '');
          out.push({
            uri: dataUrl,
            mimeType: file.type || 'image/jpeg',
            name: file.name || 'photo.jpg',
            base64: dataUrl,
          });
          pending -= 1;
          if (pending === 0) resolve(out);
        };
        reader.onerror = () => {
          pending -= 1;
          if (pending === 0) resolve(out);
        };
        reader.readAsDataURL(file);
      });
    };

    input.oncancel = () => resolve([]);
    // استدعاء النقر بعد ملحقته بالـ DOM لضمان عمله في جميع المتصفحات
    (document.body ?? document.documentElement).appendChild(input);
    input.click();
    // إزالة العنصر بعد الفتح (آمن بعد مهلة قصيرة)
    setTimeout(() => input.remove(), 60000);
  });
}

/**
 * إضافة ملف (صورة أو مستند) على الويب إلى FormData كـ Blob حقيقي.
 * على react-native-web لا يتحوّل كائن {uri,name,type} إلى File حقيقي، لذا نعتمد
 * على قراءة الملف كـ base64 (عبر FileReader) ثم نحوّله إلى Blob بواسطة
 * dataUrlToBlob ليعمل الرفع بشكل موثوق في Chrome/Safari.
 *
 * @param form  كائن FormData الهدف.
 * @param field اسم الحقل (image / images / file).
 * @param item  عنصر مختار يحمل uri (قد يكون base64 data URL على الويب).
 * @param fallbackName اسم احتياطي للملف.
 * @returns true إذا أُرفق الملف فعلياً (Blob نجح تحويله).
 */
export function appendFileToForm(dataUrl: string, mimeType: string | undefined, name: string, field: string, form: FormData): boolean {
  try {
    const blob = dataUrl && dataUrl.startsWith('data:') ? dataUrlToBlob(dataUrl) : null;
    if (!blob) return false;
    form.append(field, blob, name || 'file');
    return true;
  } catch {
    return false;
  }
}

/** تحويل base64 إلى Blob للرفع عبر FormData على الويب */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const [meta, rest] = dataUrl.split(',');
    const mime = /data:([^;]+)/.exec(meta)?.[1] ?? 'image/jpeg';
    const binary = atob(rest);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

/** هل نقوم حالياً بعملية رفع على الويب */
export const isWeb = Platform.OS === 'web';