import express from "express";
import cors from "cors";
import { importRouter } from "./routes/import.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/import", importRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
