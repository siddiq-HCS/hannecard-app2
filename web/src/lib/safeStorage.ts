// خزن web الآمن مع احتياطي تلقائي في الذاكرة (In-Memory Fallback).
// أي فشل/حظر/امتلاء في window.localStorage (وضع خاص، إعدادات أمان، Quota...) لا يُسقط التطبيق؛
// نستخدم نسخة داخل الذاكرة للجلسة الحالية حتى يتوفّر تخزين دائم.

const memory = new Map<string, string>();

function localStorageUsable(): boolean {
  try {
    const probe = '__safeStorage_test__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

let usable = localStorageUsable();

export function storageGet(key: string): string | null {
  if (usable) {
    try {
      const v = window.localStorage.getItem(key);
      if (v !== null) return v;
    } catch {
      usable = false;
    }
  }
  return memory.has(key) ? (memory.get(key) as string) : null;
}

export function storageSet(key: string, value: string): void {
  if (usable) {
    try {
      window.localStorage.setItem(key, value);
      return;
    } catch {
      usable = false;
    }
  }
  memory.set(key, value);
}

export function storageRemove(key: string): void {
  if (usable) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      usable = false;
    }
  }
  memory.delete(key);
}

export function storageClear(): void {
  if (usable) {
    try {
      window.localStorage.clear();
    } catch {
      usable = false;
    }
  }
  memory.clear();
}
