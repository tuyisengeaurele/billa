import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv-parse.js";

describe("parseCsv", () => {
  it("splits rows and fields", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles Windows line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps commas and doubled quotes inside a quoted field", () => {
    expect(parseCsv('name,note\n"Doe, Jane","said ""hi"""')).toEqual([
      ["name", "note"],
      ["Doe, Jane", 'said "hi"'],
    ]);
  });

  it("keeps a newline inside a quoted field", () => {
    expect(parseCsv('a,b\n"line one\nline two",x')).toEqual([
      ["a", "b"],
      ["line one\nline two", "x"],
    ]);
  });

  it("drops a leading byte order mark", () => {
    expect(parseCsv("\uFEFFname\nJane")).toEqual([["name"], ["Jane"]]);
  });

  it("skips fully blank lines", () => {
    expect(parseCsv("a,b\n\n1,2\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps an empty field between commas", () => {
    expect(parseCsv("a,b,c\n1,,3")).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
  });

  it("returns nothing for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("trims surrounding spaces from unquoted fields", () => {
    expect(parseCsv("a , b\n 1 , 2 ")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});
