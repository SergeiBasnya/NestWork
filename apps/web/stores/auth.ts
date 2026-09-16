'use client';

import { create } from 'zustand';
import { clearCache } from '../lib/cache';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  character: string | null;
  status: string;
}

export type AuthStatus = 'bootstrapping' | 'authenticated' | 'anonymous' | 'unavailable';

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  accessToken: string | null;
  setAuth: (user: AuthUser, accessToken: string) => void;
  setAccessToken: (accessToken: string) => void;
  setUnavailable: () => void;
  setAnonymous: () => void;
  setCharacter: (character: string) => void;
  setName: (name: string) => void;
}

// Both tokens stay out of Web Storage: refresh is an HttpOnly cookie and access
// is memory-only. A reload always proves the session through refresh + /me.
export const useAuthStore = create<AuthState>()((set) => ({
  status: 'bootstrapping',
  user: null,
  accessToken: null,
  setAuth: (user, accessToken) => set({ status: 'authenticated', user, accessToken }),
  setAccessToken: (accessToken) => set((state) => ({
    accessToken,
    status: state.user ? 'authenticated' : state.status,
  })),
  setUnavailable: () => set({ status: 'unavailable' }),
  setAnonymous: () => {
    clearCache();
    set({ status: 'anonymous', user: null, accessToken: null });
  },
  setCharacter: (character) => set((s) => (s.user ? { user: { ...s.user, character } } : {})),
  setName: (name) => set((s) => (s.user ? { user: { ...s.user, name } } : {})),
}));
