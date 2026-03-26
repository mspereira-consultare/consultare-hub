export type MarketingFunilJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PARTIAL';

export type MarketingFunilSummary = {
  periodRef: string;
  startDate: string;
  endDate: string;
  campaigns: number;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  sessions: number;
  totalUsers: number;
  newUsers: number;
  engagedSessions: number;
  engagementRate: number;
  pageViews: number;
  eventCount: number;
  leads: number;
  cpl: number;
  interactions: number;
  conversions: number;
  allConversions: number;
  conversionsValue: number;
  costPerConversion: number;
  lastSyncAt: string | null;
  appointments: {
    totalValid: number;
    byStatus: Array<{
      statusId: number;
      statusLabel: string;
      count: number;
    }>;
  };
  revenue: {
    total: number;
    dateBasis: string;
  };
  cliniaAds: {
    contactsReceived: number;
    newContactsReceived: number;
    appointmentsConverted: number;
    conversionRate: number;
    avgConversionTimeSec: number;
    lastSyncAt: string | null;
    prevContactsReceived: number;
    prevNewContactsReceived: number;
    prevAppointmentsConverted: number;
    prevConversionRate: number;
    historyAvailable: boolean;
    historyStartMonth: string | null;
    historyEndMonth: string | null;
  };
  googleAdsHealth: {
    limitedByBudgetCount: number;
    pausedCount: number;
    enabledCount: number;
    avgOptimizationScore: number;
    avgConversionRate: number;
    avgConversionsValuePerCost: number;
  };
};

export type MarketingFunilFilterOption = {
  value: string;
  label: string;
};

export type MarketingFunilFilterOptions = {
  periodRef: string;
  startDate: string;
  endDate: string;
  campaigns: MarketingFunilFilterOption[];
  sources: MarketingFunilFilterOption[];
  media: MarketingFunilFilterOption[];
  channelGroups: MarketingFunilFilterOption[];
};

export type MarketingFunilCampaign = {
  campaignKey: string;
  campaignName: string;
  source: string;
  medium: string;
  sessionDefaultChannelGroup: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  sessions: number;
  totalUsers: number;
  newUsers: number;
  engagedSessions: number;
  engagementRate: number;
  pageViews: number;
  eventCount: number;
  leads: number;
  cpl: number;
  interactions: number;
  interactionRate: number;
  averageCost: number;
  conversions: number;
  conversionRate: number;
  allConversions: number;
  conversionsValue: number;
  conversionsValuePerCost: number;
  costPerConversion: number;
  cliniaContacts: number;
  cliniaNewContacts: number;
  cliniaAppointments: number;
  cliniaConversionRate: number;
  cliniaCostPerContact: number;
  cliniaCostPerAppointment: number;
  campaignStatus: string;
  campaignPrimaryStatus: string;
  campaignPrimaryStatusReasons: string[];
  biddingStrategyType: string;
  optimizationScore: number;
  advertisingChannelType: string;
  budgetName: string;
  budgetPeriod: string;
  budgetAmount: number;
  currencyCode: string;
  campaignStartDate: string | null;
  campaignEndDate: string | null;
  googleAdsSnapshotDate: string | null;
  googleAdsSnapshotUpdatedAt: string | null;
  lastSyncAt: string | null;
};

export type MarketingFunilCampaignList = {
  periodRef: string;
  startDate: string;
  endDate: string;
  page: number;
  pageSize: number;
  total: number;
  items: MarketingFunilCampaign[];
};

export type MarketingFunilGoogleAdsHealthList = {
  periodRef: string;
  startDate: string;
  endDate: string;
  page: number;
  pageSize: number;
  total: number;
  items: MarketingFunilCampaign[];
};

export type MarketingFunilChannelRow = {
  channelGroup: string;
  sessions: number;
  users: number;
  leads: number;
  eventCount: number;
  lastSyncAt: string | null;
};

export type MarketingFunilChannelList = {
  periodRef: string;
  startDate: string;
  endDate: string;
  items: MarketingFunilChannelRow[];
};

export type MarketingFunilDeviceRow = {
  campaignKey: string;
  campaignName: string;
  device: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  allConversions: number;
  lastSyncAt: string | null;
};

export type MarketingFunilDeviceList = {
  periodRef: string;
  startDate: string;
  endDate: string;
  items: MarketingFunilDeviceRow[];
};

export type MarketingFunilLandingRow = {
  campaignKey: string;
  campaignName: string;
  landingPage: string;
  source: string;
  medium: string;
  sessions: number;
  totalUsers: number;
  newUsers: number;
  engagedSessions: number;
  engagementRate: number;
  leads: number;
  eventCount: number;
  lastSyncAt: string | null;
};

export type MarketingFunilLandingList = {
  periodRef: string;
  startDate: string;
  endDate: string;
  items: MarketingFunilLandingRow[];
};

export type MarketingFunilLatestJob = {
  id: string;
  status: MarketingFunilJobStatus;
  periodRef: string;
  startDate: string;
  endDate: string;
  scope: Record<string, unknown>;
  requestedBy: string;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
};

export type MarketingFunilCliniaAdsRow = {
  origin: string;
  sourceId: string;
  title: string;
  sourceUrl: string;
  contactsReceived: number;
  newContactsReceived: number;
  appointmentsConverted: number;
  conversionRate: number;
  avgConversionTimeSec: number;
};

export type MarketingFunilCliniaAdsList = {
  periodRef: string;
  startDate: string;
  endDate: string;
  historyAvailable: boolean;
  historyStartMonth: string | null;
  historyEndMonth: string | null;
  items: MarketingFunilCliniaAdsRow[];
};

export type MarketingFunilCliniaAdsOriginRow = {
  origin: string;
  contactsReceived: number;
  newContactsReceived: number;
  appointmentsConverted: number;
  conversionRate: number;
};

export type MarketingFunilCliniaAdsOriginList = {
  periodRef: string;
  startDate: string;
  endDate: string;
  historyAvailable: boolean;
  historyStartMonth: string | null;
  historyEndMonth: string | null;
  items: MarketingFunilCliniaAdsOriginRow[];
};

export type MarketingFunilSourceStatusRow = {
  serviceName: string;
  status: string;
  lastRun: string | null;
  details: string | null;
  dataLastSyncAt?: string | null;
};

export type MarketingFunilSourceStatus = {
  google: MarketingFunilSourceStatusRow;
  cliniaAds: MarketingFunilSourceStatusRow;
  appointments: MarketingFunilSourceStatusRow;
  revenue: MarketingFunilSourceStatusRow;
};
