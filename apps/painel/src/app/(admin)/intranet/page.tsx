import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ExternalLink } from 'lucide-react';

const getIntranetUrl = () =>
  String(
    process.env.INTRANET_PUBLIC_URL ||
      process.env.NEXT_PUBLIC_INTRANET_URL ||
      'https://intranet.consultare.com.br'
  ).trim();

export default function OpenIntranetPage() {
  const intranetUrl = getIntranetUrl();
  if (intranetUrl) redirect(intranetUrl);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <section className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md bg-blue-50 text-[#17407E]">
          <ExternalLink size={22} />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#229A8A]">Intranet Consultare</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Abrir intranet</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Configure a URL publica da intranet em `INTRANET_PUBLIC_URL` ou `NEXT_PUBLIC_INTRANET_URL`
          para que este atalho abra o app separado da intranet.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex rounded-md bg-[#17407E] px-4 py-2.5 text-sm font-semibold text-white"
        >
          Voltar ao painel
        </Link>
      </section>
    </main>
  );
}
