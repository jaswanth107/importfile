import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { getAllPeople, createExportFile, deleteExportFile, PeopleServiceError } from "./service.js";

const USER_A = "people-test-user-a";
const USER_B = "people-test-user-b";

async function resetDb() {
  await prisma.cleanExportFile.deleteMany();
  await prisma.importRowResult.deleteMany();
  await prisma.importEvent.deleteMany();
  await prisma.undoLog.deleteMany();
  await prisma.importRun.deleteMany();
  await prisma.person.deleteMany();
  await prisma.user.deleteMany();
  await prisma.user.createMany({
    data: [
      { id: USER_A, username: "usera", email: "usera@example.com", passwordHash: "not-a-real-hash" },
      { id: USER_B, username: "userb", email: "userb@example.com", passwordHash: "not-a-real-hash" },
    ],
  });
}

beforeEach(async () => {
  await resetDb();
});

describe("getAllPeople", () => {
  it("only returns the requesting user's own people", async () => {
    await prisma.person.create({ data: { userId: USER_A, name: "Alice", email: "alice@gmail.com", phone: "9876543210", joiningDate: "2026-01-01" } });
    await prisma.person.create({ data: { userId: USER_B, name: "Bob", email: "bob@gmail.com", phone: "9876500000", joiningDate: "2026-01-02" } });

    const aPeople = await getAllPeople(USER_A);
    expect(aPeople).toHaveLength(1);
    expect(aPeople[0].email).toBe("alice@gmail.com");

    const bPeople = await getAllPeople(USER_B);
    expect(bPeople).toHaveLength(1);
    expect(bPeople[0].email).toBe("bob@gmail.com");
  });

  it("lets two users import the same email address without colliding", async () => {
    await prisma.person.create({ data: { userId: USER_A, name: "Alice", email: "shared@gmail.com", phone: "9876543210", joiningDate: "2026-01-01" } });
    await prisma.person.create({ data: { userId: USER_B, name: "Bob", email: "shared@gmail.com", phone: "9876500000", joiningDate: "2026-01-02" } });

    expect(await prisma.person.count()).toBe(2);
  });
});

describe("clean export files", () => {
  it("does not let one user delete or read another user's generated file (IDOR)", async () => {
    const file = await createExportFile(USER_A, "My Export");
    await expect(deleteExportFile(USER_B, file.id)).rejects.toThrow(PeopleServiceError);
    expect(await prisma.cleanExportFile.findUnique({ where: { id: file.id } })).not.toBeNull();
  });
});
