// src/app/(admin)/monitor/types.ts

// --- MÉDICO ---
export interface Patient {
  id: string | number;
  name: string;
  isFirstTime?: boolean;
  priority?: {
    isWheelchair?: boolean;
    isPregnant?: boolean;
    isElderly?: boolean;
  };
  service: string;
  professional: string;
  arrival: string;
  waitTime: number;
  status: 'waiting' | 'in_service';
}

export interface UnitData {
  id: number | string;
  name: string;
  patients: Patient[];
  totalAttended?: number;
  averageWaitDay?: number;
}

// --- RECEPÇÃO ---
export interface ReceptionUnitStats {
  fila: number;
  tempo_medio: number;
  total_passaram: number;
  nome_unidade?: string;
}

export interface ReceptionResponse {
  global: {
    total_fila: number;
    tempo_medio: number;
  };
  por_unidade: Record<string, ReceptionUnitStats>;
}

// --- WHATSAPP (DIGITAL) ---
export interface WhatsAppGroup {
  group_id: string;
  group_name: string;
  queue_size: number;
  avg_wait_seconds: number;
}

export interface WhatsAppResponse {
  global: {
    queue: number;
    avgWaitSeconds: number;
  };
  groups: WhatsAppGroup[];
}