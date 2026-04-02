import nodemailer from "nodemailer";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sgMail from "@sendgrid/mail";
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
  provider: "smtp" | "sendgrid" | "mailtrap";
  id?: string;
  messageId?: string;
};

let transporter: nodemailer.Transporter | null = null;
let verified = false;
let sendGridReady = false;

export function isMailConfigured() {
  if (env.MAIL_PROVIDER === "sendgrid") {
    return !!(env.SENDGRID_API_KEY && (env.SENDGRID_FROM || env.SMTP_FROM));
  }
  if (env.MAIL_PROVIDER === "mailtrap") {
    return !!(env.MAILTRAP_TOKEN && env.MAILTRAP_FROM_EMAIL);
  }
  return !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.SMTP_FROM);
}

function getTransporter() {
  if (transporter) return transporter;
  if (!isMailConfigured()) {
    throw new Error(
      env.MAIL_PROVIDER === "sendgrid"
        ? "SendGrid is not configured (set SENDGRID_API_KEY and SENDGRID_FROM)"
        : env.MAIL_PROVIDER === "mailtrap"
          ? "Mailtrap is not configured (set MAILTRAP_TOKEN and MAILTRAP_FROM_EMAIL)"
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

  if (env.MAIL_PROVIDER === "mailtrap") {
    if (!env.MAILTRAP_TOKEN) throw new Error("Mailtrap not configured (MAILTRAP_TOKEN missing)");
    if (!env.MAILTRAP_FROM_EMAIL)
      throw new Error("Mailtrap not configured (MAILTRAP_FROM_EMAIL missing)");

    const fromEmail = (input.from && extractEmail(input.from)) || env.MAILTRAP_FROM_EMAIL;
    const fromName = (input.from && extractName(input.from)) || env.MAILTRAP_FROM_NAME || "ExpenseFlow";

    const payload = {
      from: { email: fromEmail, name: fromName },
      to: [{ email: input.to }],
      subject: input.subject,
      text: input.text,
      html: input.html,
      // Mailtrap uses reply_to as an object, not a list, but accepts both in some SDKs.
      reply_to: input.replyTo ? { email: input.replyTo } : undefined
    };

    const res = await fetch("https://send.api.mailtrap.io/api/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.MAILTRAP_TOKEN}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    if (!res.ok) throw new Error(text || `Mailtrap send failed (HTTP ${res.status})`);

    let id: string | undefined;
    try {
      const json = JSON.parse(text) as any;
      id = typeof json?.message_id === "string" ? json.message_id : undefined;
    } catch {
      // ignore
    }

    return { provider: "mailtrap", id };
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

function extractEmail(from: string): string | undefined {
  const match = from.match(/<([^>]+)>/);
  if (match?.[1]) return match[1].trim();
  if (from.includes("@") && !from.includes(" ")) return from.trim();
  return undefined;
}

function extractName(from: string): string | undefined {
  const match = from.match(/^(.*)<[^>]+>/);
  const name = match?.[1]?.trim();
  if (!name) return undefined;
  return name.replaceAll(/^"|"$/g, "").trim() || undefined;
}
