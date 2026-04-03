import { randomUUID } from "node:crypto";
import { getPool } from "./pg";

export type NotificationInput = {
  companyId: string;
  userId: string;
  title: string;
  message: string;
  createdAt?: Date;
};

export async function createNotification(input: NotificationInput) {
  const pool = getPool();
  const id = randomUUID();
  const createdAt = input.createdAt ?? new Date();
  await pool.query(
    `INSERT INTO notifications
      (id, company_id, user_id, title, message, read_at, created_at)
     VALUES ($1,$2,$3,$4,$5,NULL,$6)`,
    [id, input.companyId, input.userId, input.title, input.message, createdAt]
  );
  return { id };
}
