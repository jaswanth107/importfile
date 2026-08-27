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
  raw: Record<string, string>;
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
