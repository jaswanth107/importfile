import * as XLSX from "xlsx";
import { prisma } from "../lib/prisma.js";
import { buildPreview, resolveMapping } from "./pipeline.js";
import { parseFile, detectFileKind, type ParsedFile } from "./parser.js";
import { compareWithDatabase, type ExistingPerson } from "./compare.js";
import { sanitizeForExport } from "./validate.js";
import type { FieldKey } from "./mapper.js";
import type { ImportPreview, RowResult } from "./types.js";

export const PREVIEW_TTL_MS = 30 * 60 * 1000; // 30 minutes

export async function generateImportId(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.importRun.count();
  return `IMP-${year}-${String(count + 1).padStart(6, "0")}`;
}

async function lookupExisting(emails: string[]): Promise<Map<string, ExistingPerson>> {
  if (emails.length === 0) return new Map();
  const people = await prisma.person.findMany({ where: { email: { in: emails } } });
  return new Map(people.map((p) => [p.email, { id: p.id, name: p.name, phone: p.phone, joiningDate: p.joiningDate }]));
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
      lookupExisting,
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
  const fresh = await lookupExisting(emails);
  const revalidated = compareWithDatabase(preview.rows, fresh);

  const finalRows: RowResult[] = [];
  const counts = { created: 0, updated: 0, skipped: 0, rejected: 0 };

  await prisma.$transaction(async (tx) => {
    for (const row of revalidated) {
      if (row.status === "REJECTED") {
        counts.rejected++;
        finalRows.push(row);
        continue;
      }
      if (row.status === "SKIPPED") {
        counts.skipped++;
        finalRows.push(row);
        continue;
      }

      if (row.status === "CREATED") {
        try {
          const person = await tx.person.create({
            data: {
              name: row.name,
              email: row.email,
              phone: row.phone,
              joiningDate: row.joiningDate,
              createdByImportId: importId,
            },
          });
          counts.created++;
          finalRows.push({ ...row, personId: person.id });
        } catch (err: any) {
          if (err?.code === "P2002") {
            // Race: another process created this email between revalidation and write. Treat as update.
            const existing = await tx.person.findUnique({ where: { email: row.email } });
            if (existing) {
              const updated = await tx.person.update({
                where: { id: existing.id },
                data: { name: row.name, phone: row.phone, joiningDate: row.joiningDate },
              });
              counts.updated++;
              finalRows.push({ ...row, status: "UPDATED", personId: updated.id });
              continue;
            }
          }
          throw err;
        }
      } else if (row.status === "UPDATED" && row.personId) {
        const previous = await tx.person.findUnique({ where: { id: row.personId } });
        const updated = await tx.person.update({
          where: { id: row.personId },
          data: { name: row.name, phone: row.phone, joiningDate: row.joiningDate },
        });
        counts.updated++;
        finalRows.push({ ...row, personId: updated.id, raw: { ...row.raw, __previous: previous ? JSON.stringify(previous) : "" } });
      }
    }

    for (const row of finalRows) {
      await tx.importRowResult.create({
        data: {
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
        },
      });
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
  });

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

  await prisma.$transaction(async (tx) => {
    for (const row of run.rows) {
      if (row.status === "CREATED" && row.personId) {
        const person = await tx.person.findUnique({ where: { id: row.personId } });
        if (person && person.name === row.name && person.phone === row.phone && person.joiningDate === row.joiningDate) {
          await tx.person.delete({ where: { id: row.personId } });
          results.deleted++;
        } else {
          results.skipped++;
        }
      } else if (row.status === "UPDATED" && row.personId && row.previousJson) {
        const person = await tx.person.findUnique({ where: { id: row.personId } });
        const previous = JSON.parse(row.previousJson);
        if (person && person.name === row.name && person.phone === row.phone && person.joiningDate === row.joiningDate) {
          await tx.person.update({
            where: { id: row.personId },
            data: { name: previous.name, phone: previous.phone, joiningDate: previous.joiningDate },
          });
          results.restored++;
        } else {
          results.skipped++;
        }
      }
    }
    await tx.undoLog.create({ data: { importRunId: importId } });
    await tx.importRun.update({ where: { id: importId }, data: { status: "ROLLED_BACK" } });
    await tx.importEvent.create({
      data: { importRunId: importId, type: "IMPORT_ROLLED_BACK", message: `Rolled back: ${results.deleted} deleted, ${results.restored} restored, ${results.skipped} skipped (changed since import)` },
    });
  });

  return results;
}
