import * as XLSX from "xlsx";
import { customAlphabet } from "nanoid";
import { prisma } from "../lib/prisma.js";
import type { Prisma } from "@prisma/client";
import { buildPreview, resolveMapping } from "./pipeline.js";
import { parseFile, detectFileKind, type ParsedFile } from "./parser.js";
import { compareWithDatabase, type ExistingPerson } from "./compare.js";
import { sanitizeForExport } from "./validate.js";
import type { FieldKey } from "./mapper.js";
import type { ImportPreview, RowResult } from "./types.js";

export const PREVIEW_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Number of rows written per database round-trip when confirming/rolling back an
// import. Bulk operations (createMany / raw multi-row UPDATE) instead of one
// query per row are what let a 50k-row import finish inside the transaction
// timeout; this only bounds how big any single statement gets.
const WRITE_BATCH_SIZE = 1000;

const generatePersonId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 24);

type Tx = Prisma.TransactionClient;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function generateImportId(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.importRun.count();
  return `IMP-${year}-${String(count + 1).padStart(6, "0")}`;
}

async function lookupExisting(emails: string[], userId: string): Promise<Map<string, ExistingPerson>> {
  if (emails.length === 0) return new Map();
  const people = await prisma.person.findMany({ where: { userId, email: { in: emails } } });
  return new Map(people.map((p) => [p.email, { id: p.id, name: p.name, phone: p.phone, joiningDate: p.joiningDate }]));
}

// Bulk-updates name/phone/joiningDate for many people in a single statement.
// Prisma has no multi-row "update with per-row values" API, so this is raw SQL;
// the userId predicate keeps it from ever touching another user's records.
async function bulkUpdatePersons(
  tx: Tx,
  userId: string,
  rows: { personId: string; name: string; phone: string; joiningDate: string }[]
): Promise<void> {
  if (rows.length === 0) return;
  const ids = rows.map((r) => r.personId);
  const names = rows.map((r) => r.name);
  const phones = rows.map((r) => r.phone);
  const dates = rows.map((r) => r.joiningDate);
  await tx.$executeRaw`
    UPDATE "Person" AS p
    SET "name" = v.name, "phone" = v.phone, "joiningDate" = v."joiningDate", "updatedAt" = now()
    FROM unnest(${ids}::text[], ${names}::text[], ${phones}::text[], ${dates}::text[]) AS v(id, name, phone, "joiningDate")
    WHERE p.id = v.id AND p."userId" = ${userId}
  `;
}

export class ImportError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

export interface PreviewOptions {
  fileName: string;
  buffer: Buffer;
  mimetype: string;
  mappingOverride?: Partial<Record<FieldKey, string>>;
  userId: string;
}

export interface PreviewResponse {
  preview: ImportPreview;
  mapping: Partial<Record<FieldKey, string>>;
  unmapped: FieldKey[];
  needsMapping: boolean;
  headers: string[];
}

export async function createPreview(opts: PreviewOptions): Promise<PreviewResponse> {
  const kind = detectFileKind(opts.fileName, opts.mimetype);
  const parsed: ParsedFile = parseFile(opts.buffer, kind);
  const { mapping, unmapped, confident } = resolveMapping(parsed.headers, opts.mappingOverride);

  if (!confident) {
    return { preview: null as unknown as ImportPreview, mapping, unmapped, needsMapping: true, headers: parsed.headers };
  }

  let preview: ImportPreview | undefined;
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const importId = await generateImportId();
    const candidatePreview = await buildPreview({
      importId,
      fileName: opts.fileName,
      parsed,
      mappingOverride: opts.mappingOverride,
      lookupExisting: (emails) => lookupExisting(emails, opts.userId),
      now: () => new Date(),
      previewTtlMs: PREVIEW_TTL_MS,
    });

    try {
      await prisma.importRun.create({
        data: {
          id: importId,
          fileName: opts.fileName,
          status: "PENDING",
          totalRows: candidatePreview.totalRows,
          created: candidatePreview.counts.created,
          updated: candidatePreview.counts.updated,
          skipped: candidatePreview.counts.skipped,
          rejected: candidatePreview.counts.rejected,
          warnings: candidatePreview.counts.warnings,
          previewJson: JSON.stringify(candidatePreview),
          previewExpiresAt: new Date(candidatePreview.expiresAt),
          userId: opts.userId,
          events: { create: { type: "PREVIEW_GENERATED", message: `Preview generated for ${opts.fileName}` } },
        },
      });
      preview = candidatePreview;
      break;
    } catch (err: any) {
      // Two imports generated the same sequential ID concurrently — regenerate and retry.
      if (err?.code === "P2002" && attempt < maxAttempts) continue;
      throw err;
    }
  }

  return { preview: preview!, mapping, unmapped, needsMapping: false, headers: parsed.headers };
}

export async function confirmImport(importId: string, userId: string) {
  const run = await prisma.importRun.findUnique({ where: { id: importId } });
  if (!run || run.userId !== userId) throw new ImportError("Import not found.", "NOT_FOUND");
  if (run.status !== "PENDING") throw new ImportError("This import has already been processed.", "ALREADY_PROCESSED");
  if (run.previewExpiresAt.getTime() < Date.now()) {
    throw new ImportError("This preview has expired. Please upload the file again to generate a fresh preview.", "EXPIRED");
  }

  const preview = JSON.parse(run.previewJson) as ImportPreview;
  const candidateRows = preview.rows.filter((r) => r.status === "CREATED" || r.status === "UPDATED");
  const emails = candidateRows.map((r) => r.email);
  const fresh = await lookupExisting(emails, userId);
  const revalidated = compareWithDatabase(preview.rows, fresh);

  const finalRows: RowResult[] = [];
  const counts = { created: 0, updated: 0, skipped: 0, rejected: 0 };

  const toCreate = revalidated.filter((r) => r.status === "CREATED");
  const toUpdate = revalidated.filter((r) => r.status === "UPDATED" && r.personId);

  for (const row of revalidated) {
    if (row.status === "REJECTED") {
      counts.rejected++;
      finalRows.push(row);
    } else if (row.status === "SKIPPED") {
      counts.skipped++;
      finalRows.push(row);
    }
  }

  // Large imports (tens of thousands of rows) must not turn into one
  // Prisma call per row - that's what previously blew the transaction
  // timeout around ~600 rows. Instead, writes go through in fixed-size
  // batches: one createMany per batch for new people, one raw multi-row
  // UPDATE per batch for changed ones. The whole thing still runs inside a
  // single transaction so a failure partway through rolls back cleanly and
  // never leaves a half-imported file behind.
  await prisma.$transaction(
    async (tx) => {
      const generatedIdByEmail = new Map<string, string>();
      for (const rowBatch of chunk(toCreate, WRITE_BATCH_SIZE)) {
        const data = rowBatch.map((row) => {
          const id = generatePersonId();
          generatedIdByEmail.set(row.email, id);
          return {
            id,
            userId,
            name: row.name,
            email: row.email,
            phone: row.phone,
            joiningDate: row.joiningDate,
            createdByImportId: importId,
          };
        });
        // skipDuplicates guards against a rare race: someone else imported
        // the same email (for this user) between revalidation and this write.
        await tx.person.createMany({ data, skipDuplicates: true });
      }

      // Reconcile: anything we intended to create but that skipDuplicates
      // silently dropped lost the race and already exists - fold those into
      // the update batch instead of losing the row.
      const raceUpdates: { personId: string; row: RowResult }[] = [];
      if (toCreate.length > 0) {
        const landed = await tx.person.findMany({
          where: { userId, email: { in: toCreate.map((r) => r.email) } },
          select: { id: true, email: true },
        });
        const landedByEmail = new Map(landed.map((p) => [p.email, p.id]));
        for (const row of toCreate) {
          const expectedId = generatedIdByEmail.get(row.email);
          const actualId = landedByEmail.get(row.email);
          if (!actualId) throw new Error(`Failed to create person for row ${row.rowNumber} (${row.email}).`);
          if (actualId === expectedId) {
            counts.created++;
            finalRows.push({ ...row, personId: actualId });
          } else {
            raceUpdates.push({ personId: actualId, row });
          }
        }
      }

      const allUpdates = [
        ...toUpdate.map((row) => ({ personId: row.personId!, row })),
        ...raceUpdates,
      ];

      if (allUpdates.length > 0) {
        const previousList = await tx.person.findMany({
          where: { userId, id: { in: allUpdates.map((u) => u.personId) } },
        });
        const previousById = new Map(previousList.map((p) => [p.id, p]));

        for (const updateBatch of chunk(allUpdates, WRITE_BATCH_SIZE)) {
          await bulkUpdatePersons(
            tx,
            userId,
            updateBatch.map((u) => ({ personId: u.personId, name: u.row.name, phone: u.row.phone, joiningDate: u.row.joiningDate }))
          );
        }

        for (const { personId, row } of allUpdates) {
          const previous = previousById.get(personId);
          counts.updated++;
          finalRows.push({
            ...row,
            status: "UPDATED",
            personId,
            raw: { ...row.raw, __previous: previous ? JSON.stringify(previous) : "" },
          });
        }
      }

      const rowResultData = finalRows.map((row) => ({
        importRunId: importId,
        rowNumber: row.rowNumber,
        name: row.name,
        email: row.email,
        phone: row.phone,
        joiningDate: row.joiningDate,
        status: row.status,
        reason: row.reason,
        warnings: JSON.stringify(row.warnings),
        changesJson: JSON.stringify(row.changes),
        personId: row.personId,
        previousJson: row.raw.__previous || undefined,
      }));
      for (const batch of chunk(rowResultData, WRITE_BATCH_SIZE)) {
        await tx.importRowResult.createMany({ data: batch });
      }

      await tx.importRun.update({
        where: { id: importId },
        data: {
          status: "CONFIRMED",
          confirmedAt: new Date(),
          created: counts.created,
          updated: counts.updated,
          skipped: counts.skipped,
          rejected: counts.rejected,
        },
      });

      await tx.importEvent.create({
        data: { importRunId: importId, type: "IMPORT_CONFIRMED", message: `Import confirmed: ${counts.created} created, ${counts.updated} updated` },
      });
    },
    { timeout: 60_000, maxWait: 15_000 }
  );

  finalRows.sort((a, b) => a.rowNumber - b.rowNumber);
  return { importId, counts, rows: finalRows };
}

export async function getHistory(userId: string) {
  const runs = await prisma.importRun.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  return runs.map((r) => ({
    id: r.id,
    fileName: r.fileName,
    status: r.status,
    totalRows: r.totalRows,
    created: r.created,
    updated: r.updated,
    skipped: r.skipped,
    rejected: r.rejected,
    createdAt: r.createdAt,
    confirmedAt: r.confirmedAt,
  }));
}

export async function getImportDetail(importId: string, userId: string) {
  const run = await prisma.importRun.findUnique({ where: { id: importId }, include: { rows: true, events: true } });
  if (!run || run.userId !== userId) throw new ImportError("Import not found.", "NOT_FOUND");
  return run;
}

export async function getRejectedCsv(importId: string, userId: string): Promise<string> {
  const run = await getImportDetail(importId, userId);
  const rejected = run.rows.filter((r) => r.status === "REJECTED");
  const header = ["Row", "Name", "Email", "Phone", "Joining Date", "Reason"];
  const lines = [header.join(",")];
  for (const r of rejected) {
    const cells = [String(r.rowNumber), r.name, r.email, r.phone, r.joiningDate, r.reason ?? ""].map((c) =>
      `"${sanitizeForExport(c).replace(/"/g, '""')}"`
    );
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

export async function buildImportReportWorkbook(importId: string, userId: string): Promise<Buffer> {
  const run = await getImportDetail(importId, userId);

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ["Import ID", run.id],
    ["File Name", sanitizeForExport(run.fileName)],
    ["Status", run.status],
    ["Total Rows", run.totalRows],
    ["Created", run.created],
    ["Updated", run.updated],
    ["Skipped", run.skipped],
    ["Rejected", run.rejected],
    ["Warnings", run.warnings],
    ["Created At", run.createdAt.toISOString()],
    ["Confirmed At", run.confirmedAt ? run.confirmedAt.toISOString() : ""],
  ]);
  summarySheet["!cols"] = [{ wch: 16 }, { wch: 40 }];

  const rowsHeader = ["Row", "Name", "Email", "Phone", "Joining Date", "Status", "Reason", "Warnings"];
  const rowsSheet = XLSX.utils.aoa_to_sheet([
    rowsHeader,
    ...run.rows
      .sort((a, b) => a.rowNumber - b.rowNumber)
      .map((r) => [
        r.rowNumber,
        sanitizeForExport(r.name),
        sanitizeForExport(r.email),
        sanitizeForExport(r.phone),
        sanitizeForExport(r.joiningDate),
        r.status,
        sanitizeForExport(r.reason ?? ""),
        sanitizeForExport(r.warnings ?? ""),
      ]),
  ]);
  rowsSheet["!cols"] = [{ wch: 6 }, { wch: 22 }, { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 30 }, { wch: 30 }];

  const eventsHeader = ["Time", "Type", "Message"];
  const eventsSheet = XLSX.utils.aoa_to_sheet([
    eventsHeader,
    ...run.events
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((e) => [e.createdAt.toISOString(), e.type, sanitizeForExport(e.message)]),
  ]);
  eventsSheet["!cols"] = [{ wch: 22 }, { wch: 20 }, { wch: 50 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
  XLSX.utils.book_append_sheet(workbook, rowsSheet, "Rows");
  XLSX.utils.book_append_sheet(workbook, eventsSheet, "Events");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function rollbackImport(importId: string, userId: string) {
  const run = await getImportDetail(importId, userId);
  if (run.status !== "CONFIRMED") throw new ImportError("Only confirmed imports can be rolled back.", "INVALID_STATE");

  const existingUndo = await prisma.undoLog.findUnique({ where: { importRunId: importId } });
  if (existingUndo) throw new ImportError("This import has already been rolled back.", "ALREADY_UNDONE");

  const results = { restored: 0, deleted: 0, skipped: 0 };

  const createdRows = run.rows.filter((r) => r.status === "CREATED" && r.personId);
  const updatedRows = run.rows.filter((r) => r.status === "UPDATED" && r.personId && r.previousJson);
  const personIds = [...createdRows, ...updatedRows].map((r) => r.personId!);

  await prisma.$transaction(
    async (tx) => {
      // One bulk fetch instead of a findUnique per row - the same pattern
      // that keeps confirmImport fast holds here for rollback of large imports.
      const people =
        personIds.length > 0 ? await tx.person.findMany({ where: { userId, id: { in: personIds } } }) : [];
      const peopleById = new Map(people.map((p) => [p.id, p]));

      const idsToDelete: string[] = [];
      for (const row of createdRows) {
        const person = peopleById.get(row.personId!);
        if (person && person.name === row.name && person.phone === row.phone && person.joiningDate === row.joiningDate) {
          idsToDelete.push(row.personId!);
          results.deleted++;
        } else {
          results.skipped++;
        }
      }
      for (const batch of chunk(idsToDelete, WRITE_BATCH_SIZE)) {
        await tx.person.deleteMany({ where: { userId, id: { in: batch } } });
      }

      const toRestore: { personId: string; name: string; phone: string; joiningDate: string }[] = [];
      for (const row of updatedRows) {
        const person = peopleById.get(row.personId!);
        const previous = JSON.parse(row.previousJson!);
        if (person && person.name === row.name && person.phone === row.phone && person.joiningDate === row.joiningDate) {
          toRestore.push({ personId: row.personId!, name: previous.name, phone: previous.phone, joiningDate: previous.joiningDate });
          results.restored++;
        } else {
          results.skipped++;
        }
      }
      for (const batch of chunk(toRestore, WRITE_BATCH_SIZE)) {
        await bulkUpdatePersons(tx, userId, batch);
      }

      await tx.undoLog.create({ data: { importRunId: importId } });
      await tx.importRun.update({ where: { id: importId }, data: { status: "ROLLED_BACK" } });
      await tx.importEvent.create({
        data: { importRunId: importId, type: "IMPORT_ROLLED_BACK", message: `Rolled back: ${results.deleted} deleted, ${results.restored} restored, ${results.skipped} skipped (changed since import)` },
      });
    },
    { timeout: 60_000, maxWait: 15_000 }
  );

  return results;
}
