'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardCopy, Loader2, MessageCircle, PhoneCall, RefreshCw, Save, Timer, Target, Users } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { hasPermission } from '@/lib/permissions';

type ChecklistData = {
  dateRef: string;
  reportTimestamp: string;
  metaDia: number;
  agendamentosTotal: number;
  agendamentosCrc: number;
  agendamentosOnline: number;
  ligacoesRealizadas: number;
  solicitacoesWhatsappCrc: number;
  conversaoPct: number;
  taxaAbandono: string;
  tempoMedioEsperaMin: number;
  reportText: string;
  sources: {
    whatsappSheetOk: boolean;
    whatsappSheetError?: string;
    centralWaitUpdatedAt?: string | null;
  };
};

type ServiceStatus = {
  service_name: string;
  status: string;
  last_run: string | null;
  details: string | null;
};

const toInt = (value: string) => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
};

const formatPercent = (value: number) => `${value.toFixed(1).replace('.', ',')}%`;

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

export default function ChecklistCrcPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ChecklistData | null>(null);
  const [statusInfo, setStatusInfo] = useState<{ finance?: ServiceStatus; clinia?: ServiceStatus }>({});

  const [callsInput, setCallsInput] = useState('0');
  const [abandonInput, setAbandonInput] = useState('');
  const role = String((session?.user as any)?.role || 'OPERADOR');
  const permissions = (session?.user as any)?.permissions;
  const canEdit = hasPermission(permissions, 'checklist_crc', 'edit', role);
  const canRefresh = hasPermission(permissions, 'checklist_crc', 'refresh', role);

  const fetchData = async (forceFresh = false) => {
    if (!data) setLoading(true);
    setError(null);
    try {
      const refreshQ = forceFresh ? `?refresh=${Date.now()}` : '';
      const res = await fetch(`/api/admin/checklist/crc${refreshQ}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') {
        throw new Error(json?.error || 'Falha ao carregar checklist');
      }

      const payload: ChecklistData = json.data;
      setData(payload);
      setCallsInput(String(payload.ligacoesRealizadas || 0));
      setAbandonInput(String(payload.taxaAbandono || ''));
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
    const finance = list.find((s) => normalize(s.service_name) === 'financeiro');
    const clinia = list.find((s) => normalize(s.service_name) === 'clinia');
    setStatusInfo({ finance, clinia });

    const pending = ['pending', 'running'];
    const isFinanceBusy = finance ? pending.includes(normalize(finance.status)) : false;
    const isCliniaBusy = clinia ? pending.includes(normalize(clinia.status)) : false;
    return isFinanceBusy || isCliniaBusy;
  };

  const triggerWorkerRefresh = async () => {
    if (!canRefresh) {
      setError('Sem permissao para atualizar dados desta pagina.');
      return;
    }
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
          body: JSON.stringify({ service: 'clinia' }),
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
    fetchData();
    loadWorkerStatus().catch(() => null);
  }, []);

  const reportText = useMemo(() => {
    if (!data) return '';

    const calls = toInt(callsInput);
    const denom = calls + (data.solicitacoesWhatsappCrc || 0);
    const dynamicConversion = denom > 0 ? (data.agendamentosCrc / denom) * 100 : 0;

    return [
      `segue o hora x hora CRC: ${data.reportTimestamp}`,
      `Meta do dia: ${data.metaDia}`,
      `Agendamentos total: ${data.agendamentosTotal}`,
      `Agendamento CRC: ${data.agendamentosCrc}`,
      `Agendamento online/Robô: ${data.agendamentosOnline}`,
      `Conversão: ${formatPercent(dynamicConversion)}`,
      `Abandono: ${abandonInput || '-'}`,
      `Tempo médio de espera: ${data.tempoMedioEsperaMin} minutos`,
    ].join('\n');
  }, [data, callsInput, abandonInput]);

  const handleSave = async () => {
    if (!canEdit) {
      setError('Sem permissao de edicao para este checklist.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/checklist/crc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callsMade: toInt(callsInput),
          abandonRate: abandonInput,
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') {
        throw new Error(json?.error || 'Falha ao salvar checklist');
      }
      await fetchData();
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
          Carregando Checklist CRC...
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-slate-50 min-h-screen flex flex-col gap-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Checklist CRC</h1>
            <p className="text-slate-500 text-sm mt-1">Resumo operacional do dia para envio rápido via WhatsApp.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={triggerWorkerRefresh}
              disabled={updating || !canRefresh}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {updating ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />} {updating ? 'Atualizando...' : 'Atualizar'}
            </button>
            <button
              onClick={handleCopy}
              disabled={!data || copying}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-60"
            >
              {copying ? <Loader2 className="animate-spin" size={14} /> : <ClipboardCopy size={14} />}
              Copiar relatório
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
      {!canEdit && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-amber-800 text-sm">
          Voce possui acesso somente leitura nesta pagina. Edicao e salvamento estao desativados.
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard title="Meta do Dia" value={data.metaDia} icon={<Target size={16} />} />
            <StatCard title="Agendamentos Total" value={data.agendamentosTotal} icon={<Users size={16} />} />
            <StatCard title="Agendamentos CRC" value={data.agendamentosCrc} icon={<Users size={16} />} />
            <StatCard title="Online / Robô" value={data.agendamentosOnline} icon={<Users size={16} />} />
          </div>

          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-4">
            <span>
              Worker agendamentos: <strong>{statusInfo.finance?.status || 'N/A'}</strong>
              {statusInfo.finance?.last_run ? ` | ${String(statusInfo.finance.last_run)}` : ''}
            </span>
            <span>
              Worker Clinia: <strong>{statusInfo.clinia?.status || 'N/A'}</strong>
              {statusInfo.clinia?.last_run ? ` | ${String(statusInfo.clinia.last_run)}` : ''}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <label className="text-xs uppercase tracking-wide font-semibold text-slate-500 block mb-2">
                Ligações realizadas (hoje)
              </label>
              <input
                type="number"
                min={0}
                value={callsInput}
                onChange={(e) => setCallsInput(e.target.value)}
                disabled={!canEdit}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800"
              />
            </div>

            <StatCard
              title="Solicitações WhatsApp CRC"
              value={data.solicitacoesWhatsappCrc}
              helper={data.sources.whatsappSheetOk ? 'Origem: planilha Google' : `Planilha indisponível: ${data.sources.whatsappSheetError || 'erro'}`}
              icon={<MessageCircle size={16} />}
            />

            <StatCard
              title="Conversão CRC"
              value={formatPercent((data.agendamentosCrc / Math.max(1, toInt(callsInput) + data.solicitacoesWhatsappCrc)) * 100)}
              helper="Agend. CRC / (Ligações + Solicitações WhatsApp)"
              icon={<PhoneCall size={16} />}
            />

            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <label className="text-xs uppercase tracking-wide font-semibold text-slate-500 block mb-2">
                Taxa de abandono
              </label>
              <input
                type="text"
                placeholder="Ex.: 5,3%"
                value={abandonInput}
                onChange={(e) => setAbandonInput(e.target.value)}
                disabled={!canEdit}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatCard
              title="Tempo Médio de Espera"
              value={`${data.tempoMedioEsperaMin} min`}
              helper="Grupo Central de relacionamento"
              icon={<Timer size={16} />}
            />
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-end justify-between">
              <div>
                <h3 className="text-xs uppercase tracking-wide font-semibold text-slate-500 mb-1">Prévia do relatório</h3>
                <pre className="text-xs text-slate-700 whitespace-pre-wrap leading-5">{reportText}</pre>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !canEdit}
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

