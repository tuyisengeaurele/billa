interface CsvColumn<T> {
  key: keyof T;
  header: string;
}

function escapeCsvField(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [
    columns.map((c) => escapeCsvField(c.header)).join(","),
    ...rows.map((row) => columns.map((c) => escapeCsvField(row[c.key])).join(",")),
  ];
  return lines.join("\r\n");
}
