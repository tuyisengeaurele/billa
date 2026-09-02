import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "./prisma.js";

let transporter: Transporter | null = null;

function getTransport(): Transporter {
  if (!transporter) {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) throw new Error("GMAIL_USER or GMAIL_APP_PASSWORD is not set");
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass: pass.replace(/\s+/g, "") },
    });
  }
  return transporter;
}

function getFromAddress(): string {
  return `"Billa" <${process.env.GMAIL_USER ?? ""}>`;
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
  await getTransport().sendMail({
    from: getFromAddress(),
    to: input.to,
    subject: input.subject,
    html: input.html,
    attachments: [{ filename: input.attachmentFilename, content: input.attachmentBuffer }],
  });
  await logEmailSent();
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  await getTransport().sendMail({
    from: getFromAddress(),
    to: input.to,
    subject: input.subject,
    html: input.html,
  });
  await logEmailSent();
}

export async function checkMailerHealth(): Promise<boolean> {
  try {
    await getTransport().verify();
    return true;
  } catch {
    return false;
  }
}
