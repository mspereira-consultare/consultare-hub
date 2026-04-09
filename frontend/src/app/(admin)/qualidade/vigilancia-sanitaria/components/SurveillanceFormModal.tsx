'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FileUp, Loader2, X } from 'lucide-react';
import {
  SURVEILLANCE_DOCUMENT_TYPES,
  SURVEILLANCE_RENEWAL_STATUSES,
  SURVEILLANCE_UNIT_LABELS,
  SURVEILLANCE_UNITS,
} from '@/lib/vigilancia_sanitaria/constants';
import type { SurveillanceDocument, SurveillanceFile, SurveillanceLicense } from '@/lib/vigilancia_sanitaria/types';

type ModalKind = 'license' | 'document';
type LicenseOption = { id: string; unitName: string; licenseName: string };

type Props = {
  open: boolean;
  kind: ModalKind;
  item: SurveillanceLicense | SurveillanceDocument | null;
  canEdit: boolean;
  licenseOptions: LicenseOption[];
  onClose: () => void;
  onSaved: () => void;
};

const emptyLicenseForm = {
  unitName: 'SHOPPING CAMPINAS',
  licenseName: '',
  cnae: '',
  licenseNumber: '',
  issuer: '',
  validUntil: '',
  renewalStatus: 'NAO_INICIADO',
  responsibleName: '',
  notes: '',
};

const emptyDocumentForm = {
  unitName: 'SHOPPING CAMPINAS',
  documentName: '',
  documentType: 'OUTRO',
  licenseId: '',
  validUntil: '',
  responsibleName: '',
  notes: '',
};

const normalizeError = async (res: Response) => {
  try {
    const json = await res.json();
    return String(json?.error || `Falha HTTP ${res.status}`);
  } catch {
    return `Falha HTTP ${res.status}`;
  }
};

const formatBytes = (value: number) => {
  if (!value) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};

const inputClassName =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500';

const textareaClassName =
  'min-h-40 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500';

export function SurveillanceFormModal({ open, kind, item, canEdit, licenseOptions, onClose, onSaved }: Props) {
  const [licenseForm, setLicenseForm] = useState(emptyLicenseForm);
  const [documentForm, setDocumentForm] = useState(emptyDocumentForm);
  const [files, setFiles] = useState<SurveillanceFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const entityId = item?.id || '';
  const title = kind === 'license' ? (entityId ? 'Editar licença' : 'Nova licença') : entityId ? 'Editar documento' : 'Novo documento';

  const filteredLicenseOptions = useMemo(() => {
    const unit = documentForm.unitName;
    return licenseOptions.filter((option) => !unit || option.unitName === unit);
  }, [documentForm.unitName, licenseOptions]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setSelectedFiles([]);

    if (!entityId) {
      setLicenseForm(emptyLicenseForm);
      setDocumentForm(emptyDocumentForm);
      setFiles([]);
      return;
    }

    const loadDetail = async () => {
      setLoading(true);
      try {
        const path = kind === 'license' ? 'licenses' : 'documents';
        const res = await fetch(`/api/admin/vigilancia-sanitaria/${path}/${encodeURIComponent(entityId)}?refresh=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(await normalizeError(res));
        const json = await res.json();
        const data = json?.data;
        if (kind === 'license') {
          setLicenseForm({
            unitName: data.unitName || 'SHOPPING CAMPINAS',
            licenseName: data.licenseName || '',
            cnae: data.cnae || '',
            licenseNumber: data.licenseNumber || '',
            issuer: data.issuer || '',
            validUntil: data.validUntil || '',
            renewalStatus: data.renewalStatus || 'NAO_INICIADO',
            responsibleName: data.responsibleName || '',
            notes: data.notes || '',
          });
        } else {
          setDocumentForm({
            unitName: data.unitName || 'SHOPPING CAMPINAS',
            documentName: data.documentName || '',
            documentType: data.documentType || 'OUTRO',
            licenseId: data.licenseId || '',
            validUntil: data.validUntil || '',
            responsibleName: data.responsibleName || '',
            notes: data.notes || '',
          });
        }
        setFiles(Array.isArray(data?.files) ? data.files : []);
      } catch (err: any) {
        setError(String(err?.message || err));
      } finally {
        setLoading(false);
      }
    };

    loadDetail();
  }, [entityId, kind, open]);

  if (!open) return null;

  const uploadSelectedFiles = async (savedId: string) => {
    for (const file of selectedFiles) {
      const body = new FormData();
      body.set('entityType', kind);
      body.set('entityId', savedId);
      body.set('file', file);
      const res = await fetch('/api/admin/vigilancia-sanitaria/files', { method: 'POST', body });
      if (!res.ok) throw new Error(await normalizeError(res));
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    setError('');
    try {
      const path = kind === 'license' ? 'licenses' : 'documents';
      const payload = kind === 'license' ? licenseForm : { ...documentForm, licenseId: documentForm.licenseId || null, validUntil: documentForm.validUntil || null };
      const url = entityId
        ? `/api/admin/vigilancia-sanitaria/${path}/${encodeURIComponent(entityId)}`
        : `/api/admin/vigilancia-sanitaria/${path}`;
      const res = await fetch(url, {
        method: entityId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      const json = await res.json();
      const savedId = String(json?.data?.id || entityId || '');
      if (savedId && selectedFiles.length > 0) await uploadSelectedFiles(savedId);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  const deleteFile = async (file: SurveillanceFile) => {
    if (!canEdit) return;
    const ok = window.confirm(`Excluir o arquivo "${file.originalName}"?`);
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/vigilancia-sanitaria/files/${encodeURIComponent(file.id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await normalizeError(res));
      setFiles((current) => current.filter((entry) => entry.id !== file.id));
      onSaved();
    } catch (err: any) {
      setError(String(err?.message || err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            <p className="mt-1 text-xs text-slate-500">Dados regulatórios, validade e evidências documentais.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          {error ? <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
          {loading ? (
            <div className="rounded-xl border border-slate-100 p-8 text-center text-slate-500">Carregando...</div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <section className="space-y-5 rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-blue-50/40 p-5">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Dados principais</h3>
                  <p className="mt-1 text-xs text-slate-500">Informações cadastrais, validade e responsáveis pelo acompanhamento.</p>
                </div>
                {kind === 'license' ? (
                  <div className="grid gap-4 lg:grid-cols-3">
                    <Field label="Unidade">
                      <select disabled={!canEdit} value={licenseForm.unitName} onChange={(e) => setLicenseForm((f) => ({ ...f, unitName: e.target.value }))} className={inputClassName}>
                        {SURVEILLANCE_UNITS.map((unit) => <option key={unit} value={unit}>{SURVEILLANCE_UNIT_LABELS[unit]}</option>)}
                      </select>
                    </Field>
                    <Field label="Validade">
                      <input disabled={!canEdit} type="date" value={licenseForm.validUntil} onChange={(e) => setLicenseForm((f) => ({ ...f, validUntil: e.target.value }))} className={inputClassName} />
                    </Field>
                    <Field label="CNAE">
                      <input disabled={!canEdit} value={licenseForm.cnae} onChange={(e) => setLicenseForm((f) => ({ ...f, cnae: e.target.value }))} className={inputClassName} />
                    </Field>
                    <Field label="Nome da licença" className="lg:col-span-2">
                      <input disabled={!canEdit} value={licenseForm.licenseName} onChange={(e) => setLicenseForm((f) => ({ ...f, licenseName: e.target.value }))} className={inputClassName} />
                    </Field>
                    <Field label="Número da licença/protocolo">
                      <input disabled={!canEdit} value={licenseForm.licenseNumber} onChange={(e) => setLicenseForm((f) => ({ ...f, licenseNumber: e.target.value }))} className={inputClassName} />
                    </Field>
                    <Field label="Órgão emissor">
                      <input disabled={!canEdit} value={licenseForm.issuer} onChange={(e) => setLicenseForm((f) => ({ ...f, issuer: e.target.value }))} className={inputClassName} />
                    </Field>
                    <Field label="Status de renovação">
                      <select disabled={!canEdit} value={licenseForm.renewalStatus} onChange={(e) => setLicenseForm((f) => ({ ...f, renewalStatus: e.target.value }))} className={inputClassName}>
                        {SURVEILLANCE_RENEWAL_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Responsável interno">
                      <input disabled={!canEdit} value={licenseForm.responsibleName} onChange={(e) => setLicenseForm((f) => ({ ...f, responsibleName: e.target.value }))} className={inputClassName} />
                    </Field>
                    <Field label="Observações" className="lg:col-span-3">
                      <textarea disabled={!canEdit} value={licenseForm.notes} onChange={(e) => setLicenseForm((f) => ({ ...f, notes: e.target.value }))} className={textareaClassName} />
                    </Field>
                  </div>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-3">
                    <Field label="Unidade">
                      <select disabled={!canEdit} value={documentForm.unitName} onChange={(e) => setDocumentForm((f) => ({ ...f, unitName: e.target.value, licenseId: '' }))} className={inputClassName}>
                        {SURVEILLANCE_UNITS.map((unit) => <option key={unit} value={unit}>{SURVEILLANCE_UNIT_LABELS[unit]}</option>)}
                      </select>
                    </Field>
                    <Field label="Validade">
                      <input disabled={!canEdit} type="date" value={documentForm.validUntil} onChange={(e) => setDocumentForm((f) => ({ ...f, validUntil: e.target.value }))} className={inputClassName} />
                    </Field>
                    <Field label="Tipo de documento">
                      <select disabled={!canEdit} value={documentForm.documentType} onChange={(e) => setDocumentForm((f) => ({ ...f, documentType: e.target.value }))} className={inputClassName}>
                        {SURVEILLANCE_DOCUMENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Documento" className="lg:col-span-2">
                      <input disabled={!canEdit} value={documentForm.documentName} onChange={(e) => setDocumentForm((f) => ({ ...f, documentName: e.target.value }))} className={inputClassName} />
                    </Field>
                    <Field label="Responsável interno">
                      <input disabled={!canEdit} value={documentForm.responsibleName} onChange={(e) => setDocumentForm((f) => ({ ...f, responsibleName: e.target.value }))} className={inputClassName} />
                    </Field>
                    <Field label="Licença vinculada" className="lg:col-span-3">
                      <select disabled={!canEdit} value={documentForm.licenseId} onChange={(e) => setDocumentForm((f) => ({ ...f, licenseId: e.target.value }))} className={inputClassName}>
                        <option value="">Sem vínculo</option>
                        {filteredLicenseOptions.map((license) => <option key={license.id} value={license.id}>{license.licenseName}</option>)}
                      </select>
                    </Field>
                    <Field label="Observações" className="lg:col-span-3">
                      <textarea disabled={!canEdit} value={documentForm.notes} onChange={(e) => setDocumentForm((f) => ({ ...f, notes: e.target.value }))} className={textareaClassName} />
                    </Field>
                  </div>
                )}
              </section>

              <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Arquivos</h3>
                  <p className="mt-1 text-xs text-slate-500">Anexe evidências, licenças digitalizadas e protocolos.</p>
                </div>
                {canEdit ? (
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-blue-200 bg-white px-4 py-7 text-center text-sm text-slate-500 transition hover:border-blue-300 hover:bg-blue-50/60">
                    <FileUp size={22} className="mb-2 text-slate-400" />
                    Selecionar arquivos para upload
                    <input type="file" multiple className="hidden" onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))} />
                  </label>
                ) : null}
                {selectedFiles.length > 0 ? <p className="text-xs text-slate-500">{selectedFiles.length} arquivo(s) selecionado(s). Eles serão enviados ao salvar.</p> : null}
                <div className="space-y-2">
                  {files.length === 0 ? (
                    <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">Nenhum arquivo enviado.</p>
                  ) : files.map((file) => (
                    <div key={file.id} className="rounded-lg border border-slate-100 p-3 text-sm">
                      <p className="font-medium text-slate-800">{file.originalName}</p>
                      <p className="text-xs text-slate-500">{formatBytes(file.sizeBytes)}</p>
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => window.open(`/api/admin/vigilancia-sanitaria/files/${encodeURIComponent(file.id)}/download?inline=1`, '_blank', 'noopener,noreferrer')} className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">Visualizar</button>
                        <button type="button" onClick={() => window.open(`/api/admin/vigilancia-sanitaria/files/${encodeURIComponent(file.id)}/download`, '_blank', 'noopener,noreferrer')} className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">Baixar</button>
                        {canEdit ? <button type="button" onClick={() => deleteFile(file)} className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50">Excluir</button> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Fechar</button>
          {canEdit ? (
            <button type="button" disabled={saving || loading} onClick={handleSave} className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              Salvar
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${className || ''}`}>
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}


