import type { DuplicateConflict, RowResult } from "./types.js";

function diffFields(canonical: RowResult, other: RowResult) {
  const fields: Array<[string, string, string]> = [
    ["Name", canonical.name, other.name],
    ["Phone", canonical.phone, other.phone],
    ["Joining Date", canonical.joiningDate, other.joiningDate],
  ];
  return fields
    .filter(([, a, b]) => a !== b)
    .map(([field, before, after]) => ({ field, before, after }));
}

/**
 * First valid occurrence per normalized email becomes canonical; later occurrences
 * are marked SKIPPED (duplicate within file) and any data differences are surfaced
 * as conflicts rather than silently discarded.
 */
export function dedupeWithinFile(rows: RowResult[]): { rows: RowResult[]; conflicts: DuplicateConflict[] } {
  const canonicalByEmail = new Map<string, RowResult>();
  const conflicts: DuplicateConflict[] = [];
  const result: RowResult[] = [];

  for (const row of rows) {
    if (row.status === "REJECTED") {
      result.push(row);
      continue;
    }

    const existing = canonicalByEmail.get(row.email);
    if (!existing) {
      canonicalByEmail.set(row.email, row);
      result.push(row);
      continue;
    }

    const differences = diffFields(existing, row);
    if (differences.length > 0) {
      conflicts.push({
        email: row.email,
        canonicalRow: existing.rowNumber,
        conflictingRow: row.rowNumber,
        differences,
      });
    }

    result.push({
      ...row,
      status: "SKIPPED",
      reason: `Duplicate email within file. Row ${existing.rowNumber} is the canonical record.`,
    });
  }

  return { rows: result, conflicts };
}
