import { describe, expect, it } from "vitest";
import { dedupeWithinFile } from "./dedupe.js";
import type { RowResult } from "./types.js";

function row(overrides: Partial<RowResult>): RowResult {
  return {
    rowNumber: 1,
    name: "John Smith",
    email: "john@gmail.com",
    phone: "+919876543210",
    joiningDate: "2026-01-01",
    status: "CREATED",
    warnings: [],
    changes: [],
    raw: {},
    ...overrides,
  };
}

describe("dedupeWithinFile", () => {
  it("keeps the first valid occurrence as canonical and skips later identical duplicates", () => {
    const rows = [row({ rowNumber: 10 }), row({ rowNumber: 25 })];
    const { rows: result, conflicts } = dedupeWithinFile(rows);
    expect(result[0].status).toBe("CREATED");
    expect(result[1].status).toBe("SKIPPED");
    expect(result[1].reason).toContain("Row 10");
    expect(conflicts).toHaveLength(0);
  });

  it("surfaces a conflict when duplicate rows disagree on data", () => {
    const rows = [
      row({ rowNumber: 10, phone: "+919876543210" }),
      row({ rowNumber: 25, phone: "+919876500000" }),
    ];
    const { conflicts } = dedupeWithinFile(rows);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ canonicalRow: 10, conflictingRow: 25 });
    expect(conflicts[0].differences[0]).toMatchObject({ field: "Phone" });
  });

  it("does not touch already-rejected rows", () => {
    const rows = [row({ rowNumber: 1, status: "REJECTED", reason: "Missing name" })];
    const { rows: result } = dedupeWithinFile(rows);
    expect(result[0].status).toBe("REJECTED");
  });
});
