import { z } from "zod";

const schema = z.object({
  ORIGIN: z.string().default("http://localhost:5173"),
  JWT_SECRET: z.string().min(16).default("dev-secret-change-me-please-change"),

  PUBLIC_BASE_URL: z.string().default("http://localhost:4000"),
  // Public URL of the web app (PWA). Used for "Open details" links in approval emails.
  APP_BASE_URL: z.string().default("http://localhost:5173"),

  // Mail provider: "smtp" (default), "sendgrid", or "mailtrap"
  MAIL_PROVIDER: z.enum(["smtp", "sendgrid", "mailtrap"]).default("smtp"),
  // Controls whether emails can set the actor (sales/director) as the `from` address.
  // Most providers require the domain to be authenticated (SPF/DKIM) for this to work.
  MAIL_FROM_MODE: z.enum(["system", "actor"]).default("system"),

  // SendGrid
  SENDGRID_API_KEY: z.string().optional().default(""),
  SENDGRID_FROM: z.string().optional().default(""),

  // Mailtrap (Email Sending API)
  MAILTRAP_TOKEN: z.string().optional().default(""),
  MAILTRAP_FROM_EMAIL: z.string().optional().default(""),
  MAILTRAP_FROM_NAME: z.string().optional().default("ExpenseFlow"),

  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: z
    .union([z.literal("true"), z.literal("false")])
    .transform((v) => v === "true")
    .default("true"),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: z.string().default(""),
  SMTP_TLS_SERVERNAME: z.string().optional().default(""),
  SMTP_TLS_REJECT_UNAUTHORIZED: z
    .union([z.literal("true"), z.literal("false")])
    .transform((v) => v === "true")
    .default("true"),
  SMTP_TLS_CA_FILE: z.string().optional().default(""),

  DATABASE_URL: z.string().optional().default(""),

  DB_HOST: z.string().default("localhost"),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USER: z.string().default("expenseflow"),
  DB_PASSWORD: z.string().default("expenseflow"),
  DB_NAME: z.string().default("expenseflow"),
  DB_SSL: z
    .union([z.literal("true"), z.literal("false")])
    .transform((v) => v === "true")
    .default("false"),

  UPLOAD_DIR: z.string().default("./uploads"),
});

const normalizedEnv = {
  ...process.env,
  // Allow common lowercase env names too (dotenv files are user-edited).
  APP_BASE_URL: process.env.APP_BASE_URL ?? process.env.app_base_url ?? process.env.PUBLIC_APP_URL ?? process.env.public_app_url,
  MAIL_PROVIDER: process.env.MAIL_PROVIDER ?? process.env.mail_provider,
  MAIL_FROM_MODE: process.env.MAIL_FROM_MODE ?? process.env.mail_from_mode,
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY ?? process.env.sendgrid_api_key,
  SENDGRID_FROM: process.env.SENDGRID_FROM ?? process.env.sendgrid_from,
  MAILTRAP_TOKEN: process.env.MAILTRAP_TOKEN ?? process.env.mailtrap_token,
  MAILTRAP_FROM_EMAIL: process.env.MAILTRAP_FROM_EMAIL ?? process.env.mailtrap_from_email,
  MAILTRAP_FROM_NAME: process.env.MAILTRAP_FROM_NAME ?? process.env.mailtrap_from_name,
};

export const env = schema.parse(normalizedEnv);
