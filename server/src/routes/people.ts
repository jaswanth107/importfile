import { Router } from "express";
import { getAllPeople, buildPeopleWorkbook } from "../people/service.js";
import { requireAuth } from "../auth/middleware.js";

export const peopleRouter = Router();

peopleRouter.use(requireAuth);

peopleRouter.get("/", async (_req, res) => {
  const people = await getAllPeople();
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

peopleRouter.get("/export.xlsx", async (_req, res) => {
  const workbook = await buildPeopleWorkbook();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="people-clean.xlsx"');
  res.send(workbook);
});
