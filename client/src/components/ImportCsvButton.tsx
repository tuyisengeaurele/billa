import { useMemo, useState } from "react";
import { guessColumnMapping, IMPORT_MAX_ROWS, parseCsv } from "@billa/shared";
import { Modal } from "./Modal";
import { Spinner } from "./Spinner";
import { useToast } from "../context/ToastContext";
import { apiRequest, ApiError } from "../lib/apiClient";
import type { ImportConfig } from "../lib/importConfigs";

interface ImportResult {
  created: number;
  skipped: { row: number; reason: string }[];
  invalid: { row: number; error: string }[];
}

interface ImportCsvButtonProps {
  config: ImportConfig;
  onImported: () => void;
}

const PREVIEW_ROWS = 5;
const ISSUES_SHOWN = 8;

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function csvCell(value: string): string {
  return /[",]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadTemplate(config: ImportConfig) {
  const header = config.fields.map((field) => csvCell(config.labels[field]!)).join(",");
  const example = config.templateExample.map(csvCell).join(",");
  const url = URL.createObjectURL(new Blob([`${header}\r\n${example}\r\n`], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = config.templateFilename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ImportCsvButton({ config, onImported }: ImportCsvButtonProps) {
  const toast = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  function reset() {
    setFileError(null);
    setHeaders([]);
    setDataRows([]);
    setMapping({});
    setImportError(null);
    setResult(null);
  }

  function close() {
    setIsOpen(false);
    reset();
  }

  async function handleFile(file: File | undefined) {
    reset();
    if (!file) return;
    try {
      const rows = parseCsv(await readFileText(file));
      if (rows.length < 2) {
        setFileError("This file has no data rows. The first row should be the column names.");
        return;
      }
      setHeaders(rows[0]!);
      setDataRows(rows.slice(1));
      setMapping(guessColumnMapping(rows[0]!, config.fields));
    } catch {
      setFileError("Couldn't read this file. Make sure it is a CSV file.");
    }
  }

  const mappedRows = useMemo(
    () =>
      dataRows.map((cells) => {
        const raw: Record<string, string> = {};
        for (const field of config.fields) {
          const column = mapping[field];
          raw[field] = column === null || column === undefined ? "" : (cells[column] ?? "");
        }
        return raw;
      }),
    [dataRows, mapping, config.fields],
  );

  const validCount = useMemo(() => mappedRows.filter((raw) => config.parseRow(raw).ok).length, [mappedRows, config]);
  const missingRequired = config.required.filter((field) => mapping[field] === null || mapping[field] === undefined);
  const tooMany = mappedRows.length > IMPORT_MAX_ROWS;

  async function handleImport() {
    setImportError(null);
    setIsImporting(true);
    try {
      const response = await apiRequest<ImportResult>(config.path, { method: "POST", body: { rows: mappedRows } });
      setResult(response);
      if (response.created > 0) {
        toast.success(`Imported ${response.created} ${config.noun}`);
        onImported();
      }
    } catch (err) {
      setImportError(
        err instanceof ApiError && err.status === 402
          ? "Your trial has ended. Subscribe to keep importing."
          : "Couldn't import this file. Try again.",
      );
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-lg border border-neutral-200 px-3.5 py-1.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
      >
        Import CSV
      </button>

      <Modal isOpen={isOpen} onClose={close} title={`Import ${config.noun}`}>
        <div className="flex flex-col gap-4">
          {!result && (
            <>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="importFile" className="font-sans text-sm font-medium text-neutral-800">
                  CSV file
                </label>
                <input
                  id="importFile"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => void handleFile(event.target.files?.[0])}
                  className="font-sans text-sm text-neutral-700"
                />
                <button
                  type="button"
                  onClick={() => downloadTemplate(config)}
                  className="w-fit font-sans text-sm font-medium text-primary-500 hover:text-primary-700"
                >
                  Download a template
                </button>
              </div>

              {fileError && (
                <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
                  {fileError}
                </div>
              )}

              {dataRows.length > 0 && (
                <>
                  <p className="font-sans text-sm text-neutral-600">
                    Found {dataRows.length} {dataRows.length === 1 ? "row" : "rows"}. Match each field to a column.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {config.fields.map((field) => (
                      <div key={field} className="flex flex-col gap-1">
                        <label htmlFor={`map-${field}`} className="font-sans text-sm font-medium text-neutral-800">
                          {config.labels[field]}
                          {config.required.includes(field) ? " (required)" : ""}
                        </label>
                        <select
                          id={`map-${field}`}
                          value={mapping[field] ?? ""}
                          onChange={(event) =>
                            setMapping((current) => ({
                              ...current,
                              [field]: event.target.value === "" ? null : Number(event.target.value),
                            }))
                          }
                          className="rounded-lg border border-neutral-200 bg-surface px-3 py-2 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                        >
                          <option value="">Not in file</option>
                          {headers.map((header, index) => (
                            <option key={index} value={index}>
                              {header || `Column ${index + 1}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse font-sans text-xs">
                      <thead>
                        <tr className="border-b border-neutral-200 text-left text-neutral-500">
                          {config.fields.map((field) => (
                            <th key={field} className="py-1.5 pr-3">
                              {config.labels[field]}
                            </th>
                          ))}
                          <th className="py-1.5">Check</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mappedRows.slice(0, PREVIEW_ROWS).map((raw, index) => {
                          const parsed = config.parseRow(raw);
                          return (
                            <tr key={index} className="border-b border-neutral-100">
                              {config.fields.map((field) => (
                                <td key={field} className="py-1.5 pr-3 text-neutral-700">
                                  {raw[field]}
                                </td>
                              ))}
                              <td className={`py-1.5 ${parsed.ok ? "text-neutral-500" : "text-error"}`}>
                                {parsed.ok ? "Ready" : parsed.error}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <p className="font-sans text-sm text-neutral-600">
                    {validCount} of {mappedRows.length} rows are ready to import.
                    {validCount < mappedRows.length && " The others will be reported and left out."}
                  </p>
                  {missingRequired.length > 0 && (
                    <p className="font-sans text-sm text-error" role="alert">
                      Choose a column for {missingRequired.map((field) => config.labels[field]).join(" and ")}.
                    </p>
                  )}
                  {tooMany && (
                    <p className="font-sans text-sm text-error" role="alert">
                      Import up to {IMPORT_MAX_ROWS} rows at a time. Split this file and import it in parts.
                    </p>
                  )}
                </>
              )}

              {importError && (
                <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
                  {importError}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isImporting || validCount === 0 || missingRequired.length > 0 || tooMany}
                  onClick={handleImport}
                  className="flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isImporting && <Spinner size="sm" />}
                  {isImporting ? "Importing…" : `Import ${validCount} ${config.noun}`}
                </button>
              </div>
            </>
          )}

          {result && (
            <>
              <p className="font-sans text-sm font-medium text-neutral-900">
                Added {result.created} {config.noun} to your list.
              </p>
              {result.skipped.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="font-sans text-sm text-neutral-700">Skipped {result.skipped.length} that already exist:</p>
                  <ul className="list-disc pl-5 font-sans text-sm text-neutral-600">
                    {result.skipped.slice(0, ISSUES_SHOWN).map((entry) => (
                      <li key={entry.row}>
                        Row {entry.row}: {entry.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.invalid.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="font-sans text-sm text-neutral-700">
                    {result.invalid.length} {result.invalid.length === 1 ? "row was" : "rows were"} left out:
                  </p>
                  <ul className="list-disc pl-5 font-sans text-sm text-error">
                    {result.invalid.slice(0, ISSUES_SHOWN).map((entry) => (
                      <li key={entry.row}>
                        Row {entry.row}: {entry.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg bg-primary-500 px-4 py-2 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
