import { Router } from "express";
import {
  getAllPeople,
  buildPeopleWorkbook,
  listExportFiles,
  createExportFile,
  addToExportFile,
  deleteExportFile,
  buildExportFileWorkbook,
  PeopleServiceError,
} from "../people/service.js";
import { requireAuth } from "../auth/middleware.js";

export const peopleRouter = Router();

peopleRouter.use(requireAuth);

peopleRouter.get("/", async (req, res) => {
  const people = await getAllPeople(req.userId!);
  res.json(
    people.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      joiningDate: p.joiningDate,
      createdAt: p.createdAt,
    }))
  );
});

peopleRouter.get("/export.xlsx", async (req, res) => {
  const workbook = await buildPeopleWorkbook(req.userId!);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="people-clean.xlsx"');
  res.send(workbook);
});

peopleRouter.get("/files", async (req, res) => {
  res.json(await listExportFiles(req.userId!));
});

peopleRouter.post("/files", async (req, res) => {
  const { mode, name, targetId } = req.body as { mode?: "new" | "existing"; name?: string; targetId?: string };
  try {
    if (mode === "existing") {
      if (!targetId) return res.status(400).json({ error: "Choose which existing file to add to." });
      const file = await addToExportFile(req.userId!, targetId);
      return res.json(file);
    }
    if (!name || !name.trim()) return res.status(400).json({ error: "Give the new file a name." });
    const file = await createExportFile(req.userId!, name.trim());
    res.status(201).json(file);
  } catch (err) {
    if (err instanceof PeopleServiceError) return res.status(404).json({ error: err.message, code: err.code });
    throw err;
  }
});

peopleRouter.get("/files/:id/download.xlsx", async (req, res) => {
  try {
    const { buffer, name } = await buildExportFileWorkbook(req.userId!, req.params.id);
    const safeName = name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "clean-data";
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    if (err instanceof PeopleServiceError) return res.status(404).json({ error: err.message, code: err.code });
    throw err;
  }
});

peopleRouter.delete("/files/:id", async (req, res) => {
  try {
    await deleteExportFile(req.userId!, req.params.id);
    res.status(204).end();
  } catch (err) {
    if (err instanceof PeopleServiceError) return res.status(404).json({ error: err.message, code: err.code });
    throw err;
  }
});
