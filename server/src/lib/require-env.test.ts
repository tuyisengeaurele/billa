import { afterEach, describe, expect, it } from "vitest";
import { requireEnv } from "./require-env.js";

describe("requireEnv", () => {
  afterEach(() => {
    delete process.env.SOME_TEST_VAR;
  });

  it("returns the value when the env var is set", () => {
    process.env.SOME_TEST_VAR = "a-value";

    expect(requireEnv("SOME_TEST_VAR")).toBe("a-value");
  });

  it("throws a clear error naming the missing var", () => {
    delete process.env.SOME_TEST_VAR;

    expect(() => requireEnv("SOME_TEST_VAR")).toThrow("SOME_TEST_VAR is not set");
  });
});
