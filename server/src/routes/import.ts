import { Router } from "express";
import multer from "multer";
import { stringify } from "csv-stringify/sync";
import {
  createPreview,
  confirmImport,
  getHistory,
  getImportDetail,
  getRejectedCsv,
  buildImportReportWorkbook,
  rollbackImport,
  ImportError,
} from "../import/service.js";
import { FileValidationError } from "../import/parser.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../auth/middleware.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
export const importRouter = Router();

// Public: no user data, safe to fetch via a plain <a download> link (no Authorization header).
importRouter.get("/meta/sample-template.csv", (_req, res) => {
  const csv = stringify([
    ["Name", "Email", "Phone", "Joining Date"],
    ["John Smith", "john@example.com", "+919876543210", "2026-01-15"],
    ["Priya Sharma", "priya@example.com", "9876500000", "2026-02-01"],
  ]);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="sample-people-import.csv"');
  res.send(csv);
});

importRouter.use(requireAuth);

importRouter.post("/preview", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file was uploaded." });
  let mappingOverride: any = undefined;
  if (req.body.mapping) {
    try {
      mappingOverride = JSON.parse(req.body.mapping);
    } catch {
      return res.status(400).json({ error: "Invalid column mapping." });
    }
  }
  try {
    const result = await createPreview({
      fileName: req.file.originalname,
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      mappingOverride,
      userId: req.userId!,
    });
    res.json(result);
  } catch (err) {
    if (err instanceof FileValidationError) return res.status(400).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Something went wrong while processing your file. Please try again." });
  }
});

importRouter.get("/meta/dashboard", async (req, res) => {
  const userId = req.userId!;
  const totals = await prisma.importRun.aggregate({
    where: { userId },
    _sum: { created: true, updated: true, rejected: true },
    _count: { id: true },
  });
  const successfulImports = await prisma.importRun.count({ where: { userId, status: "CONFIRMED" } });
  const recent = await prisma.importRun.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      fileName: true,
      status: true,
      totalRows: true,
      created: true,
      updated: true,
      skipped: true,
      rejected: true,
      createdAt: true,
      confirmedAt: true,
    },
  });
  res.json({
    totalImports: totals._count.id,
    successfulImports,
    rowsImported: (totals._sum.created ?? 0) + (totals._sum.updated ?? 0),
    rowsRejected: totals._sum.rejected ?? 0,
    recent,
  });
});

importRouter.get("/history", async (req, res) => {
  res.json(await getHistory(req.userId!));
});

importRouter.post("/:id/confirm", async (req, res) => {
  try {
    const result = await confirmImport(req.params.id, req.userId!);
    res.json(result);
  } catch (err) {
    if (err instanceof ImportError) {
      const status = err.code === "NOT_FOUND" ? 404 : 409;
      return res.status(status).json({ error: err.message, code: err.code });
    }
    console.error(err);
    res.status(500).json({ error: "We couldn't complete the import. No changes were saved." });
  }
});

importRouter.post("/:id/rollback", async (req, res) => {
  try {
    const result = await rollbackImport(req.params.id, req.userId!);
    res.json(result);
  } catch (err) {
    if (err instanceof ImportError) return res.status(409).json({ error: err.message, code: err.code });
    console.error(err);
    res.status(500).json({ error: "Rollback failed." });
  }
});

importRouter.get("/:id", async (req, res) => {
  try {
    const run = await getImportDetail(req.params.id, req.userId!);
    res.json(run);
  } catch (err) {
    if (err instanceof ImportError) return res.status(404).json({ error: err.message });
    throw err;
  }
});

importRouter.get("/:id/rejected.csv", async (req, res) => {
  try {
    const csv = await getRejectedCsv(req.params.id, req.userId!);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="rejected-${req.params.id}.csv"`);
    res.send(csv);
  } catch (err) {
    if (err instanceof ImportError) return res.status(404).json({ error: err.message });
    throw err;
  }
});

importRouter.get("/:id/report.xlsx", async (req, res) => {
  try {
    const workbook = await buildImportReportWorkbook(req.params.id, req.userId!);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="import-report-${req.params.id}.xlsx"`);
    res.send(workbook);
  } catch (err) {
    if (err instanceof ImportError) return res.status(404).json({ error: err.message });
    throw err;
  }
});
