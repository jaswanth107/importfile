import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";

const TEST_DB_PATH = "./prisma/test.db";

export default function globalSetup() {
  if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: `file:${TEST_DB_PATH}` },
    stdio: "inherit",
  });
}
