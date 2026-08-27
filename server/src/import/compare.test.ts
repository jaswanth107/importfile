import { describe, expect, it } from "vitest";
import { compareWithDatabase } from "./compare.js";
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

describe("compareWithDatabase", () => {
  it("marks a row CREATED when no existing person matches the email", () => {
    const [result] = compareWithDatabase([row({})], new Map());
    expect(result.status).toBe("CREATED");
  });

  it("marks a row SKIPPED when the normalized data is identical to the existing record", () => {
    const existing = new Map([["john@gmail.com", { id: "p1", name: "John Smith", phone: "+919876543210", joiningDate: "2026-01-01" }]]);
    const [result] = compareWithDatabase([row({})], existing);
    expect(result.status).toBe("SKIPPED");
  });

  it("marks a row UPDATED with exact before/after changes when data differs", () => {
    const existing = new Map([["john@gmail.com", { id: "p1", name: "John Smith", phone: "+919876543210", joiningDate: "2026-08-01" }]]);
    const [result] = compareWithDatabase([row({ joiningDate: "2026-08-05" })], existing);
    expect(result.status).toBe("UPDATED");
    expect(result.changes).toEqual([{ field: "Joining Date", before: "2026-08-01", after: "2026-08-05" }]);
  });

  it("does not overwrite existing data with an already-rejected row", () => {
    const existing = new Map([["john@gmail.com", { id: "p1", name: "John Smith", phone: "+919876543210", joiningDate: "2026-01-01" }]]);
    const [result] = compareWithDatabase([row({ status: "REJECTED", reason: "Invalid phone number." })], existing);
    expect(result.status).toBe("REJECTED");
  });
});
