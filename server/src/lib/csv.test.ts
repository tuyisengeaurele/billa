import { describe, expect, it } from "vitest";
import { toCsv } from "./csv.js";

describe("toCsv", () => {
  it("writes a header row plus one row per record", () => {
    const csv = toCsv(
      [
        { id: "1", name: "Kigali Traders" },
        { id: "2", name: "Musanze Supplies" },
      ],
      [
        { key: "id", header: "ID" },
        { key: "name", header: "Name" },
      ],
    );

    expect(csv).toBe("ID,Name\r\n1,Kigali Traders\r\n2,Musanze Supplies");
  });

  it("quotes and escapes fields containing commas, quotes, or newlines", () => {
    const csv = toCsv([{ note: 'Say "hi", then\nnext line' }], [{ key: "note", header: "Note" }]);

    expect(csv).toBe('Note\r\n"Say ""hi"", then\nnext line"');
  });

  it("renders null and undefined as empty fields", () => {
    const csv = toCsv([{ a: null, b: undefined }], [
      { key: "a", header: "A" },
      { key: "b", header: "B" },
    ]);

    expect(csv).toBe("A,B\r\n,");
  });

  it("returns just the header row for an empty list", () => {
    const csv = toCsv([], [{ key: "id", header: "ID" }]);

    expect(csv).toBe("ID");
  });
});
