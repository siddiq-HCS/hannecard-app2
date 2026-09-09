import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { translations, type Lang, type TKey } from './translations';

const isWeb = Platform.OS === 'web';

async function readLang(): Promise<Lang> {
  try {
    if (isWeb) return (globalThis.localStorage?.getItem('appLang') as Lang) || 'ar';
    const v = await SecureStore.getItemAsync('appLang');
    return (v as Lang) || 'ar';
  } catch {
    return 'ar';
  }
}

async function writeLang(lang: Lang): Promise<void> {
  try {
    if (isWeb) {
      globalThis.localStorage?.setItem('appLang', lang);
      return;
    }
    await SecureStore.setItemAsync('appLang', lang);
  } catch {
    // تجاهل أخطاء التخزين
  }
}

function resolve(dict: unknown, path: string): string | undefined {
  let cur: unknown = dict;
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

type Translate = (key: TKey | (string & {})) => string;

interface I18nState {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Translate;
}

const I18nContext = createContext<I18nState>(null as unknown as I18nState);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('ar');

  useEffect(() => {
    void readLang().then(setLangState);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    void writeLang(l);
  }, []);

  const t = useCallback<Translate>(
    (key) => resolve(translations[lang], key) ?? resolve(translations.ar, key) ?? key,
    [lang],
  );

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
