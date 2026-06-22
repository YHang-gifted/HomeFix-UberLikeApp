import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { TokenStore } from '../../app/src/auth/session';

const TOKEN_KEY = 'homefix.authToken';

// Web: SecureStore is unavailable, fall back to localStorage.
const webStore: TokenStore = {
  get: () =>
    Promise.resolve(typeof localStorage === 'undefined' ? null : localStorage.getItem(TOKEN_KEY)),
  set: (token) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, token);
    }
    return Promise.resolve();
  },
  clear: () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
    }
    return Promise.resolve();
  },
};

// Native: encrypted device keychain/keystore via expo-secure-store.
const secureStore: TokenStore = {
  get: () => SecureStore.getItemAsync(TOKEN_KEY),
  set: (token) => SecureStore.setItemAsync(TOKEN_KEY, token),
  clear: () => SecureStore.deleteItemAsync(TOKEN_KEY),
};

export const tokenStore: TokenStore = Platform.OS === 'web' ? webStore : secureStore;
