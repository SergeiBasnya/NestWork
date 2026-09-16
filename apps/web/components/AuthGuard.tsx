'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../stores/auth';
import { bootstrapSession } from '../lib/authSession';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace('/login');
    }
  }, [status, router]);

  if (status === 'unavailable') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center">
        <div className="font-pixel text-honey-700">Service momentanément indisponible</div>
        <p className="text-sm text-[var(--color-text-secondary)]">Votre session n’a pas été supprimée. Réessayez lorsque la connexion revient.</p>
        <button type="button" onClick={() => void bootstrapSession()} className="rounded-lg bg-honey px-4 py-2 font-semibold text-hive-800">Réessayer</button>
      </div>
    );
  }

  if (status !== 'authenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="font-pixel text-honey-700">Chargement...</div>
      </div>
    );
  }

  return <>{children}</>;
}
