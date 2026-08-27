import type { DashboardStats, FieldKey, HistoryEntry, PreviewResponse } from "./types";

const BASE = "/api/import";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Something went wrong. Please try again." }));
    throw new ApiError(body.error ?? "Something went wrong. Please try again.", res.status, body.code);
  }
  return res.json();
}

export async function uploadPreview(file: File, mapping?: Partial<Record<FieldKey, string>>): Promise<PreviewResponse> {
  const form = new FormData();
  form.append("file", file);
  if (mapping) form.append("mapping", JSON.stringify(mapping));
  const res = await fetch(`${BASE}/preview`, { method: "POST", body: form });
  return handle(res);
}

export async function confirmImport(importId: string) {
  const res = await fetch(`${BASE}/${importId}/confirm`, { method: "POST" });
  return handle<{ importId: string; counts: Record<string, number> }>(res);
}

export async function rollbackImport(importId: string) {
  const res = await fetch(`${BASE}/${importId}/rollback`, { method: "POST" });
  return handle<{ deleted: number; restored: number; skipped: number }>(res);
}

export async function getHistory(): Promise<HistoryEntry[]> {
  const res = await fetch(`${BASE}/history`);
  return handle(res);
}

export async function getImportDetail(importId: string) {
  const res = await fetch(`${BASE}/${importId}`);
  return handle<any>(res);
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const res = await fetch(`${BASE}/meta/dashboard`);
  return handle(res);
}

export function rejectedCsvUrl(importId: string) {
  return `${BASE}/${importId}/rejected.csv`;
}

export function reportUrl(importId: string) {
  return `${BASE}/${importId}/report.json`;
}

export function sampleTemplateUrl() {
  return `${BASE}/meta/sample-template.csv`;
}
