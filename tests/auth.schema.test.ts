import { describe, it, expect } from "vitest";
import { registerSchema, loginSchema, resetPasswordSchema } from "@/lib/validations/auth";

describe("registerSchema", () => {
  const valid = {
    full_name: "Ali Khan",
    email: "ali@pzacademy.com",
    password: "Secure1!",
    phone: "03001234567",
    profession: "Pharmacist",
    city: "Lahore",
  };

  it("accepts valid input", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects missing uppercase", () => {
    expect(registerSchema.safeParse({ ...valid, password: "secure1!" }).success).toBe(false);
  });
  it("rejects missing number", () => {
    expect(registerSchema.safeParse({ ...valid, password: "SecurePass!" }).success).toBe(false);
  });
  it("rejects missing special char", () => {
    expect(registerSchema.safeParse({ ...valid, password: "Secure123" }).success).toBe(false);
  });
  it("rejects short password", () => {
    expect(registerSchema.safeParse({ ...valid, password: "S1!" }).success).toBe(false);
  });
  it("rejects invalid email", () => {
    expect(registerSchema.safeParse({ ...valid, email: "notanemail" }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts valid credentials", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "anything" }).success).toBe(true);
  });
  it("rejects empty password", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("rejects mismatched passwords", () => {
    const r = resetPasswordSchema.safeParse({
      password: "Secure1!",
      confirm_password: "Different1!",
    });
    expect(r.success).toBe(false);
  });
  it("accepts matching strong passwords", () => {
    const r = resetPasswordSchema.safeParse({
      password: "Secure1!",
      confirm_password: "Secure1!",
    });
    expect(r.success).toBe(true);
  });
});
