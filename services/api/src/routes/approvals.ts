import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../lib/auth";
import { getPool } from "../lib/pg";
import { createApprovalToken } from "../lib/approvalTokens";

export const approvalsRoutes: FastifyPluginAsync = async (app) => {
  app.post("/tokens", async (req) => {
    const { tenantId, role } = await requireAuth(app, req);
    if (role !== "admin" && role !== "finance" && role !== "director") {
      throw new Error("Not allowed");
    }

    const body = z
      .object({
        expenseId: z.string().uuid(),
        expiresInHours: z.number().int().positive().max(720).optional()
      })
      .parse(req.body);

    const pool = getPool();

    const exp = await pool.query(
      "SELECT id FROM expenses WHERE id = $1 AND tenant_id = $2 LIMIT 1",
      [body.expenseId, tenantId]
    );
    if (exp.rowCount === 0) throw new Error("Expense not found");

    const { token, expiresAt } = await createApprovalToken({
      tenantId,
      expenseId: body.expenseId,
      expiresInHours: body.expiresInHours
    });

    return { token, expiresAt };
  });

  app.get("/:token", async (req) => {
    const params = z.object({ token: z.string().length(64) }).parse(req.params);
    const pool = getPool();
    const result = await pool.query(
      `SELECT
        at.expires_at as "expiresAt",
        at.used_at as "usedAt",
        at.decision,
        e.id as "expenseId",
        e.amount_cents as "amountCents",
        e.currency,
        e.description,
        e.status
       FROM approval_tokens at
       JOIN expenses e ON e.id = at.expense_id
       WHERE at.token = $1
       LIMIT 1`,
      [params.token]
    );
    if (result.rowCount === 0) throw new Error("Invalid token");
    return result.rows[0];
  });

  app.get("/:token/view", async (req, reply) => {
    const params = z.object({ token: z.string().length(64) }).parse(req.params);
    const pool = getPool();
    const result = await pool.query(
      `SELECT
        at.expires_at as "expiresAt",
        at.used_at as "usedAt",
        at.decision,
        e.id as "expenseId",
        e.amount_cents as "amountCents",
        e.currency,
        e.description,
        e.status
       FROM approval_tokens at
       JOIN expenses e ON e.id = at.expense_id
       WHERE at.token = $1
       LIMIT 1`,
      [params.token]
    );
    if (result.rowCount === 0) throw new Error("Invalid token");
    const row = result.rows[0] as {
      expenseId: string;
      amountCents: number;
      currency: string;
      description: string;
      status: string;
      decision: string | null;
      usedAt: Date | null;
      expiresAt: Date;
    };

    const amount = (row.amountCents / 100).toFixed(2);
    const expired = row.expiresAt.getTime() < Date.now();

    reply.header("content-type", "text/html; charset=utf-8");
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
    <meta name="theme-color" content="#0b1220" />
    <title>Approve expense</title>
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; font-family: ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial; background:#0b1220; color:#e8eefc; }
      .wrap { max-width: 520px; margin: 0 auto; padding: 16px; }
      .card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 16px; }
      .muted { color: rgba(232,238,252,0.7); font-size: 14px; }
      .h1 { margin: 0 0 10px 0; font-size: 20px; }
      .row { display:flex; justify-content:space-between; gap:12px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
      .row:last-child { border-bottom: 0; }
      .btns { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
      button { padding: 14px 12px; border-radius: 14px; border: 0; font-weight: 900; font-size: 16px; }
      .approve { background:#22c55e; color:#06130b; }
      .reject { background:#ef4444; color:#220707; }
      .disabled { opacity: 0.55; }
      .msg { margin-top: 12px; padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.10); background: rgba(0,0,0,0.10); font-size: 14px; }
      a { color: #a9c1ff; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1 class="h1">Expense approval</h1>
        <div class="muted">Tap approve/reject. No login.</div>
        <div style="height: 10px"></div>
        <div class="row"><div class="muted">Amount</div><div><strong>${escapeHtml(
          row.currency
        )} ${escapeHtml(amount)}</strong></div></div>
        <div class="row"><div class="muted">Description</div><div style="text-align:right">${escapeHtml(
          row.description
        )}</div></div>
        <div class="row"><div class="muted">Status</div><div>${escapeHtml(
          row.status
        )}</div></div>
        <div class="row"><div class="muted">Expires</div><div>${escapeHtml(
          row.expiresAt.toISOString()
        )}</div></div>

        <div class="btns">
          <button id="approve" class="approve">Approve</button>
          <button id="reject" class="reject">Reject</button>
        </div>
        <div id="msg" class="msg" style="display:none"></div>
      </div>
      <div class="muted" style="text-align:center; padding: 14px 0">Expense ID: ${escapeHtml(
        row.expenseId
      )}</div>
    </div>

    <script>
      const expired = ${expired ? "true" : "false"};
      const used = ${row.usedAt ? "true" : "false"};
      const existingDecision = ${JSON.stringify(row.decision)};
      const msg = document.getElementById('msg');
      const approveBtn = document.getElementById('approve');
      const rejectBtn = document.getElementById('reject');

      function show(text) {
        msg.style.display = 'block';
        msg.textContent = text;
      }
      function setDisabled(disabled) {
        approveBtn.disabled = disabled;
        rejectBtn.disabled = disabled;
        approveBtn.classList.toggle('disabled', disabled);
        rejectBtn.classList.toggle('disabled', disabled);
      }

      if (expired) { show('This link has expired.'); setDisabled(true); }
      if (used && existingDecision) { show('Already decided: ' + existingDecision); setDisabled(true); }

      async function decide(decision) {
        setDisabled(true);
        show('Submitting…');
        const res = await fetch('/approvals/${params.token}/decision', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ decision })
        });
        const text = await res.text();
        if (!res.ok) { show(text || ('HTTP ' + res.status)); setDisabled(false); return; }
        show('Done: ' + decision);
      }

      approveBtn.addEventListener('click', () => decide('approved'));
      rejectBtn.addEventListener('click', () => decide('rejected'));
    </script>
  </body>
</html>`;
  });

  app.post("/:token/decision", async (req) => {
    const params = z.object({ token: z.string().length(64) }).parse(req.params);
    const body = z
      .object({ decision: z.enum(["approved", "rejected"]) })
      .parse(req.body);

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const tokenRow = await client.query(
        `SELECT id, tenant_id as "tenantId", expense_id as "expenseId", expires_at as "expiresAt", used_at as "usedAt"
         FROM approval_tokens
         WHERE token = $1
         LIMIT 1
         FOR UPDATE`,
        [params.token]
      );
      if (tokenRow.rowCount === 0) throw new Error("Invalid token");

      const t = tokenRow.rows[0] as {
        id: string;
        tenantId: string;
        expenseId: string;
        expiresAt: Date;
        usedAt: Date | null;
      };

      if (t.usedAt) throw new Error("Token already used");
      if (t.expiresAt.getTime() < Date.now()) throw new Error("Token expired");

      const now = new Date();
      await client.query(
        "UPDATE expenses SET status = $1, updated_at = $2 WHERE id = $3 AND tenant_id = $4",
        [body.decision, now, t.expenseId, t.tenantId]
      );
      await client.query(
        "UPDATE approval_tokens SET used_at = $1, decided_at = $1, decision = $2 WHERE id = $3",
        [now, body.decision, t.id]
      );

      await client.query("COMMIT");
      return { ok: true, decision: body.decision };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });
};

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
