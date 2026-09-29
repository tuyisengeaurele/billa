import { useCallback } from "react";
import { buildWhatsAppLink } from "@billa/shared";
import { useToast } from "../context/ToastContext";
import { apiRequest } from "../lib/apiClient";

interface ShareInput {
  documentId: string;
  phone: string | null;
  message: string;
  // A reminder is not the first time the document went out, so it opens WhatsApp
  // without touching sentAt or adding a "shared" entry to the activity log.
  record: boolean;
}

/** Opens a prefilled WhatsApp chat. Resolves to the new sentAt when the share was recorded, otherwise null. */
export function useWhatsAppShare() {
  const toast = useToast();

  return useCallback(
    async ({ documentId, phone, message, record }: ShareInput): Promise<string | null> => {
      const link = buildWhatsAppLink(phone, message);
      if (!link) {
        toast.error("Add a phone number to this customer first.");
        return null;
      }
      // Opened before any await so the browser still treats it as the click's own popup.
      window.open(link, "_blank", "noopener");
      if (!record) return null;
      try {
        const response = await apiRequest<{ sentAt: string }>(`/documents/${documentId}/shared`, {
          method: "POST",
          body: { channel: "WHATSAPP" },
        });
        return response.sentAt;
      } catch {
        // WhatsApp is already open; failing to note it in the log shouldn't get in the way.
        return null;
      }
    },
    [toast],
  );
}
