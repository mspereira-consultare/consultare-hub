export type MarketingControleJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PARTIAL';

export type MarketingControleLatestJob = {
  id: string;
  status: MarketingControleJobStatus;
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

export type MarketingControleSourceStatusRow = {
  serviceName: string;
  status: string;
  lastRun: string | null;
  details: string | null;
  dataLastSyncAt?: string | null;
};

export type MarketingControleSourceStatus = {
  google: MarketingControleSourceStatusRow;
  cliniaAds: MarketingControleSourceStatusRow;
  appointments: MarketingControleSourceStatusRow;
  revenue: MarketingControleSourceStatusRow;
};

export type MarketingControleSummary = {
  monthRef: string;
  brand: 'consultare' | 'resolve';
  startDate: string;
  endDate: string;
  hasAnyData: boolean;
  latestJob: MarketingControleLatestJob | null;
  cards: {
    visitors: number;
    whatsappClicks: number;
    cliniaNewContacts: number;
    cliniaAppointments: number;
    googleSpend: number;
    costPerNewContact: number | null;
    costPerAppointment: number | null;
  };
};

export type MarketingControleValueFormat = 'integer' | 'currency' | 'percentage' | 'duration' | 'multiplier';

export type MarketingControleGridRow = {
  key: string;
  label: string;
  format: MarketingControleValueFormat;
  week1: number | null;
  week2: number | null;
  week3: number | null;
  week4: number | null;
  monthly: number | null;
};

export type MarketingControleGridSection = {
  key: string;
  title: string;
  subtitle: string;
  availability: 'available' | 'planned';
  rows: MarketingControleGridRow[];
};

export type MarketingControleGrid = {
  monthRef: string;
  brand: 'consultare' | 'resolve';
  startDate: string;
  endDate: string;
  columns: Array<{
    key: 'week1' | 'week2' | 'week3' | 'week4' | 'monthly';
    label: string;
    startDate: string;
    endDate: string;
  }>;
  sections: MarketingControleGridSection[];
};
