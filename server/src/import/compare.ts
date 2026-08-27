import type { RowResult } from "./types.js";

export interface ExistingPerson {
  id: string;
  name: string;
  phone: string;
  joiningDate: string;
}

export function compareWithDatabase(
  rows: RowResult[],
  existingByEmail: Map<string, ExistingPerson>
): RowResult[] {
  return rows.map((row) => {
    if (row.status === "REJECTED" || row.status === "SKIPPED") return row;

    const existing = existingByEmail.get(row.email);
    if (!existing) {
      return { ...row, status: "CREATED" as const };
    }

    const changes = [
      { field: "Name", before: existing.name, after: row.name },
      { field: "Phone", before: existing.phone, after: row.phone },
      { field: "Joining Date", before: existing.joiningDate, after: row.joiningDate },
    ].filter((c) => c.before !== c.after);

    if (changes.length === 0) {
      return { ...row, status: "SKIPPED" as const, reason: "No changes detected.", personId: existing.id };
    }
    return { ...row, status: "UPDATED" as const, changes, personId: existing.id };
  });
}
