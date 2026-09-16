import axios from 'axios';
import { useAuthStore } from '../stores/auth';
import { refreshAccessToken } from './authSession';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // send the HttpOnly refresh cookie on /auth/* calls
});

/**
 * Resolve an image reference stored on a message or map template.
 *
 * The server hands back a root-relative "/api/images/<id>" — which would resolve
 * against the web origin, not the API's — so it needs the API base prepended.
 * Legacy rows still carrying an inline base64 data URL are passed through
 * untouched, so both shapes render while old content is around.
 */
export function imageSrc(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('/api/')) return API_URL + url;
  return url;
}

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Single in-flight refresh shared by the 401 interceptor AND the proactive
// timer — concurrent refreshes would replay the same rotating refresh token and
// trip the server's reuse detection (which revokes the whole session).
export { refreshAccessToken } from './authSession';

// Auto-refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const isAuthEndpoint = typeof original?.url === 'string' && original.url.startsWith('/auth/');
    if (error.response?.status === 401 && original && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
    }
    return Promise.reject(error);
  },
);
