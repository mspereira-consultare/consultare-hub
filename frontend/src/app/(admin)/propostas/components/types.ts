export type SortKey =
  | 'professional_name'
  | 'qtd'
  | 'qtd_executado'
  | 'valor'
  | 'valor_executado'
  | 'conversion_rate'
  | 'ticket_medio'
  | 'ticket_exec';

export type Summary = {
  qtd: number;
  valor: number;
  wonValue: number;
  wonQtd: number;
  lostValue: number;
  conversionRate: number;
  awaitingClientApprovalQtd: number;
  awaitingClientApprovalValue: number;
  approvedByClientQtd: number;
  approvedByClientValue: number;
  rejectedByClientQtd: number;
  rejectedByClientValue: number;
};

export type UnitRow = {
  unit_name: string | null;
  status: string | null;
  qtd: number;
  valor: number;
};

export type SellerRow = {
  professional_name: string | null;
  qtd: number;
  valor: number;
  qtd_executado: number;
  valor_executado: number;
};

export type GroupedUnit = {
  name: string;
  total: number;
  qtd: number;
};

export type ProposalDetailRow = {
  proposalId: number;
  proposalDate: string;
  status: string;
  unitName: string;
  professionalName: string;
  patientId: number | null;
  patientName: string;
  patientPhone: string;
  patientEmail: string;
  procedureSummary: string;
  procedureCount: number;
  totalValue: number;
  proposalLastUpdate: string | null;
};

export type ProposalDetailResponse = {
  rows: ProposalDetailRow[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  detailStatusApplied: string;
};
