import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { createPreview, confirmImport, getHistory, getRejectedCsv, rollbackImport, ImportError } from "./service.js";

const TEST_USER_ID = "test-user-1";

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
  await prisma.user.deleteMany();
  await prisma.user.create({
    data: { id: TEST_USER_ID, username: "testuser", email: "testuser@example.com", passwordHash: "not-a-real-hash" },
  });
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
      userId: TEST_USER_ID,
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
      userId: TEST_USER_ID,
    });

    const result = await confirmImport(preview.importId, TEST_USER_ID);
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
      userId: TEST_USER_ID,
    });
    await prisma.importRun.update({ where: { id: preview.importId }, data: { previewExpiresAt: new Date(Date.now() - 1000) } });

    await expect(confirmImport(preview.importId, TEST_USER_ID)).rejects.toThrow(/expired/i);
    expect(await prisma.person.count()).toBe(0);
  });

  it("is idempotent: importing the same file twice creates no duplicates", async () => {
    const file = csv([
      ["John Smith", "john@gmail.com", "9876543210", "2026-01-15"],
      ["Priya Sharma", "priya@gmail.com", "9876500000", "2026-02-01"],
    ]);

    const first = await createPreview({ fileName: "people.csv", buffer: file, mimetype: "text/csv", userId: TEST_USER_ID });
    const firstResult = await confirmImport(first.preview.importId, TEST_USER_ID);
    expect(firstResult.counts).toEqual({ created: 2, updated: 0, skipped: 0, rejected: 0 });

    const second = await createPreview({ fileName: "people.csv", buffer: file, mimetype: "text/csv", userId: TEST_USER_ID });
    const secondResult = await confirmImport(second.preview.importId, TEST_USER_ID);
    expect(secondResult.counts).toEqual({ created: 0, updated: 0, skipped: 2, rejected: 0 });

    expect(await prisma.person.count()).toBe(2);
  });

  it("enforces email uniqueness at the database level under concurrent confirmation", async () => {
    const fileA = csv([["John Smith", "john@gmail.com", "9876543210", "2026-01-15"]]);
    const fileB = csv([["John S. Smith", "JOHN@gmail.com", "9876543210", "2026-01-15"]]);

    const [a, b] = await Promise.all([
      createPreview({ fileName: "a.csv", buffer: fileA, mimetype: "text/csv", userId: TEST_USER_ID }),
      createPreview({ fileName: "b.csv", buffer: fileB, mimetype: "text/csv", userId: TEST_USER_ID }),
    ]);

    await Promise.all([confirmImport(a.preview.importId, TEST_USER_ID), confirmImport(b.preview.importId, TEST_USER_ID)]);

    const people = await prisma.person.findMany({ where: { email: "john@gmail.com" } });
    expect(people).toHaveLength(1);
  });

  it("does not let an invalid uploaded value overwrite a valid existing value", async () => {
    await prisma.person.create({ data: { name: "John Smith", email: "john@gmail.com", phone: "+919876543210", joiningDate: "2026-01-01" } });
    const { preview } = await createPreview({
      fileName: "people.csv",
      buffer: csv([["John Smith", "john@gmail.com", "abc123", "2026-01-01"]]),
      mimetype: "text/csv",
      userId: TEST_USER_ID,
    });
    expect(preview.rows[0].status).toBe("REJECTED");

    await confirmImport(preview.importId, TEST_USER_ID);
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
      userId: TEST_USER_ID,
    });
    await confirmImport(preview.importId, TEST_USER_ID);
    const output = await getRejectedCsv(preview.importId, TEST_USER_ID);
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
      userId: TEST_USER_ID,
    });
    await confirmImport(preview.importId, TEST_USER_ID);
    const history = await getHistory(TEST_USER_ID);
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
      userId: TEST_USER_ID,
    });
    await confirmImport(preview.importId, TEST_USER_ID);
    expect(await prisma.person.count()).toBe(1);

    const result = await rollbackImport(preview.importId, TEST_USER_ID);
    expect(result.deleted).toBe(1);
    expect(await prisma.person.count()).toBe(0);
  });

  it("refuses to roll back twice", async () => {
    const { preview } = await createPreview({
      fileName: "people.csv",
      buffer: csv([["John Smith", "john@gmail.com", "9876543210", "2026-01-15"]]),
      mimetype: "text/csv",
      userId: TEST_USER_ID,
    });
    await confirmImport(preview.importId, TEST_USER_ID);
    await rollbackImport(preview.importId, TEST_USER_ID);
    await expect(rollbackImport(preview.importId, TEST_USER_ID)).rejects.toThrow(ImportError);
  });
});
