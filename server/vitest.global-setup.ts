import { execSync } from "node:child_process";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://importfile:importfile@localhost:5432/importfile";

export default function globalSetup() {
  execSync("npx prisma migrate reset --force --skip-generate --skip-seed", {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });
}
