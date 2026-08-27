export type FieldKey = "name" | "email" | "phone" | "joiningDate";

const CANDIDATES: Record<FieldKey, string[]> = {
  name: ["name", "full name", "fullname", "full_name", "employee name"],
  email: ["email", "email address", "email_address", "emailid", "email id"],
  phone: ["phone", "phone number", "mobile", "mobile number", "phone_number", "mobile no", "mobileno"],
  joiningDate: ["joining date", "join date", "joining_date", "joiningdate", "join_date", "date joined", "dateofjoining", "date of joining"],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface ColumnMapping {
  mapping: Partial<Record<FieldKey, string>>;
  unmapped: FieldKey[];
  confident: boolean;
}

export function autoMapColumns(headers: string[]): ColumnMapping {
  const mapping: Partial<Record<FieldKey, string>> = {};
  const normalizedHeaders = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));

  (Object.keys(CANDIDATES) as FieldKey[]).forEach((field) => {
    const candidates = CANDIDATES[field];
    const match = normalizedHeaders.find((h) => candidates.includes(h.norm));
    if (match) mapping[field] = match.raw;
  });

  const unmapped = (Object.keys(CANDIDATES) as FieldKey[]).filter((f) => !mapping[f]);
  return { mapping, unmapped, confident: unmapped.length === 0 };
}
