import { describe, expect, it } from "vitest";
import { validateStartupEnv } from "./validate-startup-env.js";

const COMPLETE_ENV = {
  DATABASE_URL: "postgresql://localhost/db",
  JWT_ACCESS_SECRET: "secret",
  CLIENT_ORIGIN: "http://localhost:5173",
  FIREBASE_PROJECT_ID: "project",
  FIREBASE_CLIENT_EMAIL: "sdk@project.iam.gserviceaccount.com",
  FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\n...",
};

describe("validateStartupEnv", () => {
  it("does not throw when every required variable is set", () => {
    expect(() => validateStartupEnv(COMPLETE_ENV)).not.toThrow();
  });

  it("throws listing every missing variable", () => {
    const { CLIENT_ORIGIN: _omit, ...rest } = COMPLETE_ENV;
    expect(() => validateStartupEnv(rest)).toThrow("CLIENT_ORIGIN");
  });

  it("throws for a completely empty environment", () => {
    expect(() => validateStartupEnv({})).toThrow("Missing required environment variable(s)");
  });
});
