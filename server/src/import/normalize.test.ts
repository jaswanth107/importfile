import { describe, expect, it } from "vitest";
import { isEmailValid, isNameValid, normalizeEmail, normalizeJoiningDate, normalizeName, normalizePhone } from "./normalize.js";

describe("normalizeName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeName("  John     Smith  ").value).toBe("John Smith");
  });
  it("rejects punctuation-only names", () => {
    expect(isNameValid("---")).toBe(false);
  });
  it("rejects empty/whitespace-only names", () => {
    expect(isNameValid("")).toBe(false);
    expect(isNameValid("   ")).toBe(false);
  });
  it("supports unicode, apostrophes and hyphens", () => {
    expect(isNameValid("O'Brien-Núñez")).toBe(true);
  });
  it("rejects names over 100 characters", () => {
    expect(isNameValid("a".repeat(101))).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("normalizes case-insensitive duplicates to the same canonical value", () => {
    const cases = ["John@gmail.com", "JOHN@GMAIL.COM", " john@gmail.com", "john@gmail.com"];
    const normalized = cases.map((c) => normalizeEmail(c).value);
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe("john@gmail.com");
  });
  it("rejects malformed emails", () => {
    expect(isEmailValid("not-an-email")).toBe(false);
    expect(isEmailValid("")).toBe(false);
  });
});

describe("normalizePhone", () => {
  it("normalizes equivalent Indian mobile formats to the same canonical value", () => {
    const cases = ["+91 98765 43210", "9876543210", "98765-43210", "+91-98765-43210"];
    const normalized = cases.map((c) => normalizePhone(c).value);
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe("+919876543210");
  });
  it("rejects invalid numbers instead of guessing", () => {
    expect(normalizePhone("abc123").value).toBeNull();
    expect(normalizePhone("12345").value).toBeNull();
    expect(normalizePhone("1234567890").value).toBeNull(); // doesn't start with 6-9
  });
});

describe("normalizeJoiningDate", () => {
  it("accepts ISO dates", () => {
    expect(normalizeJoiningDate("2026-08-05").value).toBe("2026-08-05");
  });
  it("rejects impossible calendar dates", () => {
    expect(normalizeJoiningDate("2026-02-30").value).toBeNull();
    expect(normalizeJoiningDate("2026-13-01").value).toBeNull();
  });
  it("rejects unparseable strings", () => {
    expect(normalizeJoiningDate("invalid-date").value).toBeNull();
  });
  it("rejects ambiguous dd/mm vs mm/dd dates", () => {
    const result = normalizeJoiningDate("01/02/2026");
    expect(result.value).toBeNull();
    expect(result.reason).toMatch(/ambiguous/i);
  });
  it("resolves unambiguous slash dates", () => {
    expect(normalizeJoiningDate("25/12/2026").value).toBe("2026-12-25");
  });
});
