import * as XLSX from "xlsx";
import { prisma } from "../lib/prisma.js";
import { sanitizeForExport } from "../import/validate.js";

export interface CleanRow {
  name: string;
  email: string;
  phone: string;
  joiningDate: string;
}

export class PeopleServiceError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

export async function getAllPeople() {
  return prisma.person.findMany({ orderBy: { name: "asc" } });
}

function toCleanRows(people: Awaited<ReturnType<typeof getAllPeople>>): CleanRow[] {
  return people.map((p) => ({ name: p.name, email: p.email, phone: p.phone, joiningDate: p.joiningDate }));
}

function buildWorkbookBuffer(rows: CleanRow[]): Buffer {
  const header = ["Name", "Email", "Phone", "Joining Date"];
  const sheet = XLSX.utils.aoa_to_sheet([
    header,
    ...rows.map((r) => [sanitizeForExport(r.name), sanitizeForExport(r.email), sanitizeForExport(r.phone), sanitizeForExport(r.joiningDate)]),
  ]);
  sheet["!cols"] = [{ wch: 24 }, { wch: 28 }, { wch: 16 }, { wch: 14 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "People");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function buildPeopleWorkbook(): Promise<Buffer> {
  const people = await getAllPeople();
  return buildWorkbookBuffer(toCleanRows(people));
}

export async function listExportFiles(userId: string) {
  const files = await prisma.cleanExportFile.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, rowCount: true, createdAt: true, updatedAt: true },
  });
  return files;
}

async function getExportFileOrThrow(userId: string, fileId: string) {
  const file = await prisma.cleanExportFile.findUnique({ where: { id: fileId } });
  if (!file || file.userId !== userId) throw new PeopleServiceError("Generated file not found.", "NOT_FOUND");
  return file;
}

export async function createExportFile(userId: string, name: string) {
  const people = await getAllPeople();
  const rows = toCleanRows(people);
  const file = await prisma.cleanExportFile.create({
    data: { userId, name, rowsJson: JSON.stringify(rows), rowCount: rows.length },
  });
  return file;
}

export async function addToExportFile(userId: string, fileId: string) {
  const file = await getExportFileOrThrow(userId, fileId);
  const existingRows: CleanRow[] = JSON.parse(file.rowsJson);
  const people = await getAllPeople();
  const currentRows = toCleanRows(people);

  const merged = new Map<string, CleanRow>();
  for (const row of existingRows) merged.set(row.email, row);
  for (const row of currentRows) merged.set(row.email, row);
  const rows = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));

  const updated = await prisma.cleanExportFile.update({
    where: { id: fileId },
    data: { rowsJson: JSON.stringify(rows), rowCount: rows.length },
  });
  return updated;
}

export async function deleteExportFile(userId: string, fileId: string) {
  await getExportFileOrThrow(userId, fileId);
  await prisma.cleanExportFile.delete({ where: { id: fileId } });
}

export async function buildExportFileWorkbook(userId: string, fileId: string): Promise<{ buffer: Buffer; name: string }> {
  const file = await getExportFileOrThrow(userId, fileId);
  const rows: CleanRow[] = JSON.parse(file.rowsJson);
  return { buffer: buildWorkbookBuffer(rows), name: file.name };
}
