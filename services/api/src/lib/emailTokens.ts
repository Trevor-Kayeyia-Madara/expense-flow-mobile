import { randomBytes, randomUUID } from "node:crypto";
import { getPool } from "./pg";

export async function createEmailToken(input: {
  companyId: string;
  expenseId: string;
  approverId: string;
  expiresInHours?: number;
}) {
  const pool = getPool();
  const id = randomUUID();
  const token = randomBytes(32).toString("hex"); // 64 chars
  const now = new Date();
  const hours = input.expiresInHours ?? 24;
  const expiresAt = new Date(now.getTime() + hours * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO email_tokens (id, company_id, expense_id, approver_id, token, expires_at, used_at, decided_at, decision)
     VALUES ($1,$2,$3,$4,$5,$6,NULL,NULL,NULL)`,
    [id, input.companyId, input.expenseId, input.approverId, token, expiresAt]
  );

  return { id, token, expiresAt };
}
