'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ClipboardCopy,
  Loader2,
  MessageCircle,
  RefreshCw,
  Save,
  DollarSign,
  Target,
  FileText,
  CalendarCheck,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

type UnitOption = { key: string; label: string };

type ChecklistData = {
  dateRef: string;
  reportTimestamp: string;
  unitKey: string;
  unitLabel: string;
  faturamentoDia: number;
  faturamentoMes: number;
  ticketMedioDia: number;
  metaMensal: number;
  percentualMetaAtingida: number;
  metaResolveTarget: number;
  metaResolveRealizado: number;
  metaCheckupTarget: number;
  metaCheckupRealizado: number;
  orcamentosEmAberto: number;
  notasFiscaisEmitidas: string;
  contasEmAbertoStatus: string;
  confirmacoesAmanhaPct: number;
  confirmacoesAmanhaTotal: number;
  confirmacoesAmanhaConfirmadas: number;
  googleRating: string;
  googleComentarios: string;
  pendenciasUrgentes: string;
  situacoesCriticas: string;
  situacaoPrazo: string;
  situacaoResponsavel: string;
  acoesRealizadas: string;
  reportText: string;
  sources: {
    sheetOk: boolean;
    sheetError?: string;
  };
};

type ServiceStatus = {
  service_name: string;
  status: string;
  last_run: string | null;
  details: string | null;
};

const FALLBACK_UNITS: UnitOption[] = [
  { key: 'campinas_shopping', label: 'Campinas Shopping' },
  { key: 'centro_cambui', label: 'Centro Cambui' },
  { key: 'ouro_verde', label: 'Ouro Verde' },
  { key: 'resolve', label: 'Resolve' },
];

const toInt = (value: string | number) => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const formatPercent = (value: number) => `${Number(value || 0).toFixed(1).replace('.', ',')}%`;

const StatCard = ({ title, value, helper, icon }: { title: string; value: string | number; helper?: string; icon: React.ReactNode }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-xs uppercase tracking-wide font-semibold text-slate-500">{title}</h3>
      <div className="text-slate-400">{icon}</div>
    </div>
    <div className="text-2xl font-bold text-slate-800 leading-none">{value}</div>
    {helper && <p className="text-xs text-slate-500 mt-2">{helper}</p>}
  </div>
);

export default function ChecklistRecepcaoPage() {
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ChecklistData | null>(null);
  const [units, setUnits] = useState<UnitOption[]>(FALLBACK_UNITS);
  const [selectedUnit, setSelectedUnit] = useState<string>('campinas_shopping');
  const [statusInfo, setStatusInfo] = useState<{ financeiro?: ServiceStatus; faturamento?: ServiceStatus; comercial?: ServiceStatus }>({});

  const [metaResolveTarget, setMetaResolveTarget] = useState('0');
  const [metaCheckupTarget, setMetaCheckupTarget] = useState('0');
  const [notasFiscaisEmitidas, setNotasFiscaisEmitidas] = useState('');
  const [contasEmAbertoStatus, setContasEmAbertoStatus] = useState('');
  const [googleRating, setGoogleRating] = useState('');
  const [googleComentarios, setGoogleComentarios] = useState('');
  const [pendenciasUrgentes, setPendenciasUrgentes] = useState('');
  const [situacoesCriticas, setSituacoesCriticas] = useState('');
  const [situacaoPrazo, setSituacaoPrazo] = useState('');
  const [situacaoResponsavel, setSituacaoResponsavel] = useState('');
  const [acoesRealizadas, setAcoesRealizadas] = useState('');

  const fetchData = async (forceFresh = false, unitOverride?: string) => {
    if (!data) setLoading(true);
    setError(null);
    const unitKey = unitOverride || selectedUnit;
    try {
      const refreshQ = forceFresh ? `&refresh=${Date.now()}` : '';
      const res = await fetch(`/api/admin/checklist/recepcao?unit=${encodeURIComponent(unitKey)}${refreshQ}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') {
        throw new Error(json?.error || 'Falha ao carregar checklist');
      }

      const payload: ChecklistData = json.data;
      const nextUnits = Array.isArray(json.units) && json.units.length > 0 ? json.units : FALLBACK_UNITS;
      setUnits(nextUnits);
      setData(payload);

      setMetaResolveTarget(String(payload.metaResolveTarget || 0));
      setMetaCheckupTarget(String(payload.metaCheckupTarget || 0));
      setNotasFiscaisEmitidas(String(payload.notasFiscaisEmitidas || ''));
      setContasEmAbertoStatus(String(payload.contasEmAbertoStatus || ''));
      setGoogleRating(String(payload.googleRating || ''));
      setGoogleComentarios(String(payload.googleComentarios || ''));
      setPendenciasUrgentes(String(payload.pendenciasUrgentes || ''));
      setSituacoesCriticas(String(payload.situacoesCriticas || ''));
      setSituacaoPrazo(String(payload.situacaoPrazo || ''));
      setSituacaoResponsavel(String(payload.situacaoResponsavel || ''));
      setAcoesRealizadas(String(payload.acoesRealizadas || ''));
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const loadWorkerStatus = async (forceFresh = false) => {
    const refreshQ = forceFresh ? `?refresh=${Date.now()}` : '';
    const res = await fetch(`/api/admin/status${refreshQ}`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok || !Array.isArray(json)) {
      throw new Error('Falha ao consultar status dos workers');
    }

    const normalize = (v: string) => String(v || '').trim().toLowerCase();
    const list = json as ServiceStatus[];
    const financeiro = list.find((s) => normalize(s.service_name) === 'financeiro');
    const faturamento = list.find((s) => normalize(s.service_name) === 'faturamento');
    const comercial = list.find((s) => normalize(s.service_name) === 'comercial');
    setStatusInfo({ financeiro, faturamento, comercial });

    const pending = ['pending', 'running'];
    const isBusy = [financeiro, faturamento, comercial].some((s) => (s ? pending.includes(normalize(s.status)) : false));
    return isBusy;
  };

  const triggerWorkerRefresh = async () => {
    setUpdating(true);
    setError(null);
    try {
      await Promise.all([
        fetch('/api/admin/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ service: 'financeiro' }),
        }),
        fetch('/api/admin/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ service: 'faturamento' }),
        }),
        fetch('/api/admin/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ service: 'comercial' }),
        }),
      ]);

      let attempts = 0;
      const maxAttempts = 40;
      while (attempts < maxAttempts) {
        attempts += 1;
        const stillRunning = await loadWorkerStatus(true);
        if (!stillRunning) break;
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      await fetchData(true);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    fetchData(false, selectedUnit);
    loadWorkerStatus().catch(() => null);
  }, [selectedUnit]);

  const reportText = useMemo(() => {
    if (!data) return '';
    const resolveTarget = toInt(metaResolveTarget);
    const checkupTarget = toInt(metaCheckupTarget);
    return [
      `CHECKLIST DIARIO - UNIDADE ${data.unitLabel.toUpperCase()} (${data.dateRef})`,
      `Horario: ${data.reportTimestamp}`,
      `Financeiro`,
      `Faturamento do dia: ${formatCurrency(data.faturamentoDia)}`,
      `Faturamento acumulado no mes: ${formatCurrency(data.faturamentoMes)}`,
      `% da meta atingida: ${formatPercent(data.percentualMetaAtingida)}`,
      `Meta Resolve: ${data.metaResolveRealizado}/${resolveTarget}`,
      `Meta Check-up: ${data.metaCheckupRealizado}/${checkupTarget}`,
      `Ticket medio: ${formatCurrency(data.ticketMedioDia)}`,
      `Orcamentos em aberto: ${formatCurrency(data.orcamentosEmAberto)}`,
      `Notas fiscais emitidas: ${notasFiscaisEmitidas || '-'}`,
      `Contas em aberto: ${contasEmAbertoStatus || '-'}`,
      `Confirmacao das agendas do dia seguinte: ${formatPercent(data.confirmacoesAmanhaPct)} (${data.confirmacoesAmanhaConfirmadas}/${data.confirmacoesAmanhaTotal})`,
      `Avaliacao no Google e comentarios: ${googleRating || '-'}${googleComentarios ? ` | ${googleComentarios}` : ''}`,
      `Pendencias Urgentes: ${pendenciasUrgentes || '-'}`,
      `Situacoes criticas a resolver: ${situacoesCriticas || '-'}${situacaoPrazo ? ` | Prazo: ${situacaoPrazo}` : ''}${situacaoResponsavel ? ` | Responsavel: ${situacaoResponsavel}` : ''}`,
      `Acoes realizadas: ${acoesRealizadas || '-'}`,
    ].join('\n');
  }, [
    data,
    metaResolveTarget,
    metaCheckupTarget,
    notasFiscaisEmitidas,
    contasEmAbertoStatus,
    googleRating,
    googleComentarios,
    pendenciasUrgentes,
    situacoesCriticas,
    situacaoPrazo,
    situacaoResponsavel,
    acoesRealizadas,
  ]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/checklist/recepcao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitKey: selectedUnit,
          metaResolveTarget: toInt(metaResolveTarget),
          metaCheckupTarget: toInt(metaCheckupTarget),
          notasFiscaisEmitidas,
          contasEmAbertoStatus,
          googleRating,
          googleComentarios,
          pendenciasUrgentes,
          situacoesCriticas,
          situacaoPrazo,
          situacaoResponsavel,
          acoesRealizadas,
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') {
        throw new Error(json?.error || 'Falha ao salvar checklist');
      }
      await fetchData(true);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!reportText) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(reportText);
    } finally {
      setCopying(false);
    }
  };

  const handleOpenWhatsApp = () => {
    if (!reportText) return;
    const encoded = encodeURIComponent(reportText);
    window.open(`https://wa.me/?text=${encoded}`, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <div className="p-6 min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-700">
          <Loader2 className="animate-spin" size={16} />
          Carregando Checklist Recepção...
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-slate-50 min-h-screen flex flex-col gap-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Checklist Recepção</h1>
            <p className="text-slate-500 text-sm mt-1">Checklist diário por unidade para compartilhamento rápido.</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
            >
              {units.map((u) => (
                <option key={u.key} value={u.key}>
                  {u.label}
                </option>
              ))}
            </select>
            <button
              onClick={triggerWorkerRefresh}
              disabled={updating}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {updating ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />} {updating ? 'Atualizando...' : 'Atualizar'}
            </button>
            <button
              onClick={handleCopy}
              disabled={!data || copying}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-60"
            >
              {copying ? <Loader2 className="animate-spin" size={14} /> : <ClipboardCopy size={14} />} Copiar relatório
            </button>
            <button
              onClick={handleOpenWhatsApp}
              disabled={!data}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
            >
              <MessageCircle size={14} /> Abrir WhatsApp
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard title="Faturamento do Dia" value={formatCurrency(data.faturamentoDia)} icon={<DollarSign size={16} />} />
            <StatCard title="Faturamento Mês (Acumulado)" value={formatCurrency(data.faturamentoMes)} icon={<DollarSign size={16} />} />
            <StatCard title="% Meta Atingida" value={formatPercent(data.percentualMetaAtingida)} helper={`Meta: ${formatCurrency(data.metaMensal)}`} icon={<Target size={16} />} />
            <StatCard title="Ticket Médio (Dia)" value={formatCurrency(data.ticketMedioDia)} icon={<DollarSign size={16} />} />
          </div>

          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-4">
            <span>Worker Feegow: <strong>{statusInfo.financeiro?.status || 'N/A'}</strong>{statusInfo.financeiro?.last_run ? ` | ${String(statusInfo.financeiro.last_run)}` : ''}</span>
            <span>Worker Faturamento: <strong>{statusInfo.faturamento?.status || 'N/A'}</strong>{statusInfo.faturamento?.last_run ? ` | ${String(statusInfo.faturamento.last_run)}` : ''}</span>
            <span>Worker Propostas: <strong>{statusInfo.comercial?.status || 'N/A'}</strong>{statusInfo.comercial?.last_run ? ` | ${String(statusInfo.comercial.last_run)}` : ''}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <label className="text-xs uppercase tracking-wide font-semibold text-slate-500 block mb-2">Meta Resolve</label>
              <input
                type="number"
                min={0}
                value={metaResolveTarget}
                onChange={(e) => setMetaResolveTarget(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800"
              />
              <p className="text-xs text-slate-500 mt-2">Realizado hoje: {data.metaResolveRealizado}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <label className="text-xs uppercase tracking-wide font-semibold text-slate-500 block mb-2">Meta Check-up</label>
              <input
                type="number"
                min={0}
                value={metaCheckupTarget}
                onChange={(e) => setMetaCheckupTarget(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800"
              />
              <p className="text-xs text-slate-500 mt-2">Realizado hoje: {data.metaCheckupRealizado}</p>
            </div>
            <StatCard title="Orçamentos em Aberto" value={formatCurrency(data.orcamentosEmAberto)} icon={<FileText size={16} />} />
            <StatCard
              title="Confirmação Agenda D+1"
              value={formatPercent(data.confirmacoesAmanhaPct)}
              helper={`${data.confirmacoesAmanhaConfirmadas}/${data.confirmacoesAmanhaTotal} confirmados`}
              icon={<CalendarCheck size={16} />}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <label className="text-xs uppercase tracking-wide font-semibold text-slate-500 block mb-2">Notas fiscais emitidas</label>
              <select
                value={notasFiscaisEmitidas}
                onChange={(e) => setNotasFiscaisEmitidas(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800"
              >
                <option value="">Selecione</option>
                <option value="Validado">Validado</option>
                <option value="Não Validado">Não Validado</option>
              </select>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <label className="text-xs uppercase tracking-wide font-semibold text-slate-500 block mb-2">Contas em aberto</label>
              <select
                value={contasEmAbertoStatus}
                onChange={(e) => setContasEmAbertoStatus(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800"
              >
                <option value="">Selecione</option>
                <option value="Validado">Validado</option>
                <option value="Não Validado">Não Validado</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <label className="text-xs uppercase tracking-wide font-semibold text-slate-500 block mb-2">Avaliação no Google (estrelas)</label>
              <input
                type="text"
                value={googleRating}
                onChange={(e) => setGoogleRating(e.target.value)}
                placeholder="Ex.: 4,3"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 mb-3"
              />
              <label className="text-xs uppercase tracking-wide font-semibold text-slate-500 block mb-2">Comentários</label>
              <textarea
                value={googleComentarios}
                onChange={(e) => setGoogleComentarios(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800"
              />
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <label className="text-xs uppercase tracking-wide font-semibold text-slate-500 block mb-2">Pendências urgentes</label>
              <textarea
                value={pendenciasUrgentes}
                onChange={(e) => setPendenciasUrgentes(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
            <h3 className="text-xs uppercase tracking-wide font-semibold text-slate-500 flex items-center gap-2">
              <AlertTriangle size={14} /> Situações críticas a resolver
            </h3>
            <textarea
              value={situacoesCriticas}
              onChange={(e) => setSituacoesCriticas(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Prazo</label>
                <input
                  type="date"
                  value={situacaoPrazo}
                  onChange={(e) => setSituacaoPrazo(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Responsável</label>
                <input
                  type="text"
                  value={situacaoResponsavel}
                  onChange={(e) => setSituacaoResponsavel(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <h3 className="text-xs uppercase tracking-wide font-semibold text-slate-500 flex items-center gap-2 mb-2">
              <CheckCircle2 size={14} /> Ações realizadas
            </h3>
            <textarea
              value={acoesRealizadas}
              onChange={(e) => setAcoesRealizadas(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h3 className="text-xs uppercase tracking-wide font-semibold text-slate-500 mb-1">Prévia do relatório</h3>
              <pre className="text-xs text-slate-700 whitespace-pre-wrap leading-5">{reportText}</pre>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h3 className="text-xs uppercase tracking-wide font-semibold text-slate-500 mb-2 flex items-center gap-2">
                <ShieldCheck size={14} /> Fonte da planilha
              </h3>
              <p className="text-sm text-slate-700">
                {data.sources.sheetOk ? 'Planilha Google lida com sucesso.' : `Falha ao ler planilha: ${data.sources.sheetError || 'erro'}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} Salvar campos manuais
            </button>
            <span className="text-xs text-slate-500">Os valores salvos ficam visíveis para todos os usuários.</span>
          </div>
        </>
      )}
    </div>
  );
}

