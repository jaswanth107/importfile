import { isEmailValid, isNameValid, normalizeEmail, normalizeJoiningDate, normalizeName, normalizePhone } from "./normalize.js";
import type { FieldKey } from "./mapper.js";
import type { RowResult } from "./types.js";

const FORMULA_PREFIXES = ["=", "+", "-", "@"];
export function sanitizeForExport(value: string): string {
  if (value.length > 0 && FORMULA_PREFIXES.includes(value[0])) {
    return `'${value}`;
  }
  return value;
}

export interface RawRow {
  rowNumber: number;
  raw: Record<string, string>;
}

export function buildRowCandidate(
  row: RawRow,
  mapping: Partial<Record<FieldKey, string>>
): RowResult {
  const warnings: string[] = [];
  const get = (field: FieldKey) => (mapping[field] ? row.raw[mapping[field]!] ?? "" : "");

  const nameRes = normalizeName(get("name"));
  if (nameRes.warning) warnings.push(nameRes.warning);

  const emailRes = normalizeEmail(get("email"));
  if (emailRes.warning) warnings.push(emailRes.warning);

  const phoneRes = normalizePhone(get("phone"));
  if (phoneRes.warning) warnings.push(phoneRes.warning);

  const dateRes = normalizeJoiningDate(get("joiningDate"));

  const base: RowResult = {
    rowNumber: row.rowNumber,
    name: nameRes.value,
    email: emailRes.value,
    phone: phoneRes.value ?? get("phone").trim(),
    joiningDate: dateRes.value ?? get("joiningDate").trim(),
    status: "REJECTED",
    warnings,
    changes: [],
    raw: row.raw,
  };

  if (!isNameValid(nameRes.value)) {
    return { ...base, status: "REJECTED", reason: "Missing or invalid name." };
  }
  if (!isEmailValid(emailRes.value)) {
    return { ...base, status: "REJECTED", reason: "Missing or invalid email address." };
  }
  if (!phoneRes.value) {
    return { ...base, status: "REJECTED", reason: "Missing or invalid phone number." };
  }
  if (!dateRes.value) {
    return { ...base, status: "REJECTED", reason: dateRes.reason ?? "Invalid joining date." };
  }

  // valid candidate; status finalized later (CREATED/UPDATED/SKIPPED) after duplicate + DB comparison
  return { ...base, status: "CREATED" };
}
