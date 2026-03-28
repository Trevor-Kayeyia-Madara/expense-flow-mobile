import type { FastifyInstance, FastifyRequest } from "fastify";

export async function requireAuth(app: FastifyInstance, req: FastifyRequest) {
  await req.jwtVerify();
  const payload = req.user as { sub?: string; tid?: string; role?: string };
  if (!payload?.sub || !payload?.tid || !payload?.role) throw new Error("Invalid token");
  return { userId: payload.sub, tenantId: payload.tid, role: payload.role };
}
