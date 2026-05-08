'use client';

import { useCallback, useEffect, useState } from 'react';
import { CircleHelp, Loader2, ShieldCheck } from 'lucide-react';
import type {
  ExecutiveConfigurationSnapshot,
  ExecutiveProfileKey,
  ExecutiveProfilePreviewRow,
  ExecutiveProfileRule,
  ExecutiveScopeOptions,
  ExecutiveProfileWidgetConfig,
  ExecutiveUserOverride,
} from '@/lib/dashboard_executive/types';
import { ExecutiveDashboardHelpModal } from './executive-dashboard-help-modal';
import { ExecutiveDashboardOverridesTab } from './executive-dashboard-overrides-tab';
import { ExecutiveDashboardPreviewTab } from './executive-dashboard-preview-tab';
import { ExecutiveDashboardProfileVisibilityTab } from './executive-dashboard-profile-visibility-tab';
import { ExecutiveDashboardRulesTab } from './executive-dashboard-rules-tab';
import { cloneExecutiveConfig, createEmptyOverride, createEmptyRule } from './executive-dashboard-settings-utils';

type ConfigResponse = {
  status: 'success';
  data: ExecutiveConfigurationSnapshot;
};

type PreviewResponse = {
  status: 'success';
  data: ExecutiveProfilePreviewRow[];
};

type OptionsResponse = {
  status: 'success';
  data: ExecutiveScopeOptions;
};

type SectionKey = 'profiles' | 'rules' | 'overrides' | 'preview';

const SECTION_LABELS: Record<SectionKey, string> = {
  profiles: 'Perfis e widgets',
  rules: 'Regras',
  overrides: 'Overrides',
  preview: 'Preview',
};

export default function ExecutiveDashboardSettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<SectionKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SectionKey>('profiles');
  const [helpOpen, setHelpOpen] = useState(false);
  const [previewSearchTerm, setPreviewSearchTerm] = useState('');
  const [profileSearchTerm, setProfileSearchTerm] = useState('');
  const [rulesSearchTerm, setRulesSearchTerm] = useState('');
  const [overridesSearchTerm, setOverridesSearchTerm] = useState('');
  const [config, setConfig] = useState<ExecutiveConfigurationSnapshot | null>(null);
  const [previewRows, setPreviewRows] = useState<ExecutiveProfilePreviewRow[]>([]);
  const [options, setOptions] = useState<ExecutiveScopeOptions>({ departments: [], jobTitles: [], units: [], teams: [] });
  const [selectedProfileKey, setSelectedProfileKey] = useState<ExecutiveProfileKey>('diretoria_gerencia_adm');

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

    if (!configResponse.ok || !('data' in configPayload)) {
      throw new Error((configPayload as { error?: string }).error || 'Falha ao carregar a configuração executiva.');
    }

    if (!previewResponse.ok || !('data' in previewPayload)) {
      throw new Error((previewPayload as { error?: string }).error || 'Falha ao carregar o preview executivo.');
    }
    if (!optionsResponse.ok || !('data' in optionsPayload)) {
      throw new Error((optionsPayload as { error?: string }).error || 'Falha ao carregar as opções executivas.');
    }

    setConfig(cloneExecutiveConfig(configPayload.data));
    setPreviewRows(previewPayload.data);
    setOptions(optionsPayload.data);
    if (configPayload.data.profiles.length) {
      setSelectedProfileKey(configPayload.data.profiles[0].key);
    }
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
        if (!response.ok || payload?.status !== 'success') {
          throw new Error(payload?.error || 'Falha ao salvar a configuração executiva.');
        }

        setConfig(cloneExecutiveConfig(payload.data));
        setSuccessMessage(`Alterações de ${SECTION_LABELS[section].toLowerCase()} salvas com sucesso.`);
        const previewResponse = await fetch('/api/admin/dashboard/executive/config/preview', { cache: 'no-store' });
        const previewPayload = (await previewResponse.json()) as PreviewResponse | { error?: string };
        if (previewResponse.ok && 'data' in previewPayload) {
          setPreviewRows(previewPayload.data);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Falha ao salvar a configuração executiva.');
      } finally {
        setSaving(null);
      }
    },
    [config]
  );

  const handleChangeProfileWidget = useCallback(
    (profileKey: ExecutiveProfileKey, widgetKey: ExecutiveProfileWidgetConfig['widgetKey'], patch: Partial<ExecutiveProfileWidgetConfig>) => {
      setConfig((current) => {
        if (!current) return current;
        return {
          ...current,
          profileWidgets: current.profileWidgets.map((item) =>
            item.profileKey === profileKey && item.widgetKey === widgetKey ? { ...item, ...patch } : item
          ),
        };
      });
    },
    []
  );

  const handleChangeRule = useCallback((ruleId: string, patch: Partial<ExecutiveProfileRule>) => {
    setConfig((current) => {
      if (!current) return current;
      return {
        ...current,
        rules: current.rules.map((item) => (item.id === ruleId ? { ...item, ...patch } : item)),
      };
    });
  }, []);

  const handleAddRule = useCallback(() => {
    setConfig((current) => {
      if (!current || !current.profiles.length) return current;
      return {
        ...current,
        rules: [...current.rules, createEmptyRule(current.profiles[0].key)],
      };
    });
  }, []);

  const handleRemoveRule = useCallback((ruleId: string) => {
    setConfig((current) => {
      if (!current) return current;
      return { ...current, rules: current.rules.filter((item) => item.id !== ruleId) };
    });
  }, []);

  const handleAddOverride = useCallback(() => {
    setConfig((current) => {
      if (!current || !current.profiles.length) return current;
      const availableUser = previewRows.find(
        (row) => row.hasDashboardAccess && !current.overrides.some((override) => override.userId === row.userId)
      );
      if (!availableUser) return current;

      return {
        ...current,
        overrides: [...current.overrides, createEmptyOverride(availableUser.userId, current.profiles[0].key)],
      };
    });
  }, [previewRows]);

  const handleChangeOverride = useCallback((userId: string, patch: Partial<ExecutiveUserOverride>) => {
    setConfig((current) => {
      if (!current) return current;

      if (patch.userId && patch.userId !== userId) {
        const existing = current.overrides.find((item) => item.userId === userId);
        if (!existing) return current;
        return {
          ...current,
          overrides: current.overrides.map((item) =>
            item.userId === userId ? { ...existing, ...patch } : item
          ),
        };
      }

      return {
        ...current,
        overrides: current.overrides.map((item) => (item.userId === userId ? { ...item, ...patch } : item)),
      };
    });
  }, []);

  const handleRemoveOverride = useCallback((userId: string) => {
    setConfig((current) => {
      if (!current) return current;
      return { ...current, overrides: current.overrides.filter((item) => item.userId !== userId) };
    });
  }, []);

  const eligiblePreviewRows = previewRows.filter((row) => row.hasDashboardAccess && row.role !== 'INTRANET');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm text-slate-500">Carregando a governança do dashboard...</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
        {error || 'Não foi possível carregar a configuração executiva.'}
      </div>
    );
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
            <h2 className="text-xl font-bold text-slate-900">Perfis, regras e visibilidade</h2>
            <p className="max-w-3xl text-sm text-slate-500">
              Configure o que cada cargo e setor do painel pode enxergar. Usuários com função
              Intranet continuam fora desta governança e não entram no preview.
            </p>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              <CircleHelp className="h-4 w-4" />
              Ajuda desta aba
            </button>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Perfis</div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{config.profiles.length}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Regras ativas</div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{config.rules.filter((item) => item.isActive).length}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Overrides</div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{config.overrides.length}</div>
            </div>
          </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div>
      ) : null}

      {successMessage ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
          {successMessage}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(['profiles', 'rules', 'overrides', 'preview'] as SectionKey[]).map((section) => (
          <button
            key={section}
            type="button"
            onClick={() => setActiveSection(section)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${activeSection === section
                ? 'border-blue-200 bg-blue-50 text-blue-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
              }`}
          >
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
          searchTerm={profileSearchTerm}
          onSearchTermChange={setProfileSearchTerm}
          onSave={() => void persistConfig('profiles')}
          saving={saving === 'profiles'}
        />
      ) : null}

      {activeSection === 'rules' ? (
        <ExecutiveDashboardRulesTab
          config={config}
          options={options}
          onChangeRule={handleChangeRule}
          onAddRule={handleAddRule}
          onRemoveRule={handleRemoveRule}
          searchTerm={rulesSearchTerm}
          onSearchTermChange={setRulesSearchTerm}
          onSave={() => void persistConfig('rules')}
          saving={saving === 'rules'}
        />
      ) : null}

      {activeSection === 'overrides' ? (
        <ExecutiveDashboardOverridesTab
          config={config}
          previewRows={eligiblePreviewRows}
          options={options}
          onAddOverride={handleAddOverride}
          onChangeOverride={handleChangeOverride}
          onRemoveOverride={handleRemoveOverride}
          searchTerm={overridesSearchTerm}
          onSearchTermChange={setOverridesSearchTerm}
          onSave={() => void persistConfig('overrides')}
          saving={saving === 'overrides'}
        />
      ) : null}

      {activeSection === 'preview' ? (
        <ExecutiveDashboardPreviewTab
          previewRows={eligiblePreviewRows}
          searchTerm={previewSearchTerm}
          onSearchTermChange={setPreviewSearchTerm}
          hasActiveRules={config.rules.some((rule) => rule.isActive)}
        />
      ) : null}

      <ExecutiveDashboardHelpModal open={helpOpen} section={activeSection} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
