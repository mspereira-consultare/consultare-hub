'use client';

import { useCallback, useEffect, useState } from 'react';
import { CircleHelp, Loader2, ShieldCheck } from 'lucide-react';
import type {
  ExecutiveConfigurationSnapshot,
  ExecutiveGroupDefinition,
  ExecutiveProfileKey,
  ExecutiveProfilePreviewRow,
  ExecutiveProfileWidgetConfig,
  ExecutiveScopeOptions,
  ExecutiveUserException,
} from '@/lib/dashboard_executive/types';
import { ExecutiveDashboardGroupsTab } from './executive-dashboard-groups-tab';
import { ExecutiveDashboardHelpModal } from './executive-dashboard-help-modal';
import { ExecutiveDashboardJobTitlesTab } from './executive-dashboard-job-titles-tab';
import { ExecutiveDashboardOverridesTab } from './executive-dashboard-overrides-tab';
import { ExecutiveDashboardPreviewTab } from './executive-dashboard-preview-tab';
import { ExecutiveDashboardProfileVisibilityTab } from './executive-dashboard-profile-visibility-tab';
import { cloneExecutiveConfig, createEmptyException, createEmptyGroup } from './executive-dashboard-settings-utils';

type ConfigResponse = { status: 'success'; data: ExecutiveConfigurationSnapshot };
type PreviewResponse = { status: 'success'; data: ExecutiveProfilePreviewRow[] };
type OptionsResponse = { status: 'success'; data: ExecutiveScopeOptions };
type SectionKey = 'profiles' | 'groups' | 'job_titles' | 'exceptions' | 'preview';

const SECTION_LABELS: Record<SectionKey, string> = {
  profiles: 'Perfis e widgets',
  groups: 'Grupos',
  job_titles: 'Cargos',
  exceptions: 'Exceções',
  preview: 'Preview',
};

export default function ExecutiveDashboardSettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<SectionKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SectionKey>('profiles');
  const [helpOpen, setHelpOpen] = useState(false);
  const [config, setConfig] = useState<ExecutiveConfigurationSnapshot | null>(null);
  const [previewRows, setPreviewRows] = useState<ExecutiveProfilePreviewRow[]>([]);
  const [options, setOptions] = useState<ExecutiveScopeOptions>({ departments: [], jobTitles: [], units: [], teams: [] });
  const [selectedProfileKey, setSelectedProfileKey] = useState<ExecutiveProfileKey>('diretoria_gerencia_adm');
  const [searchTerms, setSearchTerms] = useState<Record<SectionKey, string>>({
    profiles: '',
    groups: '',
    job_titles: '',
    exceptions: '',
    preview: '',
  });

  const loadData = useCallback(async () => {
    setError(null);
    const [configResponse, previewResponse, optionsResponse] = await Promise.all([
      fetch('/api/admin/dashboard/executive/config', { cache: 'no-store' }),
      fetch('/api/admin/dashboard/executive/config/preview', { cache: 'no-store' }),
      fetch('/api/admin/dashboard/executive/config/options', { cache: 'no-store' }),
    ]);

    const configPayload = (await configResponse.json()) as ConfigResponse | { error?: string };
    const previewPayload = (await previewResponse.json()) as PreviewResponse | { error?: string };
    const optionsPayload = (await optionsResponse.json()) as OptionsResponse | { error?: string };

    if (!configResponse.ok || !('data' in configPayload)) throw new Error((configPayload as any).error || 'Falha ao carregar a configuração executiva.');
    if (!previewResponse.ok || !('data' in previewPayload)) throw new Error((previewPayload as any).error || 'Falha ao carregar o preview executivo.');
    if (!optionsResponse.ok || !('data' in optionsPayload)) throw new Error((optionsPayload as any).error || 'Falha ao carregar as opções executivas.');

    setConfig(cloneExecutiveConfig(configPayload.data));
    setPreviewRows(previewPayload.data);
    setOptions(optionsPayload.data);
    if (configPayload.data.profiles.length) setSelectedProfileKey(configPayload.data.profiles[0].key);
  }, []);

  useEffect(() => {
    loadData()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Falha ao carregar a configuração executiva.'))
      .finally(() => setLoading(false));
  }, [loadData]);

  const persistConfig = useCallback(
    async (section: SectionKey) => {
      if (!config) return;
      setSaving(section);
      setError(null);
      setSuccessMessage(null);
      try {
        const response = await fetch('/api/admin/dashboard/executive/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config }),
        });
        const payload = await response.json();
        if (!response.ok || payload?.status !== 'success') throw new Error(payload?.error || 'Falha ao salvar a configuração executiva.');
        setConfig(cloneExecutiveConfig(payload.data));
        setSuccessMessage(`Alterações de ${SECTION_LABELS[section].toLowerCase()} salvas com sucesso.`);
        const previewResponse = await fetch('/api/admin/dashboard/executive/config/preview', { cache: 'no-store' });
        const previewPayload = (await previewResponse.json()) as PreviewResponse | { error?: string };
        if (previewResponse.ok && 'data' in previewPayload) setPreviewRows(previewPayload.data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Falha ao salvar a configuração executiva.');
      } finally {
        setSaving(null);
      }
    },
    [config]
  );

  const setSectionSearch = (section: SectionKey, value: string) => setSearchTerms((current) => ({ ...current, [section]: value }));

  const handleChangeProfileWidget = useCallback((profileKey: ExecutiveProfileKey, widgetKey: ExecutiveProfileWidgetConfig['widgetKey'], patch: Partial<ExecutiveProfileWidgetConfig>) => {
    setConfig((current) => current ? { ...current, profileWidgets: current.profileWidgets.map((item) => item.profileKey === profileKey && item.widgetKey === widgetKey ? { ...item, ...patch } : item) } : current);
  }, []);

  const handleAddGroup = useCallback(() => {
    setConfig((current) => current && current.profiles.length ? { ...current, groups: [...current.groups, createEmptyGroup(current.profiles[0].key)] } : current);
  }, []);
  const handleChangeGroup = useCallback((groupId: string, patch: Partial<ExecutiveGroupDefinition>) => {
    setConfig((current) => current ? { ...current, groups: current.groups.map((item) => item.id === groupId ? { ...item, ...patch } : item) } : current);
  }, []);
  const handleRemoveGroup = useCallback((groupId: string) => {
    setConfig((current) => current ? { ...current, groups: current.groups.filter((item) => item.id !== groupId), jobTitles: current.jobTitles.map((item) => item.executiveGroupId === groupId ? { ...item, executiveGroupId: null, executiveGroupKey: null, executiveGroupLabel: null } : item) } : current);
  }, []);

  const handleChangeJobTitleGroup = useCallback((catalogId: string, groupId: string | null) => {
    setConfig((current) => {
      if (!current) return current;
      const group = current.groups.find((item) => item.id === groupId) || null;
      return {
        ...current,
        jobTitles: current.jobTitles.map((item) => item.catalogId === catalogId ? { ...item, executiveGroupId: groupId, executiveGroupKey: group?.key || null, executiveGroupLabel: group?.label || null } : item),
      };
    });
  }, []);

  const handleAddException = useCallback(() => {
    setConfig((current) => {
      if (!current || !current.profiles.length) return current;
      const availableUser = previewRows.find((row) => row.hasDashboardAccess && !current.userExceptions.some((item) => item.userId === row.userId));
      if (!availableUser) return current;
      return { ...current, userExceptions: [...current.userExceptions, createEmptyException(availableUser.userId, current.profiles[0].key)] };
    });
  }, [previewRows]);

  const handleChangeException = useCallback((userId: string, patch: Partial<ExecutiveUserException>) => {
    setConfig((current) => {
      if (!current) return current;
      if (patch.userId && patch.userId !== userId) {
        const currentException = current.userExceptions.find((item) => item.userId === userId);
        if (!currentException) return current;
        return { ...current, userExceptions: current.userExceptions.map((item) => item.userId === userId ? { ...currentException, ...patch } : item) };
      }
      return { ...current, userExceptions: current.userExceptions.map((item) => item.userId === userId ? { ...item, ...patch } : item) };
    });
  }, []);
  const handleRemoveException = useCallback((userId: string) => {
    setConfig((current) => current ? { ...current, userExceptions: current.userExceptions.filter((item) => item.userId !== userId) } : current);
  }, []);

  const eligiblePreviewRows = previewRows.filter((row) => row.hasDashboardAccess && row.role !== 'INTRANET');

  if (loading) {
    return <div className="flex items-center justify-center py-16"><div className="flex flex-col items-center gap-3"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /><p className="text-sm text-slate-500">Carregando a governança do dashboard...</p></div></div>;
  }
  if (!config) {
    return <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error || 'Não foi possível carregar a configuração executiva.'}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
              <ShieldCheck className="h-4 w-4" />
              Governança do dashboard
            </div>
            <h2 className="text-xl font-bold text-slate-900">Perfis, grupos e exceções individuais</h2>
            <p className="max-w-3xl text-sm text-slate-500">
              Configure a visão executiva a partir do vínculo com colaborador, cargo mestre, grupo executivo e exceções individuais.
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <button type="button" onClick={() => setHelpOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">
              <CircleHelp className="h-4 w-4" />
              Ajuda desta aba
            </button>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Perfis</div><div className="mt-2 text-2xl font-bold text-slate-900">{config.profiles.length}</div></div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Grupos</div><div className="mt-2 text-2xl font-bold text-slate-900">{config.groups.filter((item) => item.isActive).length}</div></div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cargos sem grupo</div><div className="mt-2 text-2xl font-bold text-slate-900">{config.jobTitles.filter((item) => !item.executiveGroupId).length}</div></div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Exceções</div><div className="mt-2 text-2xl font-bold text-slate-900">{config.userExceptions.length}</div></div>
            </div>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}
      {successMessage ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{successMessage}</div> : null}

      <div className="flex flex-wrap gap-2">
        {(['profiles', 'groups', 'job_titles', 'exceptions', 'preview'] as SectionKey[]).map((section) => (
          <button key={section} type="button" onClick={() => setActiveSection(section)} className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${activeSection === section ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}>
            {SECTION_LABELS[section]}
          </button>
        ))}
      </div>

      {activeSection === 'profiles' ? (
        <ExecutiveDashboardProfileVisibilityTab
          config={config}
          selectedProfileKey={selectedProfileKey}
          onSelectProfile={setSelectedProfileKey}
          onChangeProfileWidget={handleChangeProfileWidget}
          searchTerm={searchTerms.profiles}
          onSearchTermChange={(value) => setSectionSearch('profiles', value)}
          onSave={() => void persistConfig('profiles')}
          saving={saving === 'profiles'}
        />
      ) : null}
      {activeSection === 'groups' ? (
        <ExecutiveDashboardGroupsTab
          config={config}
          options={options}
          onAddGroup={handleAddGroup}
          onChangeGroup={handleChangeGroup}
          onRemoveGroup={handleRemoveGroup}
          searchTerm={searchTerms.groups}
          onSearchTermChange={(value) => setSectionSearch('groups', value)}
          onSave={() => void persistConfig('groups')}
          saving={saving === 'groups'}
        />
      ) : null}
      {activeSection === 'job_titles' ? (
        <ExecutiveDashboardJobTitlesTab
          config={config}
          searchTerm={searchTerms.job_titles}
          onSearchTermChange={(value) => setSectionSearch('job_titles', value)}
          onChangeJobTitleGroup={handleChangeJobTitleGroup}
          onSave={() => void persistConfig('job_titles')}
          saving={saving === 'job_titles'}
        />
      ) : null}
      {activeSection === 'exceptions' ? (
        <ExecutiveDashboardOverridesTab
          config={config}
          previewRows={eligiblePreviewRows}
          options={options}
          onAddException={handleAddException}
          onChangeException={handleChangeException}
          onRemoveException={handleRemoveException}
          searchTerm={searchTerms.exceptions}
          onSearchTermChange={(value) => setSectionSearch('exceptions', value)}
          onSave={() => void persistConfig('exceptions')}
          saving={saving === 'exceptions'}
        />
      ) : null}
      {activeSection === 'preview' ? (
        <ExecutiveDashboardPreviewTab
          previewRows={eligiblePreviewRows}
          searchTerm={searchTerms.preview}
          onSearchTermChange={(value) => setSectionSearch('preview', value)}
        />
      ) : null}

      <ExecutiveDashboardHelpModal open={helpOpen} section={activeSection as any} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
