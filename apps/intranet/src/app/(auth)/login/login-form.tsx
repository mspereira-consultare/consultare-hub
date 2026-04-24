'use client';

import { FormEvent, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Loader2, LogIn } from 'lucide-react';

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const callbackUrl = searchParams.get('callbackUrl') || '/';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
      callbackUrl,
    });

    setLoading(false);

    if (result?.error) {
      if (result.error === 'AUTH_CONFIG_ERROR') {
        setError('Falha na configuracao da intranet. Verifique as variaveis de banco/autenticacao no Railway.');
        return;
      }

      setError('E-mail ou senha invalidos.');
      return;
    }

    router.push(result?.url || callbackUrl);
    router.refresh();
  };

  return (
    <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-7 shadow-sm">
      <div className="mb-7 flex items-center gap-3 text-[#17407E]">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-blue-50">
          <Lock size={22} />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#229A8A]">Consultare</p>
          <h1 className="text-2xl font-semibold text-slate-900">Intranet</h1>
        </div>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">E-mail</span>
          <input
            className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            autoComplete="email"
            required
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Senha</span>
          <input
            className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            required
          />
        </label>

        {error ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-[#17407E] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#053F74] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
          Entrar
        </button>
      </form>
    </section>
  );
}
