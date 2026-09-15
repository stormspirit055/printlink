import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { api, type User } from '../api';
import { queryClient } from '../app/query-client';

export const AUTH_KEY = ['me'] as const;
const fetchMe = () => api<{ user: User | null }>('/api/me');

/**
 * Shared authentication state. Vue Query dedupes by `AUTH_KEY`, so every
 * component calling `useAuth()` reads the same cached user. The router guard
 * primes the cache via `ensureAuth()` before any protected route renders.
 */
export function useAuth() {
  const meQuery = useQuery({ queryKey: AUTH_KEY, queryFn: fetchMe });
  const user = computed(() => meQuery.data.value?.user ?? null);

  async function requestCode(phone: string) {
    return api<{ devCode?: string; message: string }>('/api/auth/code', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  }

  async function login(body: { phone: string; code: string; inviteCode?: string }) {
    await api('/api/auth/login', { method: 'POST', body: JSON.stringify(body) });
    await meQuery.refetch();
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST', body: '{}' });
    await queryClient.invalidateQueries({ queryKey: AUTH_KEY });
    await queryClient.removeQueries({ queryKey: AUTH_KEY });
    await meQuery.refetch();
  }

  async function updateProfile(body: { nickname: string; wechatId: string; bio: string }) {
    await api('/api/me', { method: 'PUT', body: JSON.stringify(body) });
    await meQuery.refetch();
  }

  return { meQuery, user, requestCode, login, logout, updateProfile };
}

/** Prime the auth cache from outside setup (router guard). Returns the user or null. */
export async function ensureAuth(): Promise<User | null> {
  const data = await queryClient.fetchQuery({ queryKey: AUTH_KEY, queryFn: fetchMe });
  return data.user ?? null;
}
