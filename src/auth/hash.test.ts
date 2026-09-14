import { hashPassword, verifyPassword } from "./hash";

describe("hashPassword / verifyPassword", () => {
  it("round-trips: the original password verifies against its own hash", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });

  it("never stores the password in plain text — the hash doesn't contain it", async () => {
    const hash = await hashPassword("hunter2");
    expect(hash).not.toContain("hunter2");
  });

  it("salts each hash independently, so hashing the same password twice differs", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a).not.toBe(b);
    await expect(verifyPassword("same password", a)).resolves.toBe(true);
    await expect(verifyPassword("same password", b)).resolves.toBe(true);
  });
});
