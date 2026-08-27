import { autoMapColumns } from "./mapper.js";
import type { ColumnMapping, FieldKey } from "./mapper.js";
import { buildRowCandidate } from "./validate.js";
import { dedupeWithinFile } from "./dedupe.js";
import { compareWithDatabase, type ExistingPerson } from "./compare.js";
import type { ColumnQuality, ImportPreview, RowResult } from "./types.js";
import type { ParsedFile } from "./parser.js";

export interface BuildPreviewInput {
  importId: string;
  fileName: string;
  parsed: ParsedFile;
  mappingOverride?: Partial<Record<FieldKey, string>>;
  lookupExisting: (emails: string[]) => Promise<Map<string, ExistingPerson>>;
  now: () => Date;
  previewTtlMs: number;
}

export function resolveMapping(headers: string[], override?: Partial<Record<FieldKey, string>>): ColumnMapping {
  const auto = autoMapColumns(headers);
  if (!override) return auto;
  const mapping = { ...auto.mapping, ...override };
  const unmapped = (["name", "email", "phone", "joiningDate"] as FieldKey[]).filter((f) => !mapping[f]);
  return { mapping, unmapped, confident: unmapped.length === 0 };
}

function computeColumnQuality(rows: RowResult[]): ColumnQuality[] {
  const fields: Array<{ key: keyof Pick<RowResult, "name" | "email" | "phone" | "joiningDate">; label: string }> = [
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "joiningDate", label: "Joining Date" },
  ];
  return fields.map(({ key, label }) => {
    const total = rows.length;
    const invalid = rows.filter((r) => r.status === "REJECTED").length; // approximation: row-level rejection
    const normalized = rows.filter((r) => r.warnings.some((w) => w.toLowerCase().includes(key === "joiningDate" ? "date" : key))).length;
    return { field: label, valid: total - invalid, invalid, normalized, total };
  });
}

export async function buildPreview(input: BuildPreviewInput): Promise<ImportPreview> {
  const { headers, rows: rawRows } = input.parsed;
  const { mapping } = resolveMapping(headers, input.mappingOverride);

  const candidates = rawRows.map((raw, idx) => buildRowCandidate({ rowNumber: idx + 2, raw }, mapping));
  const { rows: dedupedRows, conflicts } = dedupeWithinFile(candidates);

  const emailsToLookup = dedupedRows
    .filter((r) => r.status !== "REJECTED" && r.status !== "SKIPPED")
    .map((r) => r.email);
  const existingByEmail = await input.lookupExisting(emailsToLookup);

  const finalRows = compareWithDatabase(dedupedRows, existingByEmail);

  const counts = {
    created: finalRows.filter((r) => r.status === "CREATED").length,
    updated: finalRows.filter((r) => r.status === "UPDATED").length,
    skipped: finalRows.filter((r) => r.status === "SKIPPED").length,
    rejected: finalRows.filter((r) => r.status === "REJECTED").length,
    warnings: finalRows.filter((r) => r.warnings.length > 0).length,
  };

  const now = input.now();
  return {
    importId: input.importId,
    fileName: input.fileName,
    totalRows: finalRows.length,
    counts,
    rows: finalRows,
    conflicts,
    columnQuality: computeColumnQuality(finalRows),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + input.previewTtlMs).toISOString(),
  };
}
