export interface ApiResponse<T> {
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

export interface ApiError {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
}

export type EncounterStatus = 'draft' | 'in_review' | 'finalized' | 'cancelled';
export type DocumentType = 'soap' | 'sbar' | 'prescricao' | 'alta' | 'atestado';
export type SubscriptionStatus = 'active' | 'inactive' | 'trial';
