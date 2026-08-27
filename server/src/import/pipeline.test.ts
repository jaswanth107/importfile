import { describe, expect, it } from "vitest";
import { buildPreview } from "./pipeline.js";
import type { ExistingPerson } from "./compare.js";

const headers = ["Name", "Email", "Phone", "Joining Date"];

function makeParsed(rows: string[][]) {
  return {
    headers,
    rows: rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]]))),
  };
}

describe("buildPreview", () => {
  it("produces created/updated/skipped/rejected rows with correct counts", async () => {
    const parsed = makeParsed([
      ["John Smith", "john@gmail.com", "9876543210", "2026-01-15"], // CREATED (new)
      ["Priya Sharma", "priya@gmail.com", "9876500000", "2026-02-01"], // UPDATED (existing, changed phone)
      ["Existing Person", "existing@gmail.com", "9999999999", "2026-01-01"], // SKIPPED (identical)
      ["", "bad@gmail.com", "9876543210", "2026-01-01"], // REJECTED (missing name)
    ]);

    const existing = new Map<string, ExistingPerson>([
      ["priya@gmail.com", { id: "p1", name: "Priya Sharma", phone: "+919876511111", joiningDate: "2026-02-01" }],
      ["existing@gmail.com", { id: "p2", name: "Existing Person", phone: "+919999999999", joiningDate: "2026-01-01" }],
    ]);

    const preview = await buildPreview({
      importId: "IMP-TEST-1",
      fileName: "test.csv",
      parsed,
      lookupExisting: async () => existing,
      now: () => new Date("2026-08-26T00:00:00Z"),
      previewTtlMs: 30 * 60 * 1000,
    });

    expect(preview.counts).toEqual({ created: 1, updated: 1, skipped: 1, rejected: 1, warnings: 4 });
    const byEmail = Object.fromEntries(preview.rows.map((r) => [r.email, r]));
    expect(byEmail["john@gmail.com"].status).toBe("CREATED");
    expect(byEmail["priya@gmail.com"].status).toBe("UPDATED");
    expect(byEmail["priya@gmail.com"].changes).toEqual([{ field: "Phone", before: "+919876511111", after: "+919876500000" }]);
    expect(byEmail["existing@gmail.com"].status).toBe("SKIPPED");
    expect(byEmail["bad@gmail.com"].status).toBe("REJECTED");
  });

  it("sets a 30 minute preview expiration", async () => {
    const parsed = makeParsed([["John Smith", "john@gmail.com", "9876543210", "2026-01-15"]]);
    const now = new Date("2026-08-26T00:00:00Z");
    const preview = await buildPreview({
      importId: "IMP-TEST-2",
      fileName: "test.csv",
      parsed,
      lookupExisting: async () => new Map(),
      now: () => now,
      previewTtlMs: 30 * 60 * 1000,
    });
    expect(new Date(preview.expiresAt).getTime() - now.getTime()).toBe(30 * 60 * 1000);
  });
});
