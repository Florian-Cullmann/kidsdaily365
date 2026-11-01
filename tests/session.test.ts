import { describe, expect, it } from "vitest";
import { equalSecrets } from "@/server/auth/token";
import { hashPassword, verifyPassword } from "@/server/auth/password";

describe("parent credentials", () => {
  it("salts password hashes and verifies only the correct password", async () => {
    const first = await hashPassword("A long test passphrase 123!");
    const second = await hashPassword("A long test passphrase 123!");
    expect(first).not.toBe(second);
    expect(first).not.toContain("passphrase");
    expect(await verifyPassword("A long test passphrase 123!", first)).toBe(true);
    expect(await verifyPassword("wrong password", first)).toBe(false);
    expect(await verifyPassword("anything", undefined)).toBe(false);
    expect(await verifyPassword("anything", "scrypt:2:1:1:unsafe")).toBe(false);
  }, 15_000);
  it("compares different-length setup codes without accepting prefixes", () => {
    expect(equalSecrets("abc", "abcd")).toBe(false);
    expect(equalSecrets("abc", "abc")).toBe(true);
  });
});
