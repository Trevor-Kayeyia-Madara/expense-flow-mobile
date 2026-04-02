import { z } from "zod";

const schema = z.object({
  ORIGIN: z.string().default("http://localhost:5173"),
  JWT_SECRET: z.string().min(16).default("dev-secret-change-me-please-change"),

  PUBLIC_BASE_URL: z.string().default("http://localhost:4000"),

  // Mail provider: "smtp" (default), "sendgrid", or "mailtrap"
  MAIL_PROVIDER: z.enum(["smtp", "sendgrid", "mailtrap"]).default("smtp"),

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

  SEED_TENANT_NAME: z.string().default("Demo Company"),
  SEED_ADMIN_EMAIL: z.string().email().default("admin@demo.local"),
  SEED_ADMIN_PASSWORD: z.string().min(8).default("admin1234"),

  SEED_DIRECTOR_EMAIL: z.union([z.string().email(), z.literal("")]).default(""),
  SEED_DIRECTOR_PASSWORD: z.string().optional().default(""),

  SEED_SALES_EMAIL: z.union([z.string().email(), z.literal("")]).default(""),
  SEED_SALES_PASSWORD: z.string().optional().default("")
});

const normalizedEnv = {
  ...process.env,
  // Allow common lowercase env names too (dotenv files are user-edited).
  MAIL_PROVIDER: process.env.MAIL_PROVIDER ?? process.env.mail_provider,
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY ?? process.env.sendgrid_api_key,
  SENDGRID_FROM: process.env.SENDGRID_FROM ?? process.env.sendgrid_from,
  MAILTRAP_TOKEN: process.env.MAILTRAP_TOKEN ?? process.env.mailtrap_token,
  MAILTRAP_FROM_EMAIL: process.env.MAILTRAP_FROM_EMAIL ?? process.env.mailtrap_from_email,
  MAILTRAP_FROM_NAME: process.env.MAILTRAP_FROM_NAME ?? process.env.mailtrap_from_name,
  SEED_DIRECTOR_EMAIL: process.env.SEED_DIRECTOR_EMAIL ?? process.env.seed_director_email,
  SEED_DIRECTOR_PASSWORD: process.env.SEED_DIRECTOR_PASSWORD ?? process.env.seed_director_password,
  SEED_SALES_EMAIL: process.env.SEED_SALES_EMAIL ?? process.env.seed_sales_email,
  SEED_SALES_PASSWORD: process.env.SEED_SALES_PASSWORD ?? process.env.seed_sales_password
};

export const env = schema.parse(normalizedEnv);
