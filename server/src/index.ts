import express from "express";
import cors from "cors";
import { importRouter } from "./routes/import.js";
import { authRouter } from "./routes/auth.js";
import { peopleRouter } from "./routes/people.js";

const app = express();
app.use(cors(process.env.CORS_ORIGIN ? { origin: process.env.CORS_ORIGIN } : undefined));
app.use(express.json());

app.use("/api/auth", authRouter);
app.use("/api/import", importRouter);
app.use("/api/people", peopleRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
