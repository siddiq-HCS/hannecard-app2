import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const isWeb = Platform.OS === 'web';
const WEB_TOKEN_KEY = 'mobile_token';
const WEB_USER_KEY = 'mobile_user';

function storageKey(key: string): string {
  if (!isWeb) return key;
  return key === 'token' ? WEB_TOKEN_KEY : key === 'user' ? WEB_USER_KEY : key;
}

export const authStorage = {
  async getItem(key: string): Promise<string | null> {
    if (isWeb) return globalThis.localStorage?.getItem(storageKey(key)) ?? null;
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (isWeb) {
      try {
        globalThis.localStorage?.setItem(storageKey(key), value);
      } catch {
        // Keep the in-memory session usable if browser storage is unavailable.
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async deleteItem(key: string): Promise<void> {
    if (isWeb) {
      try {
        globalThis.localStorage?.removeItem(storageKey(key));
      } catch {
        // Ignore unavailable browser storage during logout.
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
  async clear(): Promise<void> {
    await Promise.all([this.deleteItem('token'), this.deleteItem('user')]);
  },
};