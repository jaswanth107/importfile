import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";

export interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
}

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_ROWS = 50000;

export class FileValidationError extends Error {}

export function detectFileKind(originalName: string, mimetype: string): "csv" | "xlsx" | "xls" {
  const ext = originalName.toLowerCase().split(".").pop();
  if (ext === "csv" || mimetype === "text/csv") return "csv";
  if (ext === "xlsx") return "xlsx";
  if (ext === "xls") return "xls";
  throw new FileValidationError("Unsupported file type. Please upload a CSV, XLSX, or XLS file.");
}

export function parseFile(buffer: Buffer, kind: "csv" | "xlsx" | "xls"): ParsedFile {
  if (buffer.length === 0) {
    throw new FileValidationError("The file appears to be empty.");
  }
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new FileValidationError("The file is too large. Maximum size is 10 MB.");
  }

  let records: string[][];
  try {
    if (kind === "csv") {
      const text = buffer.toString("utf-8");
      records = parse(text, { skip_empty_lines: true, relax_column_count: true }) as string[][];
    } else {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("no sheets");
      const sheet = workbook.Sheets[sheetName];
      records = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, raw: false }) as string[][];
    }
  } catch {
    throw new FileValidationError("We couldn't read this file. It may be corrupted or in an unsupported format.");
  }

  if (records.length === 0) {
    throw new FileValidationError("The file doesn't contain any data.");
  }

  const headers = records[0].map((h) => (h ?? "").toString().trim());
  if (headers.length === 0 || headers.every((h) => !h)) {
    throw new FileValidationError("We couldn't find a header row in this file.");
  }

  const dataRows = records.slice(1).filter((r) => r.some((c) => (c ?? "").toString().trim() !== ""));
  if (dataRows.length === 0) {
    throw new FileValidationError("The file doesn't contain any data rows.");
  }
  if (dataRows.length > MAX_ROWS) {
    throw new FileValidationError(`The file has too many rows. Maximum supported is ${MAX_ROWS}.`);
  }

  const rows = dataRows.map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = (r[i] ?? "").toString();
    });
    return obj;
  });

  return { headers, rows };
}
