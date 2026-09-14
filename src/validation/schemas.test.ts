import { createApplicationSchema, loginSchema, registerSchema, updateApplicationSchema } from "./schemas";

describe("registerSchema", () => {
  it("accepts a valid signup and normalizes the email", () => {
    const result = registerSchema.parse({ email: " Test@Example.com ", password: "longenough1", fullName: " Amr " });
    expect(result).toEqual({ email: "test@example.com", password: "longenough1", fullName: "Amr" });
  });

  it("rejects a malformed email", () => {
    expect(() => registerSchema.parse({ email: "not-an-email", password: "longenough1", fullName: "Amr" })).toThrow();
  });

  it("rejects a password under 8 characters", () => {
    expect(() => registerSchema.parse({ email: "a@b.com", password: "short", fullName: "Amr" })).toThrow();
  });

  it("rejects an empty name", () => {
    expect(() => registerSchema.parse({ email: "a@b.com", password: "longenough1", fullName: "  " })).toThrow();
  });
});

describe("loginSchema", () => {
  it("only requires a non-empty password, no minimum length", () => {
    // login must never enforce the *current* password policy — that would
    // lock out anyone who signed up under an older, looser one
    expect(() => loginSchema.parse({ email: "a@b.com", password: "x" })).not.toThrow();
  });

  it("rejects an empty password", () => {
    expect(() => loginSchema.parse({ email: "a@b.com", password: "" })).toThrow();
  });
});

describe("createApplicationSchema", () => {
  it("defaults status to APPLIED when omitted", () => {
    const result = createApplicationSchema.parse({ company: "Acme", role: "Junior Dev" });
    expect(result.status).toBe("APPLIED");
  });

  it("accepts an empty string for url as \"no url\", not a validation error", () => {
    expect(() => createApplicationSchema.parse({ company: "Acme", role: "Junior Dev", url: "" })).not.toThrow();
  });

  it("rejects a malformed url", () => {
    expect(() => createApplicationSchema.parse({ company: "Acme", role: "Junior Dev", url: "not a url" })).toThrow();
  });

  it("rejects a status outside the fixed set", () => {
    expect(() => createApplicationSchema.parse({ company: "Acme", role: "Junior Dev", status: "GHOSTED" })).toThrow();
  });

  it("rejects a blank company or role", () => {
    expect(() => createApplicationSchema.parse({ company: "", role: "Junior Dev" })).toThrow();
    expect(() => createApplicationSchema.parse({ company: "Acme", role: "" })).toThrow();
  });
});

describe("updateApplicationSchema", () => {
  it("accepts a partial patch with just one field", () => {
    const result = updateApplicationSchema.parse({ status: "INTERVIEWING" });
    expect(result).toEqual({ status: "INTERVIEWING" });
  });

  it("accepts an empty object — a PATCH with nothing to change", () => {
    expect(() => updateApplicationSchema.parse({})).not.toThrow();
  });

  it("still rejects an invalid value for a field that IS present", () => {
    expect(() => updateApplicationSchema.parse({ status: "NOT_A_REAL_STATUS" })).toThrow();
  });
});
