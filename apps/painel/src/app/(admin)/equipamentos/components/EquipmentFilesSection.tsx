import { Download, FileUp, Loader2 } from 'lucide-react';
import type { EquipmentFile } from '@/lib/equipamentos/types';

type SelectOption = { value: string; label: string };

type EquipmentFilesSectionProps = {
  files: EquipmentFile[];
  fileTypes: SelectOption[];
  uploadType: string;
  uploadNotes: string;
  uploading: boolean;
  onUploadTypeChange: (value: string) => void;
  onUploadNotesChange: (value: string) => void;
  onFilesSelected: (files: FileList | null) => void;
  onDownload: (file: EquipmentFile) => void;
};

const inputClassName =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200';
const labelClassName = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500';

const fileTypeLabel = (value: string, options: SelectOption[]) =>
  options.find((item) => item.value === value)?.label || value;

const formatDateTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

export function EquipmentFilesSection({
  files,
  fileTypes,
  uploadType,
  uploadNotes,
  uploading,
  onUploadTypeChange,
  onUploadNotesChange,
  onFilesSelected,
  onDownload,
}: EquipmentFilesSectionProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
      <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-white p-3 text-slate-600 shadow-sm">
            <FileUp size={18} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Arquivos e evidências</h3>
            <p className="text-sm text-slate-500">Fotos, certificados, manuais e outros anexos do equipamento.</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="block">
            <span className={labelClassName}>Tipo do arquivo</span>
            <select className={inputClassName} value={uploadType} onChange={(event) => onUploadTypeChange(event.target.value)}>
              {fileTypes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClassName}>Observações do arquivo</span>
            <textarea
              className={`${inputClassName} min-h-[96px] resize-y`}
              value={uploadNotes}
              onChange={(event) => onUploadNotesChange(event.target.value)}
            />
          </label>
          <label className="block">
            <span className={labelClassName}>Selecionar arquivos</span>
            <input
              type="file"
              multiple
              onChange={(event) => onFilesSelected(event.target.files)}
              disabled={uploading}
              className="block w-full rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#17407E] file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-[#143768] disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>
          {uploading ? (
            <div className="inline-flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" />
              Enviando arquivo(s)...
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Lista de arquivos</h3>
          <p className="text-sm text-slate-500">Todos os anexos vinculados ao equipamento.</p>
        </div>

        <div className="mt-4 max-h-[420px] overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                <th className="px-2 py-3">Tipo</th>
                <th className="px-2 py-3">Arquivo</th>
                <th className="px-2 py-3">Observações</th>
                <th className="px-2 py-3">Enviado em</th>
                <th className="px-2 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {files.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-slate-500">
                    Nenhum arquivo cadastrado até o momento.
                  </td>
                </tr>
              ) : (
                files.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 align-top">
                    <td className="px-2 py-3 text-slate-700">{fileTypeLabel(item.fileType, fileTypes)}</td>
                    <td className="px-2 py-3">
                      <div className="font-medium text-slate-800">{item.originalName}</div>
                      <div className="mt-1 text-xs text-slate-500">{(item.sizeBytes / 1024).toFixed(1)} KB</div>
                    </td>
                    <td className="px-2 py-3 text-slate-600">{item.notes || '-'}</td>
                    <td className="px-2 py-3 text-slate-600">{formatDateTime(item.createdAt)}</td>
                    <td className="px-2 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onDownload(item)}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        <Download size={12} />
                        Baixar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

