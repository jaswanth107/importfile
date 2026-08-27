import { describe, expect, it } from "vitest";
import { autoMapColumns } from "./mapper.js";

describe("autoMapColumns", () => {
  it("detects common column name variants", () => {
    const { mapping, confident } = autoMapColumns(["Employee Name", "Email ID", "Mobile No", "Date Joined"]);
    expect(mapping).toMatchObject({
      name: "Employee Name",
      email: "Email ID",
      phone: "Mobile No",
      joiningDate: "Date Joined",
    });
    expect(confident).toBe(true);
  });

  it("reports unmapped required fields when headers are unrecognized", () => {
    const { unmapped, confident } = autoMapColumns(["Column A", "Column B"]);
    expect(confident).toBe(false);
    expect(unmapped).toEqual(expect.arrayContaining(["name", "email", "phone", "joiningDate"]));
  });
});
