import { randomUUID } from "node:crypto";
import { getPool } from "./pg";

export type AuditInput = {
  companyId: string;
  entityType: string;
  entityId: string;
  action: string;
  performedBy?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  createdAt?: Date;
};

export async function writeAuditLog(input: AuditInput) {
  const pool = getPool();
  const id = randomUUID();
  const createdAt = input.createdAt ?? new Date();
  await pool.query(
    `INSERT INTO audit_logs
      (id, company_id, entity_type, entity_id, action, performed_by, before_state, after_state, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      input.companyId,
      input.entityType,
      input.entityId,
      input.action,
      input.performedBy ?? null,
      input.beforeState ? JSON.stringify(input.beforeState) : null,
      input.afterState ? JSON.stringify(input.afterState) : null,
      createdAt
    ]
  );
  return { id };
}
