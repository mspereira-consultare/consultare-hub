const prettifyEnum = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return 'Não informado';
  return raw
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  ENABLED: 'Ativa',
  PAUSED: 'Pausada',
  REMOVED: 'Removida',
  UNKNOWN: 'Não informado',
  UNSPECIFIED: 'Não informado',
};

const PRIMARY_STATUS_LABELS: Record<string, string> = {
  ELIGIBLE: 'Qualificada',
  LIMITED: 'Qualificada (limitada)',
  NOT_ELIGIBLE: 'Não qualificada',
  PAUSED: 'Pausada',
  REMOVED: 'Removida',
  PENDING: 'Pendente',
  UNKNOWN: 'Não informado',
  UNSPECIFIED: 'Não informado',
};

const REASON_LABELS: Record<string, string> = {
  BUDGET: 'Limitada por orçamento',
  BIDDING_STRATEGY_LIMITED: 'Limitada pela estratégia de lances',
  CAMPAIGN_BUDGET_CONSTRAINED: 'Orçamento restrito',
  AD_GROUP_AD_DISAPPROVED: 'Anúncio reprovado',
  AD_GROUP_AD_UNDER_REVIEW: 'Anúncio em revisão',
  CAMPAIGN_HAS_NO_ADS: 'Sem anúncios ativos',
  CAMPAIGN_HAS_INVALID_BUDGET: 'Orçamento inválido',
  CAMPAIGN_HAS_TOO_FEW_AD_GROUPS: 'Poucos grupos de anúncio',
  CAMPAIGN_ENDED: 'Campanha encerrada',
  CAMPAIGN_PENDING: 'Campanha pendente',
  CAMPAIGN_PAUSED: 'Campanha pausada',
  CAMPAIGN_REMOVED: 'Campanha removida',
};

const BIDDING_LABELS: Record<string, string> = {
  TARGET_CPA: 'CPA desejado',
  TARGET_ROAS: 'ROAS desejado',
  MAXIMIZE_CONVERSIONS: 'Maximizar conversões',
  MAXIMIZE_CONVERSION_VALUE: 'Maximizar valor de conversão',
  MAXIMIZE_CLICKS: 'Maximizar cliques',
  TARGET_IMPRESSION_SHARE: 'Parcela de impressões desejada',
  MANUAL_CPC: 'CPC manual',
  MANUAL_CPM: 'CPM manual',
  MANUAL_CPV: 'CPV manual',
  UNKNOWN: 'Não informado',
  UNSPECIFIED: 'Não informado',
};

const CHANNEL_LABELS: Record<string, string> = {
  SEARCH: 'Pesquisa',
  DISPLAY: 'Display',
  PERFORMANCE_MAX: 'Performance Max',
  VIDEO: 'Vídeo',
  DISCOVERY: 'Discovery',
  DEMAND_GEN: 'Demand Gen',
  SHOPPING: 'Shopping',
  HOTEL: 'Hotel',
  LOCAL: 'Local',
  UNKNOWN: 'Não informado',
  UNSPECIFIED: 'Não informado',
};

const BUDGET_PERIOD_LABELS: Record<string, string> = {
  DAILY: 'Diário',
  CUSTOM_PERIOD: 'Período personalizado',
  UNKNOWN: 'Não informado',
  UNSPECIFIED: 'Não informado',
};

export const formatGoogleAdsCampaignStatus = (value?: string | null) =>
  CAMPAIGN_STATUS_LABELS[String(value || '').trim().toUpperCase()] || prettifyEnum(value);

export const formatGoogleAdsPrimaryStatus = (value?: string | null) =>
  PRIMARY_STATUS_LABELS[String(value || '').trim().toUpperCase()] || prettifyEnum(value);

export const formatGoogleAdsReason = (value?: string | null) =>
  REASON_LABELS[String(value || '').trim().toUpperCase()] || prettifyEnum(value);

export const formatGoogleAdsBiddingStrategy = (value?: string | null) =>
  BIDDING_LABELS[String(value || '').trim().toUpperCase()] || prettifyEnum(value);

export const formatGoogleAdsChannelType = (value?: string | null) =>
  CHANNEL_LABELS[String(value || '').trim().toUpperCase()] || prettifyEnum(value);

export const formatGoogleAdsBudgetPeriod = (value?: string | null) =>
  BUDGET_PERIOD_LABELS[String(value || '').trim().toUpperCase()] || prettifyEnum(value);

export const hasBudgetLimitation = (reasons: string[] = []) =>
  reasons.some((reason) => String(reason || '').toUpperCase().includes('BUDGET'));
