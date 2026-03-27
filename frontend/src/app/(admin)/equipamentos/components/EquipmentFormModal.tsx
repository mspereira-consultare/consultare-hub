'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  FileUp,
  Loader2,
  ShieldCheck,
  Wrench,
  X,
} from 'lucide-react';
import type { EquipmentEvent, EquipmentFile, EquipmentListItem } from '@/lib/equipamentos/types';
import { EquipmentEventsSection } from './EquipmentEventsSection';
import { EquipmentFilesSection } from './EquipmentFilesSection';

type SelectOption = { value: string; label: string };

type EquipmentFormState = {
  unitName: string;
  description: string;
  identificationNumber: string;
  barcodeValue: string;
  category: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  locationDetail: string;
  operationalStatus: string;
  calibrationRequired: boolean;
  calibrationFrequencyDays: string;
  lastCalibrationDate: string;
  nextCalibrationDate: string;
  calibrationResponsible: string;
  calibrationNotes: string;
  notes: string;
};

type EventFormState = {
  eventDate: string;
  eventType: string;
  description: string;
  handledBy: string;
  status: string;
  notes: string;
};

type EquipmentOptionsPayload = {
  units: SelectOption[];
  operationalStatuses: SelectOption[];
  calibrationStatuses: SelectOption[];
  eventTypes: SelectOption[];
  eventStatuses: SelectOption[];
  fileTypes: SelectOption[];
  categories: string[];
  responsibles: string[];
  manufacturers: string[];
  locations: string[];
  defaultPageSize: number;
  maxPageSize: number;
};

type EquipmentFormModalProps = {
  open: boolean;
  mode: 'create' | 'edit';
  equipment: EquipmentListItem | null;
  options: EquipmentOptionsPayload;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (item: EquipmentListItem) => void;
};

type ModalTab = 'cadastro' | 'calibracao' | 'manutencao' | 'arquivos';

const inputClassName =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200';
const labelClassName = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500';
const sectionClassName = 'rounded-xl border border-slate-200 bg-slate-50/70 p-4';

const emptyForm = (options: EquipmentOptionsPayload): EquipmentFormState => ({
  unitName: options.units[0]?.value || '',
  description: '',
  identificationNumber: '',
  barcodeValue: '',
  category: '',
  manufacturer: '',
  model: '',
  serialNumber: '',
  locationDetail: '',
  operationalStatus: options.operationalStatuses[0]?.value || 'ATIVO',
  calibrationRequired: true,
  calibrationFrequencyDays: '',
  lastCalibrationDate: '',
  nextCalibrationDate: '',
  calibrationResponsible: '',
  calibrationNotes: '',
  notes: '',
});

const formFromEquipment = (item: EquipmentListItem, options: EquipmentOptionsPayload): EquipmentFormState => ({
  unitName: item.unitName || options.units[0]?.value || '',
  description: item.description || '',
  identificationNumber: item.identificationNumber || '',
  barcodeValue: item.barcodeValue || '',
  category: item.category || '',
  manufacturer: item.manufacturer || '',
  model: item.model || '',
  serialNumber: item.serialNumber || '',
  locationDetail: item.locationDetail || '',
  operationalStatus: item.operationalStatus || options.operationalStatuses[0]?.value || 'ATIVO',
  calibrationRequired: item.calibrationRequired,
  calibrationFrequencyDays: item.calibrationFrequencyDays ? String(item.calibrationFrequencyDays) : '',
  lastCalibrationDate: item.lastCalibrationDate || '',
  nextCalibrationDate: item.nextCalibrationDate || '',
  calibrationResponsible: item.calibrationResponsible || '',
  calibrationNotes: item.calibrationNotes || '',
  notes: item.notes || '',
});

const emptyEventForm = (options: EquipmentOptionsPayload): EventFormState => ({
  eventDate: '',
  eventType: options.eventTypes[0]?.value || 'MANUTENCAO_PREVENTIVA',
  description: '',
  handledBy: '',
  status: options.eventStatuses[0]?.value || 'ABERTO',
  notes: '',
});

const normalizeError = async (res: Response) => {
  try {
    const json = await res.json();
    return String(json?.error || `Falha HTTP ${res.status}`);
  } catch {
    return `Falha HTTP ${res.status}`;
  }
};

export function EquipmentFormModal({
  open,
  mode,
  equipment,
  options,
  canEdit,
  onClose,
  onSaved,
}: EquipmentFormModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>('cadastro');
  const [form, setForm] = useState<EquipmentFormState>(() => emptyForm(options));
  const [events, setEvents] = useState<EquipmentEvent[]>([]);
  const [files, setFiles] = useState<EquipmentFile[]>([]);
  const [eventForm, setEventForm] = useState<EventFormState>(() => emptyEventForm(options));
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [currentItem, setCurrentItem] = useState<EquipmentListItem | null>(equipment);
  const [loadingExtras, setLoadingExtras] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [uploadType, setUploadType] = useState(options.fileTypes[0]?.value || 'OUTRO');
  const [uploadNotes, setUploadNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const equipmentId = currentItem?.id || equipment?.id || null;
  const hasPersistedRecord = Boolean(equipmentId);
  const tabs: Array<{ key: ModalTab; label: string; icon: any; requiresPersisted?: boolean }> = [
    { key: 'cadastro', label: 'Cadastro', icon: ShieldCheck },
    { key: 'calibracao', label: 'Calibração', icon: CalendarClock },
    { key: 'manutencao', label: 'Manutenção', icon: Wrench, requiresPersisted: true },
    { key: 'arquivos', label: 'Arquivos', icon: FileUp, requiresPersisted: true },
  ];

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSuccessMessage(null);
    setActiveTab('cadastro');
    setCurrentItem(equipment);
    setForm(equipment ? formFromEquipment(equipment, options) : emptyForm(options));
    setEventForm(emptyEventForm(options));
    setEditingEventId(null);
    setUploadType(options.fileTypes[0]?.value || 'OUTRO');
    setUploadNotes('');
  }, [open, equipment, options]);

  useEffect(() => {
    if (!open || !equipmentId) {
      setEvents([]);
      setFiles([]);
      return;
    }

    const loadExtras = async () => {
      try {
        setLoadingExtras(true);
        const [eventsRes, filesRes] = await Promise.all([
          fetch(`/api/admin/equipamentos/${encodeURIComponent(equipmentId)}/eventos?refresh=${Date.now()}`, { cache: 'no-store' }),
          fetch(`/api/admin/equipamentos/${encodeURIComponent(equipmentId)}/arquivos?refresh=${Date.now()}`, { cache: 'no-store' }),
        ]);
        if (!eventsRes.ok) throw new Error(await normalizeError(eventsRes));
        if (!filesRes.ok) throw new Error(await normalizeError(filesRes));
        const eventsJson = await eventsRes.json();
        const filesJson = await filesRes.json();
        setEvents(Array.isArray(eventsJson?.data) ? eventsJson.data : []);
        setFiles(Array.isArray(filesJson?.data) ? filesJson.data : []);
      } catch (err: any) {
        setError(String(err?.message || err));
      } finally {
        setLoadingExtras(false);
      }
    };

    loadExtras();
  }, [open, equipmentId]);

  const datalistIds = useMemo(
    () => ({
      categories: 'equipamentos-categorias',
      manufacturers: 'equipamentos-fabricantes',
      locations: 'equipamentos-localizacoes',
      responsibles: 'equipamentos-responsaveis',
    }),
    [],
  );

  if (!open) return null;

  const submitBaseForm = async () => {
    if (!canEdit) {
      setError('Sem permissão para editar equipamentos.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);
      const payload = {
        unitName: form.unitName,
        description: form.description,
        identificationNumber: form.identificationNumber,
        barcodeValue: form.barcodeValue || null,
        category: form.category || null,
        manufacturer: form.manufacturer || null,
        model: form.model || null,
        serialNumber: form.serialNumber || null,
        locationDetail: form.locationDetail || null,
        operationalStatus: form.operationalStatus,
        calibrationRequired: form.calibrationRequired,
        calibrationFrequencyDays: form.calibrationFrequencyDays ? Number(form.calibrationFrequencyDays) : null,
        lastCalibrationDate: form.calibrationRequired ? form.lastCalibrationDate || null : null,
        nextCalibrationDate: form.calibrationRequired ? form.nextCalibrationDate || null : null,
        calibrationResponsible: form.calibrationRequired ? form.calibrationResponsible || null : null,
        calibrationNotes: form.calibrationRequired ? form.calibrationNotes || null : null,
        notes: form.notes || null,
      };

      const url = hasPersistedRecord
        ? `/api/admin/equipamentos/${encodeURIComponent(equipmentId!)}`
        : '/api/admin/equipamentos';
      const method = hasPersistedRecord ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      const json = await res.json();
      const saved = json?.data as EquipmentListItem;
      setCurrentItem(saved);
      onSaved(saved);
      setSuccessMessage(hasPersistedRecord ? 'Equipamento atualizado com sucesso.' : 'Equipamento salvo com sucesso. Agora você já pode adicionar manutenção e arquivos.');
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  const submitEvent = async () => {
    if (!equipmentId) return;
    try {
      setSavingEvent(true);
      setError(null);
      const url = editingEventId
        ? `/api/admin/equipamentos/${encodeURIComponent(equipmentId)}/eventos/${encodeURIComponent(editingEventId)}`
        : `/api/admin/equipamentos/${encodeURIComponent(equipmentId)}/eventos`;
      const method = editingEventId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventForm),
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      const json = await res.json();
      const saved = json?.data as EquipmentEvent;
      setEvents((current) => {
        const next = editingEventId ? current.map((item) => (item.id === editingEventId ? saved : item)) : [saved, ...current];
        return next;
      });
      setEventForm(emptyEventForm(options));
      setEditingEventId(null);
      const detailRes = await fetch(`/api/admin/equipamentos/${encodeURIComponent(equipmentId)}?refresh=${Date.now()}`, { cache: 'no-store' });
      if (detailRes.ok) {
        const detailJson = await detailRes.json();
        if (detailJson?.data) {
          setCurrentItem(detailJson.data);
          onSaved(detailJson.data);
        }
      }
      setSuccessMessage(editingEventId ? 'Evento atualizado com sucesso.' : 'Evento cadastrado com sucesso.');
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setSavingEvent(false);
    }
  };

  const editEvent = (item: EquipmentEvent) => {
    setEditingEventId(item.id);
    setEventForm({
      eventDate: item.eventDate || '',
      eventType: item.eventType,
      description: item.description,
      handledBy: item.handledBy || '',
      status: item.status,
      notes: item.notes || '',
    });
    setActiveTab('manutencao');
  };

  const deleteEvent = async (eventId: string) => {
    if (!equipmentId) return;
    if (!window.confirm('Deseja realmente excluir este evento?')) return;
    try {
      setError(null);
      const res = await fetch(`/api/admin/equipamentos/${encodeURIComponent(equipmentId)}/eventos/${encodeURIComponent(eventId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      setEvents((current) => current.filter((item) => item.id !== eventId));
      const detailRes = await fetch(`/api/admin/equipamentos/${encodeURIComponent(equipmentId)}?refresh=${Date.now()}`, { cache: 'no-store' });
      if (detailRes.ok) {
        const detailJson = await detailRes.json();
        if (detailJson?.data) {
          setCurrentItem(detailJson.data);
          onSaved(detailJson.data);
        }
      }
      setSuccessMessage('Evento excluído com sucesso.');
    } catch (err: any) {
      setError(String(err?.message || err));
    }
  };

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!equipmentId || !fileList?.length) return;
    try {
      setUploadingFiles(true);
      setError(null);
      const uploaded: EquipmentFile[] = [];
      for (const file of Array.from(fileList)) {
        const body = new FormData();
        body.set('file', file);
        body.set('fileType', uploadType);
        body.set('notes', uploadNotes);
        const res = await fetch(`/api/admin/equipamentos/${encodeURIComponent(equipmentId)}/arquivos`, {
          method: 'POST',
          body,
        });
        if (!res.ok) throw new Error(await normalizeError(res));
        const json = await res.json();
        if (json?.data) uploaded.push(json.data);
      }
      setFiles((current) => [...uploaded, ...current]);
      setUploadNotes('');
      const detailRes = await fetch(`/api/admin/equipamentos/${encodeURIComponent(equipmentId)}?refresh=${Date.now()}`, { cache: 'no-store' });
      if (detailRes.ok) {
        const detailJson = await detailRes.json();
        if (detailJson?.data) {
          setCurrentItem(detailJson.data);
          onSaved(detailJson.data);
        }
      }
      setSuccessMessage('Arquivo(s) enviado(s) com sucesso.');
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setUploadingFiles(false);
    }
  };

  const downloadFile = (file: EquipmentFile) => {
    const href = `/api/admin/equipamentos/arquivos/${encodeURIComponent(file.id)}/download`;
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm">
      <div className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{mode === 'create' && !hasPersistedRecord ? 'Novo equipamento' : 'Editar equipamento'}</h1>
            <p className="mt-1 text-sm text-slate-500">Cadastro estruturado com controle de calibração, manutenção e arquivos.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-200 px-6 py-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const disabled = Boolean(tab.requiresPersisted && !hasPersistedRecord);
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                disabled={disabled}
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                  active
                    ? 'border-[#17407E] bg-blue-50 text-[#17407E]'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error ? (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          ) : null}
          {successMessage ? (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</div>
          ) : null}
          {!hasPersistedRecord && (activeTab === 'manutencao' || activeTab === 'arquivos') ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Salve o cadastro principal para liberar manutenção e arquivos.
            </div>
          ) : null}

          {activeTab === 'cadastro' ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <section className={sectionClassName}>
                <h2 className="text-lg font-semibold text-slate-900">Identificação e lotação</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className={labelClassName}>Unidade</span>
                    <select className={inputClassName} value={form.unitName} onChange={(event) => setForm({ ...form, unitName: event.target.value })}>
                      {options.units.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={labelClassName}>Status operacional</span>
                    <select className={inputClassName} value={form.operationalStatus} onChange={(event) => setForm({ ...form, operationalStatus: event.target.value })}>
                      {options.operationalStatuses.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block md:col-span-2">
                    <span className={labelClassName}>Descrição do equipamento</span>
                    <input className={inputClassName} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
                  </label>
                  <label className="block">
                    <span className={labelClassName}>Número de identificação</span>
                    <input className={inputClassName} value={form.identificationNumber} onChange={(event) => setForm({ ...form, identificationNumber: event.target.value })} />
                  </label>
                  <label className="block">
                    <span className={labelClassName}>Código de barras / QR</span>
                    <input className={inputClassName} value={form.barcodeValue} onChange={(event) => setForm({ ...form, barcodeValue: event.target.value })} />
                  </label>
                  <label className="block">
                    <span className={labelClassName}>Categoria</span>
                    <input list={datalistIds.categories} className={inputClassName} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
                  </label>
                  <label className="block">
                    <span className={labelClassName}>Localização / setor</span>
                    <input list={datalistIds.locations} className={inputClassName} value={form.locationDetail} onChange={(event) => setForm({ ...form, locationDetail: event.target.value })} />
                  </label>
                </div>
              </section>

              <section className={sectionClassName}>
                <h2 className="text-lg font-semibold text-slate-900">Dados técnicos</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className={labelClassName}>Fabricante</span>
                    <input list={datalistIds.manufacturers} className={inputClassName} value={form.manufacturer} onChange={(event) => setForm({ ...form, manufacturer: event.target.value })} />
                  </label>
                  <label className="block">
                    <span className={labelClassName}>Modelo</span>
                    <input className={inputClassName} value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} />
                  </label>
                  <label className="block">
                    <span className={labelClassName}>Número de série</span>
                    <input className={inputClassName} value={form.serialNumber} onChange={(event) => setForm({ ...form, serialNumber: event.target.value })} />
                  </label>
                  <label className="block md:col-span-2">
                    <span className={labelClassName}>Observações gerais</span>
                    <textarea className={`${inputClassName} min-h-[128px] resize-y`} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
                  </label>
                </div>
              </section>
            </div>
          ) : null}

          {activeTab === 'calibracao' ? (
            <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
              <section className={sectionClassName}>
                <h2 className="text-lg font-semibold text-slate-900">Controle de calibração</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 md:col-span-2">
                    <input
                      type="checkbox"
                      checked={form.calibrationRequired}
                      onChange={(event) => setForm({ ...form, calibrationRequired: event.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-[#17407E] focus:ring-[#17407E]"
                    />
                    Exigir controle de calibração para este equipamento
                  </label>
                  <label className="block">
                    <span className={labelClassName}>Periodicidade (dias)</span>
                    <input
                      type="number"
                      className={inputClassName}
                      value={form.calibrationFrequencyDays}
                      disabled={!form.calibrationRequired}
                      onChange={(event) => setForm({ ...form, calibrationFrequencyDays: event.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClassName}>Responsável pela calibração</span>
                    <input
                      list={datalistIds.responsibles}
                      className={inputClassName}
                      value={form.calibrationResponsible}
                      disabled={!form.calibrationRequired}
                      onChange={(event) => setForm({ ...form, calibrationResponsible: event.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClassName}>Última calibração</span>
                    <input
                      type="date"
                      className={inputClassName}
                      value={form.lastCalibrationDate}
                      disabled={!form.calibrationRequired}
                      onChange={(event) => setForm({ ...form, lastCalibrationDate: event.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClassName}>Próxima calibração</span>
                    <input
                      type="date"
                      className={inputClassName}
                      value={form.nextCalibrationDate}
                      disabled={!form.calibrationRequired}
                      onChange={(event) => setForm({ ...form, nextCalibrationDate: event.target.value })}
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <span className={labelClassName}>Observações da calibração</span>
                    <textarea
                      className={`${inputClassName} min-h-[128px] resize-y`}
                      value={form.calibrationNotes}
                      disabled={!form.calibrationRequired}
                      onChange={(event) => setForm({ ...form, calibrationNotes: event.target.value })}
                    />
                  </label>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="text-lg font-semibold text-slate-900">Leitura gerencial</h2>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="font-medium text-slate-800">Status atual da calibração</p>
                    <p className="mt-1 text-slate-600">{currentItem?.calibrationStatusLabel || 'Salve o cadastro para calcular o status automaticamente.'}</p>
                  </div>
                  <p>
                    O status de calibração é calculado automaticamente a partir da exigência de calibração, da próxima data prevista e da janela de alerta de 30 dias.
                  </p>
                  <ul className="list-disc space-y-1 pl-5 text-slate-500">
                    <li><strong className="text-slate-700">Em dia:</strong> próxima calibração fora da janela de alerta.</li>
                    <li><strong className="text-slate-700">Vencendo:</strong> próxima calibração nos próximos 30 dias.</li>
                    <li><strong className="text-slate-700">Vencido:</strong> data de calibração já passou.</li>
                    <li><strong className="text-slate-700">Sem programação:</strong> exige calibração, mas sem data futura registrada.</li>
                    <li><strong className="text-slate-700">Não aplicável:</strong> equipamento sem exigência de calibração.</li>
                  </ul>
                </div>
              </section>
            </div>
          ) : null}

          {activeTab === 'manutencao' && hasPersistedRecord ? (
            loadingExtras ? (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                <Loader2 size={16} className="animate-spin" />
                Carregando histórico do equipamento...
              </div>
            ) : (
              <EquipmentEventsSection
                events={events}
                eventTypes={options.eventTypes}
                eventStatuses={options.eventStatuses}
                form={eventForm}
                editingId={editingEventId}
                saving={savingEvent}
                onFormChange={setEventForm}
                onSubmit={submitEvent}
                onEdit={editEvent}
                onDelete={deleteEvent}
                onCancelEdit={() => {
                  setEditingEventId(null);
                  setEventForm(emptyEventForm(options));
                }}
              />
            )
          ) : null}

          {activeTab === 'arquivos' && hasPersistedRecord ? (
            loadingExtras ? (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                <Loader2 size={16} className="animate-spin" />
                Carregando arquivos do equipamento...
              </div>
            ) : (
              <EquipmentFilesSection
                files={files}
                fileTypes={options.fileTypes}
                uploadType={uploadType}
                uploadNotes={uploadNotes}
                uploading={uploadingFiles}
                onUploadTypeChange={setUploadType}
                onUploadNotesChange={setUploadNotes}
                onFilesSelected={handleFilesSelected}
                onDownload={downloadFile}
              />
            )
          ) : null}

          <datalist id={datalistIds.categories}>{options.categories.map((item) => <option key={item} value={item} />)}</datalist>
          <datalist id={datalistIds.manufacturers}>{options.manufacturers.map((item) => <option key={item} value={item} />)}</datalist>
          <datalist id={datalistIds.locations}>{options.locations.map((item) => <option key={item} value={item} />)}</datalist>
          <datalist id={datalistIds.responsibles}>{options.responsibles.map((item) => <option key={item} value={item} />)}</datalist>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-slate-200 px-6 py-4">
          <div className="text-xs text-slate-500">{equipmentId ? `ID do equipamento: ${equipmentId}` : 'O histórico e os arquivos ficam disponíveis após o primeiro salvamento.'}</div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={submitBaseForm}
              disabled={!canEdit || saving}
              className="inline-flex items-center gap-2 rounded-xl bg-[#17407E] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#143768] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              {hasPersistedRecord ? 'Salvar alterações' : 'Salvar cadastro'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
