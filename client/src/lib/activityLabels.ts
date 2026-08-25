const DOCUMENT_TYPE_DISPLAY: Record<string, string> = {
  INVOICE: "an invoice",
  PROFORMA: "a proforma invoice",
  DELIVERY_NOTE: "a delivery note",
  QUOTE: "a quote",
  RECEIPT: "a receipt",
};

export function describeActivity(action: string, metadata: Record<string, unknown> | null): string {
  const type = typeof metadata?.type === "string" ? metadata.type : undefined;
  const number = typeof metadata?.number === "string" ? metadata.number : undefined;
  const name = typeof metadata?.name === "string" ? metadata.name : undefined;
  const email = typeof metadata?.email === "string" ? metadata.email : undefined;
  const typeLabel = type ? (DOCUMENT_TYPE_DISPLAY[type] ?? "a document") : "a document";

  switch (action) {
    case "DOCUMENT_CREATED":
      return `created ${typeLabel}`;
    case "DOCUMENT_FINALIZED":
      return `finalized ${number ?? typeLabel}`;
    case "DOCUMENT_DELETED":
      return `deleted ${typeLabel}`;
    case "CUSTOMER_CREATED":
      return name ? `added customer ${name}` : "added a customer";
    case "CUSTOMER_DEACTIVATED":
      return name ? `deactivated customer ${name}` : "deactivated a customer";
    case "MEMBER_INVITED":
      return email ? `invited ${email}` : "invited a team member";
    case "MEMBER_JOINED":
      return "joined the team";
    case "MEMBER_REMOVED":
      return email ? `removed ${email}` : "removed a team member";
    default:
      return action;
  }
}
