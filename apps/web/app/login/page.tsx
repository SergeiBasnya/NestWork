'use client';

import { Suspense, useEffect, useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/auth';
import { Logo } from '../../components/Logo';
import { internalRedirect } from '../../lib/internalRedirect';
import { isAxiosError } from 'axios';
import { establishSession } from '../../lib/authSession';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = internalRedirect(searchParams.get('redirect'));
  const status = useAuthStore((s) => s.status);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Already signed in → skip the form (e.g. opened /login while a session is live).
  useEffect(() => {
    if (status === 'authenticated') router.replace(redirect);
  }, [status, redirect, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await api.post('/auth/login', { email, password });
      establishSession(data.user, data.accessToken);
      router.push(redirect);
    } catch (err: unknown) {
      const apiError = isAxiosError<{ error?: string }>(err) ? err.response?.data?.error : undefined;
      setError(apiError || 'Echec de la connexion');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md space-y-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-secondary)] p-8">
      <div className="flex flex-col items-center text-center">
        <Logo size={34} />
        <p className="mt-3 text-[var(--color-text-secondary)]">Connectez-vous à votre espace</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {status === 'unavailable' && !error && (
          <div className="rounded-lg bg-honey/10 p-3 text-sm text-hive-700">Le serveur est momentanément indisponible. Vous pouvez réessayer.</div>
        )}
        {error && (
          <div className="rounded-lg bg-red/10 p-3 text-sm text-red">{error}</div>
        )}

        <div>
          <label htmlFor="email" className="mb-1 block text-sm text-[var(--color-text-secondary)]">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-4 py-2.5 text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] outline-none transition-colors focus:border-honey"
            placeholder="vous@entreprise.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-sm text-[var(--color-text-secondary)]">
            Mot de passe
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-4 py-2.5 text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] outline-none transition-colors focus:border-honey"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-honey py-2.5 font-semibold text-hive-800 transition-colors hover:bg-honey-400 disabled:opacity-50"
        >
          {loading ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-surface)]">
      <Suspense fallback={<div className="font-pixel text-honey-700">Chargement...</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
