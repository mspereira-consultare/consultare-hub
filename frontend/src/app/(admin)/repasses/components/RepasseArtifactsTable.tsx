'use client';

import { Download, Eye, Loader2 } from 'lucide-react';

type Artifact = {
  id: string;
  pdfJobId: string;
  periodRef: string;
  professionalId: string;
  professionalName: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
};

type RepasseArtifactsTableProps = {
  items: Artifact[];
  loading: boolean;
};

const toBrDateTime = (value: string | null | undefined) => {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString('pt-BR');
};

const formatSize = (bytes: number) => {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
};

export function RepasseArtifactsTable({ items, loading }: RepasseArtifactsTableProps) {
  return (
    <section className="rounded-xl border bg-white">
      <header className="border-b bg-slate-50 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
          PDFs gerados
        </h3>
      </header>
      <div className="max-h-[320px] overflow-auto">
        <table className="w-full min-w-[920px] text-xs">
          <thead className="sticky top-0 z-10 bg-white text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2 text-left">Profissional</th>
              <th className="px-2 py-2 text-left">Período</th>
              <th className="px-2 py-2 text-left">Arquivo</th>
              <th className="px-2 py-2 text-left">Tamanho</th>
              <th className="px-2 py-2 text-left">Gerado em</th>
              <th className="px-2 py-2 text-left">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-2 py-4 text-center text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Carregando...
                  </span>
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-2 py-4 text-center text-slate-500">
                  Nenhum PDF gerado para o período atual.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t text-slate-700">
                  <td className="max-w-[220px] truncate px-2 py-1.5" title={item.professionalName}>
                    {item.professionalName}
                  </td>
                  <td className="px-2 py-1.5">{item.periodRef}</td>
                  <td className="max-w-[260px] truncate px-2 py-1.5" title={item.fileName}>
                    {item.fileName}
                  </td>
                  <td className="px-2 py-1.5">{formatSize(item.sizeBytes)}</td>
                  <td className="px-2 py-1.5">{toBrDateTime(item.createdAt)}</td>
                  <td className="px-2 py-1.5">
                    <div className="inline-flex items-center gap-2">
                      <a
                        href={`/api/admin/repasses/artifacts/${encodeURIComponent(
                          item.id
                        )}/download?disposition=inline`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[#17407E] hover:underline"
                      >
                        <Eye size={13} /> Visualizar
                      </a>
                      <a
                        href={`/api/admin/repasses/artifacts/${encodeURIComponent(item.id)}/download`}
                        className="inline-flex items-center gap-1 text-[#17407E] hover:underline"
                      >
                        <Download size={13} /> Baixar
                      </a>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
