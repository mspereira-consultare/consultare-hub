"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { signIn } from 'next-auth/react'; 
import Image from 'next/image';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Chama o NextAuth para autenticar (validando no Turso)
      const result = await signIn('credentials', {
        redirect: false,
        email,
        password,
      });

      if (result?.error) {
        setError("E-mail ou senha incorretos.");
        setLoading(false);
        return;
      }

      // Sucesso: Redireciona para o dashboard
      router.push('/dashboard');
      router.refresh(); 

    } catch (err) {
      setError("Erro ao conectar com o servidor.");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-sm space-y-6 bg-white p-8 shadow-md rounded-lg">
        
        <div className="text-center">
          {/* Logo ajustado para h-24 (aprox. 96px) */}
          <Image
            src="/logo-color.png"
            alt="Logo Consultare"
            width={256}
            height={128}
            priority
            className="mx-auto h-32 w-auto mb-4"
          />
          <h2 className="text-2xl font-bold text-gray-900">Acesso ao Painel</h2>
          <p className="mt-1 text-sm text-gray-500">Insira suas credenciais para continuar</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
            
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 text-center border border-red-200">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="email@consultare.com.br"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Senha</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-gray-300 p-2 pr-10 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="********"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-blue-700"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full rounded-md px-4 py-2 text-white transition font-medium ${
              loading 
                ? 'bg-blue-400 cursor-not-allowed' 
                : 'bg-blue-900 hover:bg-blue-800'
            }`}
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}