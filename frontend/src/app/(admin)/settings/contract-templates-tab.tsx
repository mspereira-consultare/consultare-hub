'use client';

import React, { useMemo, useState } from 'react';
import { CheckCircle, Loader2, RefreshCw, UploadCloud } from 'lucide-react';
import { CONTRACT_TYPES, type ContractTypeCode } from '@/lib/profissionais/constants';

type PlaceholderSourceOption = {
  value: string;
  label: string;
  group: 'profissional' | 'registro' | 'sistema';
};

type MappingItem = {
  placeholder: string;
  source: string | null;
  required: boolean;
  confirmed: boolean;
};

type ContractTemplateItem = {
  id: string;
  name: string;
  contractType: string;
  version: number;
  status: 'draft' | 'active' | 'archived';
  originalName: string;
  placeholders: string[];
  mapping: MappingItem[];
  mappingDone: number;
  mappingTotal: number;
  mappingComplete: boolean;
  uploadedAt: string;
};

const statusBadgeClass = (status: ContractTemplateItem['status']) => {
  if (status === 'active') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'archived') return 'bg-slate-100 text-slate-600 border-slate-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
};

const groupLabel = (group: PlaceholderSourceOption['group']) => {
  if (group === 'profissional') return 'Profissional';
  if (group === 'registro') return 'Registro';
  return 'Sistema';
};

export default function ContractTemplatesTab() {
  const [items, setItems] = useState<ContractTemplateItem[]>([]);
  const [sourceOptions, setSourceOptions] = useState<PlaceholderSourceOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingMapping, setSavingMapping] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [okMessage, setOkMessage] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formContractType, setFormContractType] = useState<ContractTypeCode>(CONTRACT_TYPES[0]?.code || 'PADRAO_CLT');
  const [formNotes, setFormNotes] = useState('');
  const [formFile, setFormFile] = useState<File | null>(null);

  const [mappingDraft, setMappingDraft] = useState<Record<string, MappingItem[]>>({});

  const sourceOptionsByGroup = useMemo(() => {
    const groups: Record<string, PlaceholderSourceOption[]> = {};
    for (const option of sourceOptions) {
      if (!groups[option.group]) groups[option.group] = [];
      groups[option.group].push(option);
    }
    return groups;
  }, [sourceOptions]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    setOkMessage('');
    try {
      const res = await fetch('/api/admin/contract-templates?mode=all', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao carregar modelos.');
      const rows = Array.isArray(data?.data) ? data.data : [];
      const options = Array.isArray(data?.placeholderSourceOptions) ? data.placeholderSourceOptions : [];
      setItems(rows);
      setSourceOptions(options);
      setMappingDraft(
        rows.reduce((acc: Record<string, MappingItem[]>, item: ContractTemplateItem) => {
          acc[item.id] = Array.isArray(item.mapping) ? item.mapping : [];
          return acc;
        }, {})
      );
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar modelos.');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadData();
  }, []);

  const uploadTemplate = async () => {
    setError('');
    setOkMessage('');
    if (!formName.trim()) {
      setError('Informe o nome do modelo.');
      return;
    }
    if (!formFile) {
      setError('Selecione um arquivo .docx.');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('name', formName.trim());
      fd.append('contractType', formContractType);
      fd.append('notes', formNotes);
      fd.append('file', formFile);
      const res = await fetch('/api/admin/contract-templates', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha no upload.');
      setFormName('');
      setFormNotes('');
      setFormFile(null);
      setOkMessage('Modelo enviado com sucesso. Revise os placeholders e ative quando estiver pronto.');
      await loadData();
    } catch (e: any) {
      setError(e?.message || 'Falha no upload.');
    } finally {
      setUploading(false);
    }
  };

  const saveTemplateMapping = async (templateId: string) => {
    setSavingMapping(true);
    setError('');
    setOkMessage('');
    try {
      const mapping = mappingDraft[templateId] || [];
      const res = await fetch(`/api/admin/contract-templates/${encodeURIComponent(templateId)}/mapping`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapping }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao salvar mapeamento.');
      setOkMessage('Mapeamento salvo.');
      await loadData();
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar mapeamento.');
    } finally {
      setSavingMapping(false);
    }
  };

  const setTemplateStatus = async (templateId: string, action: 'activate' | 'archive') => {
    setUpdatingStatus(templateId);
    setError('');
    setOkMessage('');
    try {
      const res = await fetch(`/api/admin/contract-templates/${encodeURIComponent(templateId)}/${action}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao atualizar status.');
      setOkMessage(action === 'activate' ? 'Modelo ativado.' : 'Modelo arquivado.');
      await loadData();
    } catch (e: any) {
      setError(e?.message || 'Falha ao atualizar status.');
    } finally {
      setUpdatingStatus(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="border rounded-xl p-4 bg-slate-50/70">
        <h3 className="font-semibold text-slate-800 mb-3">Upload de modelo (.docx)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nome do modelo</label>
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg bg-white"
              placeholder="Ex.: Contrato Odontologia PJ"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de contrato</label>
            <select
              value={formContractType}
              onChange={(e) => setFormContractType(e.target.value as ContractTypeCode)}
              className="w-full px-3 py-2 border rounded-lg bg-white"
            >
              {CONTRACT_TYPES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Observacoes (opcional)</label>
            <input
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg bg-white"
              placeholder="Anotacoes internas do modelo"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Arquivo .docx</label>
            <input
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => setFormFile(e.target.files?.[0] || null)}
              className="w-full px-3 py-2 border rounded-lg bg-white"
            />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={uploadTemplate}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-60"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
            {uploading ? 'Enviando...' : 'Enviar modelo'}
          </button>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      </div>

      {error && <div className="text-sm px-3 py-2 rounded-lg border border-rose-200 bg-rose-50 text-rose-700">{error}</div>}
      {okMessage && (
        <div className="text-sm px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700">
          {okMessage}
        </div>
      )}

      <div className="border rounded-xl overflow-auto">
        <table className="w-full text-sm min-w-[980px]">
          <thead className="bg-slate-50 text-xs uppercase text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">Modelo</th>
              <th className="px-3 py-2 text-left">Tipo</th>
              <th className="px-3 py-2 text-left">Versao</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Placeholders</th>
              <th className="px-3 py-2 text-left">Mapeamento</th>
              <th className="px-3 py-2 text-left">Upload</th>
              <th className="px-3 py-2 text-left">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Carregando...
                  </span>
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                  Nenhum modelo cadastrado.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <React.Fragment key={item.id}>
                  <tr className="border-t">
                    <td className="px-3 py-2 font-medium text-slate-800">{item.name}</td>
                    <td className="px-3 py-2">{CONTRACT_TYPES.find((c) => c.code === item.contractType)?.label || item.contractType}</td>
                    <td className="px-3 py-2">v{item.version}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs border ${statusBadgeClass(item.status)}`}>
                        {item.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2">{item.placeholders.length}</td>
                    <td className="px-3 py-2">
                      <span className={item.mappingComplete ? 'text-emerald-600 font-medium' : 'text-amber-700'}>
                        {item.mappingDone}/{item.mappingTotal}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{item.uploadedAt ? item.uploadedAt.slice(0, 19).replace('T', ' ') : '-'}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setExpandedId((current) => (current === item.id ? null : item.id))}
                          className="px-2 py-1 border rounded text-xs"
                        >
                          Mapear
                        </button>
                        {item.status !== 'active' && (
                          <button
                            type="button"
                            onClick={() => setTemplateStatus(item.id, 'activate')}
                            disabled={updatingStatus === item.id}
                            className="px-2 py-1 rounded text-xs bg-emerald-600 text-white disabled:opacity-60"
                          >
                            Ativar
                          </button>
                        )}
                        {item.status !== 'archived' && (
                          <button
                            type="button"
                            onClick={() => setTemplateStatus(item.id, 'archive')}
                            disabled={updatingStatus === item.id}
                            className="px-2 py-1 rounded text-xs border"
                          >
                            Arquivar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {expandedId === item.id && (
                    <tr>
                      <td colSpan={8} className="px-3 py-3 bg-slate-50 border-t">
                        <div className="rounded-lg border bg-white p-3 space-y-3">
                          <div className="text-xs text-slate-600">
                            Arquivo: <strong>{item.originalName}</strong>
                          </div>
                          <div className="space-y-2 max-h-[260px] overflow-auto pr-1">
                            {(mappingDraft[item.id] || []).map((mappingItem, idx) => (
                              <div key={`${item.id}-${mappingItem.placeholder}`} className="grid grid-cols-12 gap-2 items-center">
                                <div className="col-span-4 text-xs font-mono text-slate-700 bg-slate-50 border rounded px-2 py-1">
                                  {`{{${mappingItem.placeholder}}}`}
                                </div>
                                <div className="col-span-7">
                                  <select
                                    value={mappingItem.source || ''}
                                    onChange={(e) =>
                                      setMappingDraft((prev) => {
                                        const next = { ...prev };
                                        const rows = [...(next[item.id] || [])];
                                        rows[idx] = {
                                          ...rows[idx],
                                          source: e.target.value || null,
                                          confirmed: rows[idx].required ? Boolean(e.target.value) : true,
                                        };
                                        next[item.id] = rows;
                                        return next;
                                      })
                                    }
                                    className="w-full px-2 py-1.5 border rounded bg-white text-xs"
                                  >
                                    <option value="">Selecione fonte</option>
                                    {Object.entries(sourceOptionsByGroup).map(([group, options]) => (
                                      <optgroup key={group} label={groupLabel(group as PlaceholderSourceOption['group'])}>
                                        {options.map((option) => (
                                          <option key={option.value} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </optgroup>
                                    ))}
                                  </select>
                                </div>
                                <div className="col-span-1 text-right">
                                  {mappingItem.confirmed ? (
                                    <CheckCircle size={14} className="inline-block text-emerald-600" />
                                  ) : (
                                    <span className="text-[10px] text-amber-600">PEND</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => saveTemplateMapping(item.id)}
                              disabled={savingMapping}
                              className="px-3 py-2 rounded bg-blue-600 text-white text-xs disabled:opacity-60 inline-flex items-center gap-2"
                            >
                              {savingMapping && <Loader2 size={12} className="animate-spin" />}
                              Salvar mapeamento
                            </button>
                            <span className="text-xs text-slate-500">
                              Obrigatorios mapeados: {mappingDraft[item.id]?.filter((x) => x.required && x.source).length || 0}/
                              {mappingDraft[item.id]?.filter((x) => x.required).length || 0}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
