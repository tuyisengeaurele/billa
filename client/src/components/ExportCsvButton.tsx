import { useState } from "react";
import { downloadFile } from "../lib/downloadFile";

interface ExportCsvButtonProps {
  path: string;
  filename: string;
}

export function ExportCsvButton({ path, filename }: ExportCsvButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setError(null);
    setIsExporting(true);
    try {
      await downloadFile(path, filename);
    } catch {
      setError(`Couldn't export ${filename}. Try again.`);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        disabled={isExporting}
        onClick={handleExport}
        className="rounded-lg border border-neutral-200 px-3.5 py-1.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isExporting ? "Exporting…" : "Export CSV"}
      </button>
      {error && (
        <p className="font-sans text-xs text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
