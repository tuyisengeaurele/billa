import { OAuth2Client } from "google-auth-library";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { prisma } from "./prisma.js";
import { describeError, type HealthCheckResult } from "./health-check.js";
import { withTimeout } from "./with-timeout.js";

const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

let oauth2Client: OAuth2Client | null = null;

// Render's free tier blocks outbound SMTP entirely (the port Gmail's SMTP
// transport needs), which is why this doesn't use nodemailer's own "gmail"
// SMTP shorthand - Gmail's REST API is plain HTTPS, so it isn't affected.
// nodemailer is still used here, just for MailComposer: it already knows how
// to build a correctly formatted raw MIME message (HTML body, attachment,
// headers) - only the actual "send" step goes over the Gmail API instead of
// SMTP.
function getOAuth2Client(): OAuth2Client {
  if (!oauth2Client) {
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error("GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, or GMAIL_REFRESH_TOKEN is not set");
    }
    oauth2Client = new OAuth2Client({ clientId, clientSecret });
    oauth2Client.setCredentials({ refresh_token: refreshToken });
  }
  return oauth2Client;
}

// Google answers "invalid_grant" when the saved refresh token no longer works: it was revoked, the
// account password changed, or (the usual cause) the Google Cloud app is still in "Testing" mode,
// where refresh tokens are cut off after 7 days. Nothing in this code can fix that, so the message
// says what to do instead of leaving an admin to search for the error code.
export function describeMailerFailure(err: unknown): string {
  const message = describeError(err);
  if (!message.includes("invalid_grant")) return message;
  return (
    "Gmail refused the saved login (invalid_grant). Create a new GMAIL_REFRESH_TOKEN and update it on the server. " +
    "If the Google Cloud app is still in Testing mode, publish it first, or the new token will stop working after 7 days."
  );
}

function getFromAddress(): string {
  return `"Billa" <${process.env.GMAIL_USER ?? ""}>`;
}

interface RawMessageInput {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
}

async function buildRawMessage(input: RawMessageInput): Promise<string> {
  const composer = new MailComposer({
    from: getFromAddress(),
    to: input.to,
    subject: input.subject,
    html: input.html,
    attachments: input.attachments,
  });
  const buffer: Buffer = await composer.compile().build();
  // The Gmail API wants the raw MIME message as URL-safe base64 (RFC 4648 §5),
  // not the standard base64 nodemailer/Buffer produce by default.
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessTokenOrExplain(): Promise<string | null | undefined> {
  try {
    return (await getOAuth2Client().getAccessToken()).token;
  } catch (err) {
    const explained = describeMailerFailure(err);
    if (explained === describeError(err)) throw err;
    throw new Error(explained);
  }
}

async function sendViaGmailApi(raw: string): Promise<void> {
  const token = await getAccessTokenOrExplain();
  if (!token) throw new Error("Failed to obtain a Gmail API access token");

  const res = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    throw new Error(`Gmail API send failed with status ${res.status}: ${await res.text()}`);
  }
}

export interface SendDocumentEmailInput {
  to: string;
  subject: string;
  html: string;
  attachmentFilename: string;
  attachmentBuffer: Buffer;
}

async function logEmailSent(): Promise<void> {
  await prisma.emailSendLog.create({ data: {} }).catch(() => {});
}

export async function sendDocumentEmail(input: SendDocumentEmailInput): Promise<void> {
  const raw = await buildRawMessage({
    to: input.to,
    subject: input.subject,
    html: input.html,
    attachments: [{ filename: input.attachmentFilename, content: input.attachmentBuffer }],
  });
  await sendViaGmailApi(raw);
  await logEmailSent();
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const raw = await buildRawMessage({ to: input.to, subject: input.subject, html: input.html });
  await sendViaGmailApi(raw);
  await logEmailSent();
}

export async function checkMailerHealth(): Promise<HealthCheckResult> {
  try {
    return await withTimeout(
      getAccessTokenOrExplain().then(
        (token): HealthCheckResult =>
          token ? { ok: true, error: null } : { ok: false, error: "Did not receive an access token" },
      ),
      8000,
      { ok: false, error: "Timed out after 8s obtaining a Gmail API access token" },
    );
  } catch (err) {
    return { ok: false, error: describeMailerFailure(err) };
  }
}
