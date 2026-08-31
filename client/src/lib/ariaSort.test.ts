import { describe, expect, it } from "vitest";
import { ariaSortValue } from "./ariaSort";

describe("ariaSortValue", () => {
  it("returns 'none' when the column isn't the one currently sorted", () => {
    expect(ariaSortValue("name", "email", "asc")).toBe("none");
  });

  it("returns 'ascending' when the column is sorted ascending", () => {
    expect(ariaSortValue("total", "total", "asc")).toBe("ascending");
  });

  it("returns 'descending' when the column is sorted descending", () => {
    expect(ariaSortValue("total", "total", "desc")).toBe("descending");
  });
});
