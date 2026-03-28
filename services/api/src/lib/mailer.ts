import nodemailer from "nodemailer";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    tls:
      env.SMTP_TLS_CA_FILE ||
      env.SMTP_TLS_SERVERNAME ||
      env.SMTP_TLS_REJECT_UNAUTHORIZED === false
        ? {
            servername: env.SMTP_TLS_SERVERNAME || undefined,
            rejectUnauthorized: env.SMTP_TLS_REJECT_UNAUTHORIZED,
            ca: env.SMTP_TLS_CA_FILE
              ? readFileSync(resolve(process.cwd(), env.SMTP_TLS_CA_FILE), "utf8")
              : undefined
          }
        : undefined
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
