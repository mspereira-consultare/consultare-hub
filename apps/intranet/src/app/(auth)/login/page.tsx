import { Suspense } from 'react';
import LoginForm from './login-form';

export default function IntranetLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f7fb] px-6 py-10">
      <Suspense fallback={<div className="text-sm text-slate-600">Carregando login...</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
