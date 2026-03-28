import nodemailer from "nodemailer";
import { env } from "./env";

type MailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

let transporter: nodemailer.Transporter | null = null;
let verified = false;

export function isMailConfigured() {
  return !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.SMTP_FROM);
}

function getTransporter() {
  if (transporter) return transporter;
  if (!isMailConfigured()) {
    throw new Error("SMTP is not configured (set SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_FROM)");
  }

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
  });

  return transporter;
}

export async function sendMail(input: MailInput) {
  const tx = getTransporter();
  if (!verified) {
    await tx.verify();
    verified = true;
  }
  await tx.sendMail({
    from: env.SMTP_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html
  });
}
