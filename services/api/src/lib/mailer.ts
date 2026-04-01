import nodemailer from "nodemailer";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sgMail from "@sendgrid/mail";
import { Resend } from "resend";
import { env } from "./env";

type MailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
  replyTo?: string;
};

type MailSendResult = {
  provider: "smtp" | "sendgrid" | "resend";
  id?: string;
  messageId?: string;
};

let transporter: nodemailer.Transporter | null = null;
let verified = false;
let sendGridReady = false;
let resendClient: Resend | null = null;

export function isMailConfigured() {
  if (env.MAIL_PROVIDER === "sendgrid") {
    return !!(env.SENDGRID_API_KEY && (env.SENDGRID_FROM || env.SMTP_FROM));
  }
  if (env.MAIL_PROVIDER === "resend") {
    return !!(env.RESEND_API_KEY && (env.RESEND_FROM || env.SMTP_FROM));
  }
  return !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.SMTP_FROM);
}

function getTransporter() {
  if (transporter) return transporter;
  if (!isMailConfigured()) {
    throw new Error(
      env.MAIL_PROVIDER === "sendgrid"
        ? "SendGrid is not configured (set SENDGRID_API_KEY and SENDGRID_FROM)"
        : env.MAIL_PROVIDER === "resend"
          ? "Resend is not configured (set RESEND_API_KEY and RESEND_FROM)"
        : "SMTP is not configured (set SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_FROM)"
    );
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

export async function sendMail(input: MailInput): Promise<MailSendResult> {
  if (env.MAIL_PROVIDER === "sendgrid") {
    if (!env.SENDGRID_API_KEY) throw new Error("SendGrid not configured (SENDGRID_API_KEY missing)");
    if (!sendGridReady) {
      sgMail.setApiKey(env.SENDGRID_API_KEY);
      sendGridReady = true;
    }

    const from = input.from ?? env.SENDGRID_FROM ?? env.SMTP_FROM;
    if (!from) throw new Error("SendGrid from address missing (set SENDGRID_FROM)");

    await sgMail.send({
      to: input.to,
      from,
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo: input.replyTo
    });
    return { provider: "sendgrid" };
  }

  if (env.MAIL_PROVIDER === "resend") {
    if (!env.RESEND_API_KEY) throw new Error("Resend not configured (RESEND_API_KEY missing)");
    if (!resendClient) resendClient = new Resend(env.RESEND_API_KEY);

    const from = input.from ?? env.RESEND_FROM ?? env.SMTP_FROM;
    if (!from) throw new Error("Resend from address missing (set RESEND_FROM)");

    const res = await resendClient.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo: input.replyTo
    });
    const anyRes = res as any;
    const id = anyRes?.data?.id ?? anyRes?.id;
    return { provider: "resend", id };
  }

  const tx = getTransporter();
  if (!verified) {
    await tx.verify();
    verified = true;
  }
  const info = await tx.sendMail({
    from: input.from ?? env.SMTP_FROM,
    replyTo: input.replyTo,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html
  });
  return { provider: "smtp", messageId: (info as any)?.messageId };
}
