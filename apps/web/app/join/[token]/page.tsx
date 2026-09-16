'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { isAxiosError } from 'axios';
import { ArrowRight, Lock, Users } from 'lucide-react';
import { Logo } from '../../../components/Logo';
import { api } from '../../../lib/api';
import { establishSession } from '../../../lib/authSession';

interface InvitationView {
  email: string;
  expiresAt: string;
  workspace: { name: string; slug: string };
}

export default function JoinWorkspacePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params.token;
  const [invitation, setInvitation] = useState<InvitationView | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get(`/auth/invitations/${encodeURIComponent(token)}`)
      .then(({ data }) => {
        if (active) setInvitation(data.invitation);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        const message = isAxiosError<{ error?: string }>(requestError) ? requestError.response?.data?.error : undefined;
        setError(message || 'Impossible de vérifier cette invitation');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [token]);

  async function acceptInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invitation) return;
    setError('');
    setSubmitting(true);
    try {
      const { data } = await api.post(`/auth/invitations/${encodeURIComponent(token)}/accept`, { name, password });
      establishSession(data.user, data.accessToken);
      router.replace(`/workspace/${data.workspace.slug}`);
    } catch (requestError: unknown) {
      const message = isAxiosError<{ error?: string }>(requestError) ? requestError.response?.data?.error : undefined;
      setError(message || 'Impossible d’accepter cette invitation');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-warm-white px-5 py-12 text-hive-700">
      <div aria-hidden className="absolute inset-0 opacity-60 [background-image:linear-gradient(#E8E4DB_1px,transparent_1px),linear-gradient(90deg,#E8E4DB_1px,transparent_1px)] [background-size:32px_32px]" />
      <section className="relative w-full max-w-lg border-[3px] border-hive-700 bg-white p-7 shadow-[8px_8px_0_#FFC500] sm:p-10">
        <Logo size={31} />
        {loading ? (
          <p className="mt-10 font-mono text-sm text-hive-500">Vérification de l’invitation…</p>
        ) : invitation ? (
          <>
            <div className="mt-9 inline-flex items-center gap-2 border border-honey-300 bg-honey-50 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-honey-800">
              <Users size={14} /> Invitation d’équipe
            </div>
            <h1 className="mt-5 font-display text-4xl font-extrabold leading-tight tracking-tight text-hive-800">Rejoins {invitation.workspace.name}</h1>
            <p className="mt-3 text-sm leading-6 text-hive-500">Ton accès est réservé à <strong className="text-hive-700">{invitation.email}</strong>.</p>

            <form onSubmit={acceptInvitation} className="mt-8 space-y-4">
              <label className="block text-sm font-medium text-hive-600">
                Ton nom
                <input autoComplete="name" required minLength={2} maxLength={60} value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-warm-200 bg-warm-50 px-3.5 py-3 text-hive-700 outline-none focus:border-honey" placeholder="Camille Martin" />
              </label>
              <label className="block text-sm font-medium text-hive-600">
                Mot de passe
                <input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full rounded-lg border border-warm-200 bg-warm-50 px-3.5 py-3 text-hive-700 outline-none focus:border-honey" placeholder="12 caractères minimum" />
              </label>
              <p className="flex gap-2 text-xs leading-5 text-hive-400"><Lock size={14} className="mt-0.5 shrink-0" /> Si tu as déjà un compte NestWork, utilise son mot de passe actuel.</p>
              {error && <p role="alert" className="rounded-lg bg-error-50 p-3 text-sm text-error-700">{error}</p>}
              <button disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-lg bg-honey px-4 py-3 font-semibold text-hive-800 transition-colors hover:bg-honey-400 disabled:opacity-50">
                {submitting ? 'Ouverture de l’espace…' : <>Rejoindre l’équipe <ArrowRight size={18} /></>}
              </button>
            </form>
          </>
        ) : (
          <div className="mt-10">
            <h1 className="font-display text-3xl font-extrabold text-hive-800">Cette invitation n’est plus disponible.</h1>
            <p className="mt-3 text-sm leading-6 text-hive-500">Elle a peut-être expiré, été révoquée ou déjà utilisée. Demande un nouveau lien à l’administrateur de ton espace.</p>
            {error && <p role="alert" className="mt-4 text-sm text-error-700">{error}</p>}
          </div>
        )}
      </section>
    </main>
  );
}
