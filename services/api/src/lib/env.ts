import { z } from "zod";

const schema = z.object({
  ORIGIN: z.string().default("http://localhost:5173"),
  JWT_SECRET: z.string().min(16).default("dev-secret-change-me-please-change"),

  PUBLIC_BASE_URL: z.string().default("http://localhost:4000"),

  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: z
    .union([z.literal("true"), z.literal("false")])
    .transform((v) => v === "true")
    .default("true"),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: z.string().default(""),

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
  SEED_ADMIN_PASSWORD: z.string().min(8).default("admin1234")
});

export const env = schema.parse(process.env);
