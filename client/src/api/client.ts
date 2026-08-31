import type { AuthResponse, AuthUser, DashboardStats, FieldKey, HistoryEntry, PreviewResponse } from "./types";
import { clearToken, getToken } from "./authToken";

const BASE = "/api/import";
const AUTH_BASE = "/api/auth";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Something went wrong. Please try again." }));
    // A 401 while we thought we had a valid token means it expired or was revoked — bounce to login.
    // (A 401 from the login/signup form itself has no stored token yet, so this doesn't fire there.)
    if (res.status === 401 && getToken()) {
      clearToken();
      window.location.href = "/login";
    }
    throw new ApiError(body.error ?? "Something went wrong. Please try again.", res.status, body.code);
  }
  return res.json();
}

export async function signup(username: string, email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${AUTH_BASE}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password }),
  });
  return handle(res);
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${AUTH_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return handle(res);
}

export async function getMe(): Promise<{ user: AuthUser }> {
  const res = await fetch(`${AUTH_BASE}/me`, { headers: authHeaders() });
  return handle(res);
}

export async function uploadPreview(file: File, mapping?: Partial<Record<FieldKey, string>>): Promise<PreviewResponse> {
  const form = new FormData();
  form.append("file", file);
  if (mapping) form.append("mapping", JSON.stringify(mapping));
  const res = await fetch(`${BASE}/preview`, { method: "POST", headers: authHeaders(), body: form });
  return handle(res);
}

export async function confirmImport(importId: string) {
  const res = await fetch(`${BASE}/${importId}/confirm`, { method: "POST", headers: authHeaders() });
  return handle<{ importId: string; counts: Record<string, number> }>(res);
}

export async function rollbackImport(importId: string) {
  const res = await fetch(`${BASE}/${importId}/rollback`, { method: "POST", headers: authHeaders() });
  return handle<{ deleted: number; restored: number; skipped: number }>(res);
}

export async function getHistory(): Promise<HistoryEntry[]> {
  const res = await fetch(`${BASE}/history`, { headers: authHeaders() });
  return handle(res);
}

export async function getImportDetail(importId: string) {
  const res = await fetch(`${BASE}/${importId}`, { headers: authHeaders() });
  return handle<any>(res);
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const res = await fetch(`${BASE}/meta/dashboard`, { headers: authHeaders() });
  return handle(res);
}

export async function downloadRejectedCsv(importId: string): Promise<void> {
  const res = await fetch(`${BASE}/${importId}/rejected.csv`, { headers: authHeaders() });
  if (!res.ok) throw new ApiError("Couldn't download the rejected rows.", res.status);
  await saveBlob(res, `rejected-${importId}.csv`);
}

export async function downloadReport(importId: string): Promise<void> {
  const res = await fetch(`${BASE}/${importId}/report.xlsx`, { headers: authHeaders() });
  if (!res.ok) throw new ApiError("Couldn't download the import report.", res.status);
  await saveBlob(res, `import-report-${importId}.xlsx`);
}

async function saveBlob(res: Response, filename: string) {
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function sampleTemplateUrl() {
  return `${BASE}/meta/sample-template.csv`;
}
