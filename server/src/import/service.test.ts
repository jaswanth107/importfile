import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { createPreview, confirmImport, getHistory, getRejectedCsv, rollbackImport, ImportError } from "./service.js";

function csv(rows: string[][]): Buffer {
  const header = "Name,Email,Phone,Joining Date";
  const body = rows.map((r) => r.join(",")).join("\n");
  return Buffer.from(`${header}\n${body}`, "utf-8");
}

async function resetDb() {
  await prisma.importRowResult.deleteMany();
  await prisma.importEvent.deleteMany();
  await prisma.undoLog.deleteMany();
  await prisma.importRun.deleteMany();
  await prisma.person.deleteMany();
}

beforeEach(async () => {
  await resetDb();
});

describe("preview safety", () => {
  it("never writes to the Person table while generating a preview", async () => {
    const before = await prisma.person.count();
    await createPreview({
      fileName: "people.csv",
      buffer: csv([["John Smith", "john@gmail.com", "9876543210", "2026-01-15"]]),
      mimetype: "text/csv",
    });
    const after = await prisma.person.count();
    expect(after).toBe(before);
    expect(after).toBe(0);
  });
});

describe("confirmImport", () => {
  it("writes created/updated/skipped rows correctly inside a transaction", async () => {
    await prisma.person.create({ data: { name: "Old Name", email: "existing@gmail.com", phone: "+919999999999", joiningDate: "2026-01-01" } });

    const { preview } = await createPreview({
      fileName: "people.csv",
      buffer: csv([
        ["John Smith", "john@gmail.com", "9876543210", "2026-01-15"],
        ["New Name", "existing@gmail.com", "9999999999", "2026-06-01"],
      ]),
      mimetype: "text/csv",
    });

    const result = await confirmImport(preview.importId);
    expect(result.counts).toEqual({ created: 1, updated: 1, skipped: 0, rejected: 0 });

    const john = await prisma.person.findUnique({ where: { email: "john@gmail.com" } });
    expect(john?.name).toBe("John Smith");

    const existing = await prisma.person.findUnique({ where: { email: "existing@gmail.com" } });
    expect(existing?.name).toBe("New Name");
    expect(existing?.joiningDate).toBe("2026-06-01");
  });

  it("rejects an expired preview without writing", async () => {
    const { preview } = await createPreview({
      fileName: "people.csv",
      buffer: csv([["John Smith", "john@gmail.com", "9876543210", "2026-01-15"]]),
      mimetype: "text/csv",
    });
    await prisma.importRun.update({ where: { id: preview.importId }, data: { previewExpiresAt: new Date(Date.now() - 1000) } });

    await expect(confirmImport(preview.importId)).rejects.toThrow(/expired/i);
    expect(await prisma.person.count()).toBe(0);
  });

  it("is idempotent: importing the same file twice creates no duplicates", async () => {
    const file = csv([
      ["John Smith", "john@gmail.com", "9876543210", "2026-01-15"],
      ["Priya Sharma", "priya@gmail.com", "9876500000", "2026-02-01"],
    ]);

    const first = await createPreview({ fileName: "people.csv", buffer: file, mimetype: "text/csv" });
    const firstResult = await confirmImport(first.preview.importId);
    expect(firstResult.counts).toEqual({ created: 2, updated: 0, skipped: 0, rejected: 0 });

    const second = await createPreview({ fileName: "people.csv", buffer: file, mimetype: "text/csv" });
    const secondResult = await confirmImport(second.preview.importId);
    expect(secondResult.counts).toEqual({ created: 0, updated: 0, skipped: 2, rejected: 0 });

    expect(await prisma.person.count()).toBe(2);
  });

  it("enforces email uniqueness at the database level under concurrent confirmation", async () => {
    const fileA = csv([["John Smith", "john@gmail.com", "9876543210", "2026-01-15"]]);
    const fileB = csv([["John S. Smith", "JOHN@gmail.com", "9876543210", "2026-01-15"]]);

    const [a, b] = await Promise.all([
      createPreview({ fileName: "a.csv", buffer: fileA, mimetype: "text/csv" }),
      createPreview({ fileName: "b.csv", buffer: fileB, mimetype: "text/csv" }),
    ]);

    await Promise.all([confirmImport(a.preview.importId), confirmImport(b.preview.importId)]);

    const people = await prisma.person.findMany({ where: { email: "john@gmail.com" } });
    expect(people).toHaveLength(1);
  });

  it("does not let an invalid uploaded value overwrite a valid existing value", async () => {
    await prisma.person.create({ data: { name: "John Smith", email: "john@gmail.com", phone: "+919876543210", joiningDate: "2026-01-01" } });
    const { preview } = await createPreview({
      fileName: "people.csv",
      buffer: csv([["John Smith", "john@gmail.com", "abc123", "2026-01-01"]]),
      mimetype: "text/csv",
    });
    expect(preview.rows[0].status).toBe("REJECTED");

    await confirmImport(preview.importId);
    const person = await prisma.person.findUnique({ where: { email: "john@gmail.com" } });
    expect(person?.phone).toBe("+919876543210");
  });
});

describe("rejected row export", () => {
  it("includes original values, row number, and reason", async () => {
    const { preview } = await createPreview({
      fileName: "people.csv",
      buffer: csv([["", "bad@gmail.com", "9876543210", "2026-01-01"]]),
      mimetype: "text/csv",
    });
    await confirmImport(preview.importId);
    const output = await getRejectedCsv(preview.importId);
    expect(output).toContain("bad@gmail.com");
    expect(output).toMatch(/name/i);
  });
});

describe("import history", () => {
  it("records a confirmed import with the correct summary and status", async () => {
    const { preview } = await createPreview({
      fileName: "team.csv",
      buffer: csv([["John Smith", "john@gmail.com", "9876543210", "2026-01-15"]]),
      mimetype: "text/csv",
    });
    await confirmImport(preview.importId);
    const history = await getHistory();
    const entry = history.find((h) => h.id === preview.importId);
    expect(entry).toMatchObject({ fileName: "team.csv", status: "CONFIRMED", created: 1 });
  });
});

describe("rollback", () => {
  it("undoes a created record that has not changed since import", async () => {
    const { preview } = await createPreview({
      fileName: "people.csv",
      buffer: csv([["John Smith", "john@gmail.com", "9876543210", "2026-01-15"]]),
      mimetype: "text/csv",
    });
    await confirmImport(preview.importId);
    expect(await prisma.person.count()).toBe(1);

    const result = await rollbackImport(preview.importId);
    expect(result.deleted).toBe(1);
    expect(await prisma.person.count()).toBe(0);
  });

  it("refuses to roll back twice", async () => {
    const { preview } = await createPreview({
      fileName: "people.csv",
      buffer: csv([["John Smith", "john@gmail.com", "9876543210", "2026-01-15"]]),
      mimetype: "text/csv",
    });
    await confirmImport(preview.importId);
    await rollbackImport(preview.importId);
    await expect(rollbackImport(preview.importId)).rejects.toThrow(ImportError);
  });
});
