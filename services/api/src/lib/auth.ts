import type { FastifyInstance, FastifyRequest } from "fastify";

export async function requireAuth(app: FastifyInstance, req: FastifyRequest) {
  await req.jwtVerify();
  const payload = req.user as {
    sub?: string;
    cid?: string;
    tid?: string; // legacy
    role?: string;
    email?: string;
  };
  const companyId = payload.cid ?? payload.tid;
  if (!payload?.sub || !companyId || !payload?.role) throw new Error("Invalid token");
  return {
    userId: payload.sub,
    companyId,
    role: payload.role,
    email: payload.email ?? ""
  };
}
