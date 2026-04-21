import Link from 'next/link';

export default function AjudaNotFound() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-lg font-semibold text-slate-900">Documento não encontrado</h1>
      <p className="mt-2 text-sm text-slate-600">
        O documento solicitado não existe ou você não tem permissão para acessá-lo.
      </p>
      <div className="mt-6">
        <Link
          href="/ajuda/readme"
          className="inline-flex items-center rounded-lg bg-consultare-teal px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
        >
          Voltar para a Ajuda
        </Link>
      </div>
    </div>
  );
}
