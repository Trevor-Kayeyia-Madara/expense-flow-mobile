import type { FastifyPluginAsync } from "fastify";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getPool } from "../lib/pg";
import { env } from "../lib/env";
import { writeAuditLog } from "../lib/audit";
import { createNotification } from "../lib/notifications";
import { isMailConfigured, sendMail } from "../lib/mailer";

function htmlPage(title: string, body: string) {
  return (
    `<!doctype html>` +
    `<html><head>` +
    `<meta charset="utf-8" />` +
    `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />` +
    `<title>${escapeHtml(title)}</title>` +
    `<style>` +
    `body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial; margin:0; background:#0b1220; color:#e5e7eb}` +
    `.wrap{max-width:720px;margin:0 auto;padding:24px}` +
    `.card{background:#0f172a;border:1px solid rgba(148,163,184,.25); border-radius:18px; padding:18px}` +
    `.muted{color:#94a3b8; font-size:13px}` +
    `.btns{display:flex; gap:10px; margin-top:14px; flex-wrap:wrap}` +
    `.btn{display:inline-block; padding:10px 14px; border-radius:14px; font-weight:800; text-decoration:none}` +
    `.ok{background:#10b981; color:white}` +
    `.bad{background:#ef4444; color:white}` +
    `.ghost{background:transparent; color:#93c5fd; border:1px solid rgba(147,197,253,.35)}` +
    `</style>` +
    `</head><body><div class="wrap">${body}</div></body></html>`
  );
}

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadTokenForView(token: string) {
  const pool = getPool();
  const row = await pool.query(
    `SELECT
        t.id,
        t.company_id as "companyId",
        t.expense_id as "expenseId",
        t.approver_id as "approverId",
        t.expires_at as "expiresAt",
        t.used_at as "usedAt",
        e.amount_cents as "amountCents",
        e.currency,
        e.description,
        e.status,
        e.user_id as "submittedById",
        u.email as "submittedByEmail",
        a.email as "approverEmail"
     FROM email_tokens t
     JOIN expenses e ON e.id = t.expense_id
     JOIN users u ON u.id = e.user_id
     JOIN users a ON a.id = t.approver_id
     WHERE t.token = $1
     LIMIT 1`,
    [token]
  );
  return row.rows[0] as
    | {
        id: string;
        companyId: string;
        expenseId: string;
        approverId: string;
        expiresAt: Date;
        usedAt: Date | null;
        amountCents: number;
        currency: string;
        description: string;
        status: string;
        submittedById: string;
        submittedByEmail: string;
        approverEmail: string;
      }
    | undefined;
}

export const approvalEmailRoutes: FastifyPluginAsync = async (app) => {
  // JSON view for the PWA director panel (no auth; token is the authority).
  app.get("/token", async (req) => {
    const q = z.object({ token: z.string().min(10) }).parse(req.query);
    const t = await loadTokenForView(q.token);
    if (!t) throw new Error("Invalid token");
    return {
      token: q.token,
      companyId: t.companyId,
      expenseId: t.expenseId,
      approverEmail: t.approverEmail,
      submittedByEmail: t.submittedByEmail,
      amountCents: t.amountCents,
      currency: t.currency,
      description: t.description,
      status: t.status,
      expiresAt: t.expiresAt,
      usedAt: t.usedAt
    };
  });

  app.get("/view", async (req, reply) => {
    const q = z.object({ token: z.string().min(10) }).parse(req.query);
    const t = await loadTokenForView(q.token);
    if (!t) return reply.type("text/html").send(htmlPage("Not found", `<div class="card">Invalid token.</div>`));

    const now = new Date();
    const expired = new Date(t.expiresAt).getTime() < now.getTime();
    const used = !!t.usedAt;

    const approveUrl = `${env.PUBLIC_BASE_URL}/approval/approve?token=${encodeURIComponent(q.token)}`;
    const rejectUrl = `${env.PUBLIC_BASE_URL}/approval/reject?token=${encodeURIComponent(q.token)}`;

    const info =
      `<div class="card">` +
      `<div style="font-size:18px;font-weight:900">Expense approval</div>` +
      `<p class="muted" style="margin:8px 0 0 0">Approver: ${escapeHtml(t.approverEmail)}</p>` +
      `<hr style="border:none;border-top:1px solid rgba(148,163,184,.2);margin:14px 0" />` +
      `<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">` +
      `<div><div class="muted">Amount</div><div style="font-size:20px;font-weight:900">${escapeHtml(t.currency)} ${(t.amountCents / 100).toFixed(2)}</div></div>` +
      `<div><div class="muted">Status</div><div style="font-size:16px;font-weight:800">${escapeHtml(t.status)}</div></div>` +
      `</div>` +
      `<p style="margin:14px 0 0 0"><span class="muted">Description:</span><br/>${escapeHtml(t.description)}</p>` +
      `<p class="muted" style="margin:10px 0 0 0">Submitted by: ${escapeHtml(t.submittedByEmail)}</p>` +
      `<p class="muted" style="margin:10px 0 0 0">Expires: ${escapeHtml(new Date(t.expiresAt).toISOString())}</p>` +
      (expired ? `<p style="margin:12px 0 0 0;color:#fca5a5;font-weight:800">Token expired.</p>` : "") +
      (used ? `<p style="margin:12px 0 0 0;color:#fde68a;font-weight:800">This link was already used.</p>` : "") +
      `<div class="btns">` +
      (expired || used
        ? `<a class="btn ghost" href="${escapeHtml(env.PUBLIC_BASE_URL)}">Open ExpenseFlow</a>`
        : `<a class="btn ok" href="${approveUrl}">Approve</a><a class="btn bad" href="${rejectUrl}">Reject</a>`) +
      `</div>` +
      `</div>`;

    return reply.type("text/html").send(htmlPage("Expense approval", info));
  });

  app.get("/receipt", async (req, reply) => {
    const q = z.object({ token: z.string().min(10) }).parse(req.query);
    const t = await loadTokenForView(q.token);
    if (!t) throw new Error("Invalid token");

    const now = new Date();
    if (new Date(t.expiresAt).getTime() < now.getTime()) throw new Error("Token expired");

    const pool = getPool();
    const r = await pool.query(
      `SELECT file_key as "fileKey", mime_type as "mimeType"
       FROM receipts
       WHERE expense_id = $1 AND company_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [t.expenseId, t.companyId]
    );
    if (!r.rowCount) throw new Error("Receipt not found");
    const row = r.rows[0] as { fileKey: string; mimeType: string };
    const full = resolve(env.UPLOAD_DIR, row.fileKey);
    reply.type(row.mimeType);
    return reply.send(createReadStream(full));
  });

  async function decide(token: string, decision: "approved" | "rejected") {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const tok = await client.query(
        `SELECT id,
                company_id as "companyId",
                expense_id as "expenseId",
                approver_id as "approverId",
                expires_at as "expiresAt",
                used_at as "usedAt"
         FROM email_tokens
         WHERE token = $1
         LIMIT 1
         FOR UPDATE`,
        [token]
      );
      if (!tok.rowCount) throw new Error("Invalid token");
      const t = tok.rows[0] as any;
      if (t.usedAt) throw new Error("Token already used");
      if (new Date(t.expiresAt).getTime() < Date.now()) throw new Error("Token expired");

      const exp = await client.query(
        `SELECT id,
                status,
                user_id as "userId",
                amount_cents as "amountCents",
                currency
         FROM expenses
         WHERE id = $1 AND company_id = $2
         LIMIT 1
         FOR UPDATE`,
        [t.expenseId, t.companyId]
      );
      if (!exp.rowCount) throw new Error("Expense not found");
      const e = exp.rows[0] as any;
      if (e.status !== "submitted") throw new Error("Expense is not awaiting approval");

      const now = new Date();

      await client.query(
        `UPDATE expenses
         SET status = $1,
             decided_at = $2,
             updated_at = $2
         WHERE id = $3 AND company_id = $4`,
        [decision, now, t.expenseId, t.companyId]
      );

      await client.query(
        `UPDATE email_tokens
         SET used_at = $1,
             decided_at = $1,
             decision = $2
         WHERE id = $3`,
        [now, decision, t.id]
      );

      await client.query(
        `INSERT INTO approvals (id, company_id, expense_id, approver_id, decision, comment, created_at)
         VALUES ($1,$2,$3,$4,$5,NULL,$6)`,
        [randomUUID(), t.companyId, t.expenseId, t.approverId, decision, now]
      );

      await client.query("COMMIT");

      await writeAuditLog({
        companyId: t.companyId,
        entityType: "expense",
        entityId: t.expenseId,
        action: `expense.${decision}`,
        performedBy: t.approverId,
        beforeState: { status: "submitted" },
        afterState: { status: decision },
        createdAt: now
      });

      await createNotification({
        companyId: t.companyId,
        userId: e.userId,
        title: decision === "approved" ? "Expense approved" : "Expense rejected",
        message:
          decision === "approved"
            ? `Director approved your expense (${e.currency} ${(e.amountCents / 100).toFixed(2)}).`
            : `Director rejected your expense (${e.currency} ${(e.amountCents / 100).toFixed(2)}).`,
        createdAt: now
      });

      if (decision === "approved") {
        // Notify finance users in-app (email optional later)
        const finance = await pool.query(
          `SELECT id FROM users WHERE company_id = $1 AND role = 'finance' AND is_active = true`,
          [t.companyId]
        );
        const appLink = env.APP_BASE_URL.replace(/\/+$/, "");
        const financeText =
          `A new expense is approved and ready for finance review.\n\n` +
          `Amount: ${e.currency} ${(e.amountCents / 100).toFixed(2)}\n` +
          `Expense ID: ${t.expenseId}\n\n` +
          `Open ExpenseFlow: ${appLink}\n`;

        const financeHtml =
          `<p><strong>New approved expense</strong></p>` +
          `<p>Amount: <strong>${escapeHtml(e.currency)} ${(e.amountCents / 100).toFixed(2)}</strong><br/>` +
          `Expense ID: <code>${escapeHtml(t.expenseId)}</code></p>` +
          `<p><a href="${appLink}">Open ExpenseFlow</a></p>`;

        for (const row of finance.rows as Array<{ id: string }>) {
          await createNotification({
            companyId: t.companyId,
            userId: row.id,
            title: "Expense approved",
            message: "A new approved expense is ready in the finance queue.",
            createdAt: now
          });
        }

        if (isMailConfigured()) {
          try {
            let directorEmail: string | undefined;
            try {
              const d = await pool.query("SELECT email FROM users WHERE id = $1 LIMIT 1", [t.approverId]);
              directorEmail = typeof d.rows?.[0]?.email === "string" ? d.rows[0].email : undefined;
            } catch {
              // ignore
            }

            let from: string | undefined;
            if (env.MAIL_FROM_MODE === "actor" && directorEmail) {
              try {
                const c = await pool.query("SELECT domain FROM companies WHERE id = $1 LIMIT 1", [t.companyId]);
                const domain = String(c.rows?.[0]?.domain ?? "").toLowerCase();
                const dDomain = (directorEmail.toLowerCase().split("@")[1] ?? "").trim();
                if (domain && dDomain === domain) from = directorEmail;
              } catch {
                // ignore
              }
            }

            const financeEmails = await pool.query(
              `SELECT email FROM users WHERE company_id = $1 AND role = 'finance' AND is_active = true`,
              [t.companyId]
            );
            for (const fe of financeEmails.rows as Array<{ email: string }>) {
              try {
                try {
                  await sendMail({
                    to: fe.email,
                    subject: `Expense approved: ${e.currency} ${(e.amountCents / 100).toFixed(2)}`,
                    text: financeText,
                    html: financeHtml,
                    from,
                    replyTo: directorEmail
                  });
                } catch (err) {
                  if (from) {
                    await sendMail({
                      to: fe.email,
                      subject: `Expense approved: ${e.currency} ${(e.amountCents / 100).toFixed(2)}`,
                      text: financeText,
                      html: financeHtml,
                      replyTo: directorEmail
                    });
                  } else {
                    throw err;
                  }
                }
              } catch {
                // best-effort
              }
            }
          } catch {
            // best-effort
          }
        }
      }

      return { companyId: t.companyId, expenseId: t.expenseId };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  app.get("/approve", async (req, reply) => {
    const q = z.object({ token: z.string().min(10) }).parse(req.query);
    try {
      await decide(q.token, "approved");
      const view = `${env.PUBLIC_BASE_URL}/approval/view?token=${encodeURIComponent(q.token)}`;
      const body =
        `<div class="card">` +
        `<div style="font-size:18px;font-weight:900">Approved</div>` +
        `<p class="muted" style="margin:10px 0 0 0">Thanks — the expense is now approved.</p>` +
        `<div class="btns"><a class="btn ghost" href="${view}">Back to details</a></div>` +
        `</div>`;
      return reply.type("text/html").send(htmlPage("Approved", body));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      return reply.type("text/html").send(htmlPage("Error", `<div class="card">${escapeHtml(msg)}</div>`));
    }
  });

  app.get("/reject", async (req, reply) => {
    const q = z.object({ token: z.string().min(10) }).parse(req.query);
    try {
      await decide(q.token, "rejected");
      const view = `${env.PUBLIC_BASE_URL}/approval/view?token=${encodeURIComponent(q.token)}`;
      const body =
        `<div class="card">` +
        `<div style="font-size:18px;font-weight:900">Rejected</div>` +
        `<p class="muted" style="margin:10px 0 0 0">The expense is now rejected.</p>` +
        `<div class="btns"><a class="btn ghost" href="${view}">Back to details</a></div>` +
        `</div>`;
      return reply.type("text/html").send(htmlPage("Rejected", body));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      return reply.type("text/html").send(htmlPage("Error", `<div class="card">${escapeHtml(msg)}</div>`));
    }
  });

  // JSON approve/reject for the PWA director panel.
  app.post("/approve", async (req) => {
    const body = z.object({ token: z.string().min(10) }).parse(req.body);
    await decide(body.token, "approved");
    return { ok: true };
  });

  app.post("/reject", async (req) => {
    const body = z.object({ token: z.string().min(10) }).parse(req.body);
    await decide(body.token, "rejected");
    return { ok: true };
  });
};
