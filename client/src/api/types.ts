export type RowStatus = "CREATED" | "UPDATED" | "SKIPPED" | "REJECTED";

export interface FieldChange {
  field: string;
  before: string;
  after: string;
}

export interface RowResult {
  rowNumber: number;
  name: string;
  email: string;
  phone: string;
  joiningDate: string;
  status: RowStatus;
  reason?: string;
  warnings: string[];
  changes: FieldChange[];
  personId?: string;
}

export interface DuplicateConflict {
  email: string;
  canonicalRow: number;
  conflictingRow: number;
  differences: FieldChange[];
}

export interface ColumnQuality {
  field: string;
  valid: number;
  invalid: number;
  normalized: number;
  total: number;
}

export interface ImportPreview {
  importId: string;
  fileName: string;
  totalRows: number;
  counts: {
    created: number;
    updated: number;
    skipped: number;
    rejected: number;
    warnings: number;
  };
  rows: RowResult[];
  conflicts: DuplicateConflict[];
  columnQuality: ColumnQuality[];
  createdAt: string;
  expiresAt: string;
}

export type FieldKey = "name" | "email" | "phone" | "joiningDate";

export interface PreviewResponse {
  preview: ImportPreview | null;
  mapping: Partial<Record<FieldKey, string>>;
  unmapped: FieldKey[];
  needsMapping: boolean;
  headers: string[];
}

export interface HistoryEntry {
  id: string;
  fileName: string;
  status: string;
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  rejected: number;
  createdAt: string;
  confirmedAt: string | null;
}

export interface DashboardStats {
  totalImports: number;
  successfulImports: number;
  rowsImported: number;
  rowsRejected: number;
  recent: HistoryEntry[];
}

export interface PersonEntry {
  id: string;
  name: string;
  email: string;
  phone: string;
  joiningDate: string;
  createdAt: string;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}
