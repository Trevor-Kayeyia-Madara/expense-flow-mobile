import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { env } from "./lib/env";
import { initPostgres } from "./lib/pg";
import { migrate } from "./lib/migrate";
import { seed } from "./lib/seed";
import { authRoutes } from "./routes/auth";
import { expensesRoutes } from "./routes/expenses";
import { usersRoutes } from "./routes/users";
import { financeRoutes } from "./routes/finance";
import { companiesRoutes } from "./routes/companies";
import { approvalEmailRoutes } from "./routes/approvalEmail";

async function main() {
  const app = Fastify({ logger: true });

  // Set error handler early so it applies to all plugins/routes (Fastify encapsulation).
  app.setErrorHandler((err, _req, reply) => {
    app.log.error(err);
    const anyErr = err as any;
    if (anyErr?.name === "ZodError" && Array.isArray(anyErr?.issues)) {
      reply.status(400).send({ error: "Validation error", issues: anyErr.issues });
      return;
    }
    const statusCode =
      typeof anyErr?.statusCode === "number" && Number.isFinite(anyErr.statusCode)
        ? anyErr.statusCode
        : 400;
    const message = err instanceof Error ? err.message : "Bad Request";
    reply.status(statusCode).send({ error: message });
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      const allowed = new Set(
        env.ORIGIN.split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      );
      if (allowed.has("*")) return cb(null, true);
      if (!origin || allowed.has(origin)) return cb(null, true);
      cb(new Error("Origin not allowed"), false);
    }
  });

  await app.register(jwt, { secret: env.JWT_SECRET });
  await app.register(multipart, {
    limits: { fileSize: 8 * 1024 * 1024 } // 8MB
  });

  mkdirSync(resolve(env.UPLOAD_DIR), { recursive: true });
  await initPostgres();
  await migrate();
  await seed();

  app.get("/health", async () => ({ ok: true }));

  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(companiesRoutes, { prefix: "/companies" });
  await app.register(usersRoutes, { prefix: "/users" });
  await app.register(expensesRoutes, { prefix: "/expenses" });
  await app.register(approvalEmailRoutes, { prefix: "/approval" });
  await app.register(financeRoutes, { prefix: "/finance" });

  const listenSchema = z.object({
    PORT: z.coerce.number().min(1).max(65535).default(4000),
    HOST: z.string().default("0.0.0.0")
  });
  const listenEnv = listenSchema.parse(process.env);

  await app.listen({ port: listenEnv.PORT, host: listenEnv.HOST });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exitCode = 1;
});
