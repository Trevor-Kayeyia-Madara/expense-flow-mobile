import { randomBytes, randomUUID } from "node:crypto";
import { getPool } from "./pg";

export async function createApprovalToken(input: {
  tenantId: string;
  expenseId: string;
  expiresInHours?: number;
}) {
  const pool = getPool();
  const token = randomBytes(32).toString("hex");
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + (input.expiresInHours ?? 72) * 60 * 60 * 1000);

  await pool.query(
    "INSERT INTO approval_tokens (id, tenant_id, expense_id, token, expires_at) VALUES ($1,$2,$3,$4,$5)",
    [id, input.tenantId, input.expenseId, token, expiresAt]
  );

  return { token, expiresAt };
}

