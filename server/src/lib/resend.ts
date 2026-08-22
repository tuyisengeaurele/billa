import { Resend } from "resend";

let client: Resend | null = null;

function getClient(): Resend {
  if (!client) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not set");
    client = new Resend(apiKey);
  }
  return client;
}

export interface SendDocumentEmailInput {
  to: string;
  subject: string;
  html: string;
  attachmentFilename: string;
  attachmentBuffer: Buffer;
}

export async function sendDocumentEmail(input: SendDocumentEmailInput): Promise<void> {
  const { error } = await getClient().emails.send({
    from: "Billa <onboarding@resend.dev>",
    to: [input.to],
    subject: input.subject,
    html: input.html,
    attachments: [{ filename: input.attachmentFilename, content: input.attachmentBuffer }],
  });
  if (error) {
    throw new Error(error.message ?? "resend_send_failed");
  }
}
