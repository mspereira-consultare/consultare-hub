'use client';

import { FileSpreadsheet, FileText, Loader2, UploadCloud } from 'lucide-react';
import type { PayrollImportFile } from '@/lib/payroll/types';
import { formatDateTimeBr, statusLabelMap } from './formatters';

const resolveImportTypeLabel = (value: string) => {
  if (value === 'POINT_PDF') return 'Ponto (PDF)';
  if (value === 'REFERENCE_XLSX') return 'Base legada (XLSX)';
  return value;
};

export function PayrollImportsPanel({
  imports,
  uploadingPoint,
  onUploadPoint,
}: {
  imports: PayrollImportFile[];
  uploadingPoint: boolean;
  onUploadPoint: (file: File) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[360px,1fr]">
      <div className="space-y-4">
        <UploadCard
          title="Relatório de ponto (PDF)"
          description="Importe o relatório do período no layout atual do RH."
          buttonLabel="Enviar PDF"
          loading={uploadingPoint}
          accept="application/pdf,.pdf"
          onPick={onUploadPoint}
          icon={FileText}
        />

        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-white p-3 text-[#17407E] shadow-sm">
              <FileSpreadsheet size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-800">Planilha padrão do RH</div>
              <div className="mt-1 text-xs leading-5 text-slate-600">
                O sistema agora gera automaticamente a planilha operacional no modelo padrão do RH. Não é mais necessário enviar um XLSX de referência.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">Histórico de importações</h3>
          <p className="mt-1 text-xs text-slate-500">Os arquivos mais recentes substituem a base ativa da competência, mas o histórico continua registrado.</p>
        </div>
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Arquivo</th>
                <th className="px-3 py-3 text-left">Tipo</th>
                <th className="px-3 py-3 text-left">Status</th>
                <th className="px-3 py-3 text-left">Enviado em</th>
                <th className="px-3 py-3 text-left">Log</th>
              </tr>
            </thead>
            <tbody>
              {imports.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center text-slate-500">
                    Nenhum arquivo enviado nesta competência.
                  </td>
                </tr>
              ) : (
                imports.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3 font-medium text-slate-900">{item.fileName}</td>
                    <td className="px-3 py-3 text-slate-600">{resolveImportTypeLabel(String(item.fileType || ''))}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          item.processingStatus === 'COMPLETED'
                            ? 'bg-emerald-100 text-emerald-700'
                            : item.processingStatus === 'FAILED'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {statusLabelMap[item.processingStatus] || item.processingStatus}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{formatDateTimeBr(item.createdAt)}</td>
                    <td className="px-3 py-3 text-xs text-slate-600">{item.processingLog || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function UploadCard({
  title,
  description,
  buttonLabel,
  loading,
  accept,
  onPick,
  icon: Icon,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  loading: boolean;
  accept: string;
  onPick: (file: File) => void;
  icon: typeof UploadCloud;
}) {
  return (
    <label className="block cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300">
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPick(file);
          event.currentTarget.value = '';
        }}
      />
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-blue-50 p-3 text-[#17407E]">
          <Icon size={18} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-slate-800">{title}</div>
          <div className="mt-1 text-xs text-slate-500">{description}</div>
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />} {buttonLabel}
          </div>
        </div>
      </div>
    </label>
  );
}
