import { prisma } from "./prisma.js";
import { createNotification } from "./notifications.js";

// Messaging apps and search engines fetch a link the moment it is pasted, to build a
// preview. Counting those would tell the owner "viewed" before any person had looked.
const NON_HUMAN_AGENT = /bot|crawl|spider|preview|whatsapp|facebookexternalhit|slack|telegram|curl|wget|python-requests/i;

export interface DocumentViewContext {
  userAgent: string | undefined;
  // A signed-in person opening the link is almost always the owner checking their own work.
  isSignedIn: boolean;
}

export async function recordDocumentView(documentId: string, context: DocumentViewContext): Promise<void> {
  if (context.isSignedIn) return;
  if (!context.userAgent || NON_HUMAN_AGENT.test(context.userAgent)) return;

  const now = new Date();
  await prisma.document.update({
    where: { id: documentId },
    data: { viewCount: { increment: 1 }, lastViewedAt: now },
  });

  // The claim is one atomic statement, so two first views at once notify only once.
  const claimed = await prisma.document.updateMany({
    where: { id: documentId, firstViewedAt: null },
    data: { firstViewedAt: now },
  });
  if (claimed.count === 0) return;

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { customer: { select: { name: true } }, business: { select: { ownerId: true } } },
  });
  if (!document) return;
  await createNotification({
    userId: document.business.ownerId,
    type: "DOCUMENT_VIEWED",
    title: `${document.customer.name} opened ${document.number ?? "your document"}`,
    link: `/documents/${document.id}`,
  });
}
