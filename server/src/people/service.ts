import * as XLSX from "xlsx";
import { prisma } from "../lib/prisma.js";
import { sanitizeForExport } from "../import/validate.js";

export async function getAllPeople() {
  return prisma.person.findMany({ orderBy: { name: "asc" } });
}

export async function buildPeopleWorkbook(): Promise<Buffer> {
  const people = await getAllPeople();

  const header = ["Name", "Email", "Phone", "Joining Date", "Added On"];
  const sheet = XLSX.utils.aoa_to_sheet([
    header,
    ...people.map((p) => [
      sanitizeForExport(p.name),
      sanitizeForExport(p.email),
      sanitizeForExport(p.phone),
      sanitizeForExport(p.joiningDate),
      p.createdAt.toISOString(),
    ]),
  ]);
  sheet["!cols"] = [{ wch: 24 }, { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 22 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "People");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
