import { useState } from "react";
import { downloadFile } from "../lib/downloadFile";
import { useToast } from "../context/ToastContext";

interface ExportCsvButtonProps {
  path: string;
  filename: string;
  label?: string;
}

export function ExportCsvButton({ path, filename, label = "Export CSV" }: ExportCsvButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const toast = useToast();

  async function handleExport() {
    setIsExporting(true);
    try {
      await downloadFile(path, filename);
      toast.success(`Exported ${filename}`);
    } catch {
      toast.error(`Couldn't export ${filename}. Try again.`);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <button
      type="button"
      disabled={isExporting}
      onClick={handleExport}
      className="rounded-lg border border-neutral-200 px-3.5 py-1.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isExporting ? "Exporting…" : label}
    </button>
  );
}
