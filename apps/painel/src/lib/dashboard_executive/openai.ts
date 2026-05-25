import {
  EXECUTIVE_PROFILE_DEFINITIONS,
  EXECUTIVE_WIDGET_DEFINITIONS,
} from '@/lib/dashboard_executive/catalog';
import type {
  ExecutiveAiSummary,
  ExecutiveAreaKey,
  ExecutiveIndicatorStatus,
  ExecutiveMetricsPayload,
} from '@/lib/dashboard_executive/types';

const OPENAI_API_URL = 'https://api.openai.com/v1';
const EXECUTIVE_MODEL = String(process.env.OPENAI_EXECUTIVE_MODEL || process.env.OPENAI_CHAT_MODEL || 'gpt-5.5').trim() || 'gpt-5.5';
const OPENAI_BASE_URL = String(process.env.OPENAI_BASE_URL || '').trim();

const requireOpenAiKey = () => {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    const error = new Error('OPENAI_API_KEY não configurada para a leitura executiva do dashboard.');
    (error as Error & { status?: number }).status = 503;
    throw error;
  }
  return apiKey;
};

const parseOpenAiError = async (response: Response) => {
  try {
    const json = await response.json();
    return String(json?.error?.message || json?.error || `Falha HTTP ${response.status}`);
  } catch {
    return `Falha HTTP ${response.status}`;
  }
};

const extractResponseText = (payload: any) => {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const textParts: string[] = [];
  for (const outputItem of Array.isArray(payload?.output) ? payload.output : []) {
    for (const contentItem of Array.isArray(outputItem?.content) ? outputItem.content : []) {
      if (contentItem?.type === 'output_text' && typeof contentItem?.text === 'string') {
        textParts.push(contentItem.text);
      }
    }
  }

  return textParts.join('\n').trim();
};

const sanitizeJsonCandidate = (text: string) => {
  const trimmed = String(text || '').trim();
  if (!trimmed) return trimmed;

  const withoutFences = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const firstBrace = withoutFences.indexOf('{');
  const lastBrace = withoutFences.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return withoutFences.slice(firstBrace, lastBrace + 1);
  }

  return withoutFences;
};

const areaLabel = (areaKey: ExecutiveAreaKey) => {
  const labels: Record<ExecutiveAreaKey, string> = {
    financeiro: 'Financeiro',
    comercial: 'Comercial',
    operacao: 'Operação',
    pessoas: 'Pessoas',
    qualidade: 'Qualidade',
  };
  return labels[areaKey];
};

const buildExecutiveAiPayload = (metrics: ExecutiveMetricsPayload) => {
  const profileLabel =
    EXECUTIVE_PROFILE_DEFINITIONS.find((profile) => profile.key === metrics.profile.profileKey)?.label ||
    metrics.profile.profileKey ||
    'Sem perfil';
  const widgetLabels = metrics.profile.visibleWidgetKeys.map((widgetKey) => {
    const definition = EXECUTIVE_WIDGET_DEFINITIONS.find((widget) => widget.key === widgetKey);
    return definition?.label || widgetKey;
  });

  return {
    generated_at: metrics.generatedAt,
    overall_status: metrics.overallStatus,
    profile: {
      key: metrics.profile.profileKey,
      label: profileLabel,
      resolution_source: metrics.profile.resolutionSource,
      matched_group: metrics.profile.matchedGroupLabel,
      visible_widgets: widgetLabels,
    },
    scope: {
      areas: metrics.scope.areas.map((areaKey) => ({
        key: areaKey,
        label: areaLabel(areaKey),
      })),
      departments: metrics.scope.departments,
      teams: metrics.scope.teams,
      units: metrics.scope.units,
    },
    quantitative_summary: {
      overall_status: metrics.overallStatus,
      executive_summary: metrics.executiveSummary,
      top_priorities: metrics.topPriorities.map((priority) => ({
        area_key: priority.areaKey,
        title: priority.title,
        description: priority.description,
        severity: priority.severity,
      })),
    },
    areas: metrics.areas.map((area) => ({
      area_key: area.areaKey,
      label: area.label,
      status: area.status,
      summary: area.summary,
      updated_at: area.updatedAt,
      indicators: area.indicators.map((indicator) => ({
        indicator_key: indicator.indicatorKey,
        label: indicator.label,
        format: indicator.format,
        current_value: indicator.currentValue,
        day_value: indicator.dayValue,
        week_value: indicator.weekValue,
        month_value: indicator.monthValue,
        target_value: indicator.targetValue,
        projection_value: indicator.projectionValue,
        status: indicator.status,
        trend: indicator.trend,
        note: indicator.note,
      })),
    })),
    widgets: metrics.widgets.map((widget) => ({
      widget_key: widget.key,
      label: widget.label,
      area_key: widget.areaKey,
      status: widget.status,
      values: widget.values.map((value) => ({
        label: value.label,
        value: value.value,
      })),
      note: widget.note,
    })),
    live_operations: {
      medic_queue: metrics.liveOperations.medicQueue,
      reception_queue: metrics.liveOperations.receptionQueue,
      whatsapp_queue: metrics.liveOperations.whatsappQueue,
      critical_wait_count: metrics.liveOperations.criticalWaitCount,
      attended_today: metrics.liveOperations.attendedToday,
      average_reception_wait_minutes: metrics.liveOperations.averageReceptionWaitMinutes,
    },
  };
};

const EXECUTIVE_AI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'overall_status',
    'executive_summary',
    'top_priorities',
    'area_diagnoses',
    'action_plans',
    'risks',
    'opportunities',
    'data_gaps',
  ],
  properties: {
    overall_status: {
      type: 'string',
      enum: ['SUCCESS', 'WARNING', 'DANGER', 'NO_DATA'],
    },
    executive_summary: {
      type: 'string',
      maxLength: 500,
    },
    top_priorities: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['area_key', 'severity', 'horizon', 'title', 'description', 'rationale'],
        properties: {
          area_key: {
            type: ['string', 'null'],
            enum: ['financeiro', 'comercial', 'operacao', 'pessoas', 'qualidade', null],
          },
          severity: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
          },
          horizon: {
            type: ['string', 'null'],
            enum: ['now', 'week', 'month', null],
          },
          title: { type: 'string' },
          description: { type: 'string', maxLength: 320 },
          rationale: { type: 'string', maxLength: 320 },
        },
      },
    },
    area_diagnoses: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['area_key', 'status', 'attention_level', 'summary', 'rationale'],
        properties: {
          area_key: {
            type: 'string',
            enum: ['financeiro', 'comercial', 'operacao', 'pessoas', 'qualidade'],
          },
          status: {
            type: 'string',
            enum: ['SUCCESS', 'WARNING', 'DANGER', 'NO_DATA'],
          },
          attention_level: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
          },
          summary: { type: 'string', maxLength: 320 },
          rationale: { type: 'string', maxLength: 320 },
        },
      },
    },
    action_plans: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['area_key', 'severity', 'horizon', 'title', 'description', 'rationale'],
        properties: {
          area_key: {
            type: ['string', 'null'],
            enum: ['financeiro', 'comercial', 'operacao', 'pessoas', 'qualidade', null],
          },
          severity: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
          },
          horizon: {
            type: ['string', 'null'],
            enum: ['now', 'week', 'month', null],
          },
          title: { type: 'string', maxLength: 140 },
          description: { type: 'string', maxLength: 320 },
          rationale: { type: 'string', maxLength: 320 },
        },
      },
    },
    risks: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['area_key', 'severity', 'horizon', 'title', 'description', 'rationale'],
        properties: {
          area_key: {
            type: ['string', 'null'],
            enum: ['financeiro', 'comercial', 'operacao', 'pessoas', 'qualidade', null],
          },
          severity: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
          },
          horizon: {
            type: ['string', 'null'],
            enum: ['now', 'week', 'month', null],
          },
          title: { type: 'string', maxLength: 140 },
          description: { type: 'string', maxLength: 320 },
          rationale: { type: 'string', maxLength: 320 },
        },
      },
    },
    opportunities: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['area_key', 'severity', 'horizon', 'title', 'description', 'rationale'],
        properties: {
          area_key: {
            type: ['string', 'null'],
            enum: ['financeiro', 'comercial', 'operacao', 'pessoas', 'qualidade', null],
          },
          severity: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
          },
          horizon: {
            type: ['string', 'null'],
            enum: ['now', 'week', 'month', null],
          },
          title: { type: 'string', maxLength: 140 },
          description: { type: 'string', maxLength: 320 },
          rationale: { type: 'string', maxLength: 320 },
        },
      },
    },
    data_gaps: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['area_key', 'severity', 'horizon', 'title', 'description', 'rationale'],
        properties: {
          area_key: {
            type: ['string', 'null'],
            enum: ['financeiro', 'comercial', 'operacao', 'pessoas', 'qualidade', null],
          },
          severity: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
          },
          horizon: {
            type: ['string', 'null'],
            enum: ['now', 'week', 'month', null],
          },
          title: { type: 'string', maxLength: 140 },
          description: { type: 'string', maxLength: 320 },
          rationale: { type: 'string', maxLength: 320 },
        },
      },
    },
  },
} as const;

type RawExecutiveAiItem = {
  area_key: ExecutiveAreaKey | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  horizon: 'now' | 'week' | 'month' | null;
  title: string;
  description: string;
  rationale: string;
};

type RawExecutiveAiDiagnosis = {
  area_key: ExecutiveAreaKey;
  status: ExecutiveIndicatorStatus;
  attention_level: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  rationale: string;
};

type RawExecutiveAiSummary = {
  overall_status: ExecutiveIndicatorStatus;
  executive_summary: string;
  top_priorities: RawExecutiveAiItem[];
  area_diagnoses: RawExecutiveAiDiagnosis[];
  action_plans: RawExecutiveAiItem[];
  risks: RawExecutiveAiItem[];
  opportunities: RawExecutiveAiItem[];
  data_gaps: RawExecutiveAiItem[];
};

export const generateExecutiveAiSummary = async (metrics: ExecutiveMetricsPayload): Promise<ExecutiveAiSummary> => {
  const apiKey = requireOpenAiKey();
  const payload = buildExecutiveAiPayload(metrics);
  const endpointBase = OPENAI_BASE_URL || OPENAI_API_URL;

  const response = await fetch(`${endpointBase}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EXECUTIVE_MODEL,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text:
                'Você é a camada interpretativa do Painel Executivo da Consultare. Use apenas o payload fornecido. Não invente dados, metas, causas, diagnósticos ou planos sem base explícita. Diferencie fatos observados de recomendações. Priorize criticidade real, considere dia, semana, mês, meta e projeção quando houver, adapte a narrativa ao perfil e ao escopo já aplicados, e registre em data_gaps tudo o que estiver insuficiente para uma conclusão segura. Seja conciso: cada texto deve caber em 1 ou 2 frases curtas. Retorne somente o JSON exigido pelo schema.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Snapshot executivo consolidado:\n${JSON.stringify(payload)}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'executive_dashboard_ai_summary',
          schema: EXECUTIVE_AI_SCHEMA,
          strict: true,
        },
      },
      max_output_tokens: 5000,
    }),
  });

  if (!response.ok) {
    const error = new Error(await parseOpenAiError(response));
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  const json = await response.json();
  const outputText = sanitizeJsonCandidate(extractResponseText(json));
  if (!outputText) {
    throw new Error('A OpenAI não retornou conteúdo estruturado para o resumo executivo.');
  }

  let parsed: RawExecutiveAiSummary;
  try {
    parsed = JSON.parse(outputText) as RawExecutiveAiSummary;
  } catch (error: any) {
    const detail = error instanceof Error ? error.message : 'Falha ao interpretar o JSON da OpenAI.';
    throw new Error(`Falha ao interpretar a resposta estruturada da OpenAI: ${detail}`);
  }

  return {
    model: EXECUTIVE_MODEL,
    generatedAt: new Date().toISOString(),
    overallStatus: parsed.overall_status,
    executiveSummary: parsed.executive_summary,
    topPriorities: parsed.top_priorities.map((item) => ({
      areaKey: item.area_key,
      severity: item.severity,
      horizon: item.horizon,
      title: item.title,
      description: item.description,
      rationale: item.rationale,
    })),
    areaDiagnoses: parsed.area_diagnoses.map((item) => ({
      areaKey: item.area_key,
      status: item.status,
      attentionLevel: item.attention_level,
      summary: item.summary,
      rationale: item.rationale,
    })),
    actionPlans: parsed.action_plans.map((item) => ({
      areaKey: item.area_key,
      severity: item.severity,
      horizon: item.horizon,
      title: item.title,
      description: item.description,
      rationale: item.rationale,
    })),
    risks: parsed.risks.map((item) => ({
      areaKey: item.area_key,
      severity: item.severity,
      horizon: item.horizon,
      title: item.title,
      description: item.description,
      rationale: item.rationale,
    })),
    opportunities: parsed.opportunities.map((item) => ({
      areaKey: item.area_key,
      severity: item.severity,
      horizon: item.horizon,
      title: item.title,
      description: item.description,
      rationale: item.rationale,
    })),
    dataGaps: parsed.data_gaps.map((item) => ({
      areaKey: item.area_key,
      severity: item.severity,
      horizon: item.horizon,
      title: item.title,
      description: item.description,
      rationale: item.rationale,
    })),
  };
};
