import { useRef, useState } from "react";
import { ApiError, API_BASE_URL, apiRequest } from "../../lib/apiClient";
import { useToast } from "../../context/ToastContext";

export interface DocumentAttachment {
  id: string;
  fileName: string;
  url: string;
  contentType: string;
  sizeBytes: number;
}

interface AttachmentsSectionProps {
  documentId: string;
  attachments: DocumentAttachment[];
  onChanged: () => void;
}

export const MAX_ATTACHMENTS = 5;

function readableSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Files kept with a document, such as a purchase order or proof of delivery. Never printed on the PDF. */
export function AttachmentsSection({ documentId, attachments, onChanged }: AttachmentsSectionProps) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const isFull = attachments.length >= MAX_ATTACHMENTS;

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await apiRequest(`/documents/${documentId}/attachments`, { method: "POST", body: formData });
      onChanged();
      toast.success("File attached");
    } catch (err) {
      const code = err instanceof ApiError ? (err.body as { error?: string } | null)?.error : undefined;
      toast.error(
        code === "invalid_file_type"
          ? "Attach a PDF, PNG, JPG or WebP file."
          : code === "too_many_attachments"
            ? `You can attach up to ${MAX_ATTACHMENTS} files.`
            : "Couldn't attach that file. Try again. Files must be 5 MB or smaller.",
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function handleRemove(attachment: DocumentAttachment) {
    setRemovingId(attachment.id);
    try {
      await apiRequest(`/documents/${documentId}/attachments/${attachment.id}`, { method: "DELETE" });
      onChanged();
      toast.success("File removed");
    } catch {
      toast.error("Couldn't remove that file. Try again.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-surface px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-sans text-sm font-medium text-neutral-900">Attachments</p>
        <button
          type="button"
          disabled={isUploading || isFull}
          onClick={() => inputRef.current?.click()}
          title={isFull ? `Up to ${MAX_ATTACHMENTS} files` : undefined}
          className="rounded-lg border border-neutral-200 px-3 py-1.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:border-primary-500 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isUploading ? "Uploading…" : "Attach a file"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          aria-label="Attach a file"
          className="hidden"
          onChange={handleFile}
        />
      </div>
      {attachments.length === 0 ? (
        <p className="font-sans text-sm text-neutral-500">
          Keep a purchase order or proof of delivery with this document. Only you and your team can see it.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-100">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="flex flex-wrap items-center justify-between gap-2 py-2 font-sans text-sm">
              <a
                href={`${API_BASE_URL}${attachment.url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary-500 hover:text-primary-700"
              >
                {attachment.fileName}
              </a>
              <span className="flex items-center gap-3 text-neutral-500">
                <span className="text-xs">{readableSize(attachment.sizeBytes)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${attachment.fileName}`}
                  disabled={removingId === attachment.id}
                  onClick={() => handleRemove(attachment)}
                  className="rounded-lg px-2 py-1 text-xs hover:bg-neutral-100 hover:text-error disabled:opacity-50"
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
