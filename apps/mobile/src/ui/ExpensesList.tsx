import { useEffect, useMemo, useState } from "react";
import type { ApiClient, ExpenseListItem, ExpenseStatus } from "./api";
import { cx, formatMoney } from "./utils";

export function ExpensesList(props: {
  api: ApiClient;
  onNotify?: (message: string, kind?: "success" | "error" | "info") => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ExpenseListItem[]>([]);
  const [filter, setFilter] = useState<ExpenseStatus | "all">("all");

  const total = useMemo(() => items.reduce((sum, e) => sum + e.amountCents, 0), [items]);

  async function load(opts?: { silent?: boolean }) {
    setBusy(true);
    setError(null);
    try {
      const res = await props.api.listExpenses(filter === "all" ? undefined : { status: filter });
      setItems(res.items);
      if (!opts?.silent) props.onNotify?.("Expenses refreshed.", "success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load";
      setError(msg);
      props.onNotify?.(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  return (
    <section className="grid gap-3">
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-end justify-between gap-3">
          <h1 className="text-[18px] font-extrabold tracking-tight">My expenses</h1>
          <button
            className="rounded-xl px-3 py-2 text-[13px] font-bold text-blue-700 hover:bg-blue-50 active:bg-blue-100 disabled:opacity-60"
            disabled={busy}
            onClick={() => void load()}
          >
            {busy ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between text-[13px] font-semibold text-slate-600">
          <div>Count: {items.length}</div>
          <div>Total: {formatMoney(total, items[0]?.currency ?? "KES")}</div>
        </div>

        <div className="mt-3">
          <select
            className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-[15px] font-semibold ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-70"
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            disabled={busy}
          >
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="verified">Verified</option>
            <option value="posted">Posted</option>
          </select>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-900">
          {error}
        </div>
      ) : null}

      {items.length === 0 && !busy ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center text-[13px] font-semibold text-slate-500">
          No expenses.
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((e) => (
            <ExpenseRow
              key={e.id}
              e={e}
              busy={busy}
              api={props.api}
              onNotify={props.onNotify}
              onChanged={() => void load({ silent: true })}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ExpenseRow(props: {
  e: ExpenseListItem;
  busy: boolean;
  api: ApiClient;
  onNotify?: (message: string, kind?: "success" | "error" | "info") => void;
  onChanged: () => void;
}) {
  const [actionBusy, setActionBusy] = useState(false);
  const canSubmit = props.e.status === "draft" || props.e.status === "rejected";

  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-extrabold text-slate-900">{props.e.description}</div>
          <div className="mt-1 text-[13px] font-semibold text-slate-600">
            {props.e.category ?? "Uncategorized"} · {new Date(props.e.createdAt).toLocaleString()}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[15px] font-extrabold text-slate-900">
            {formatMoney(props.e.amountCents, props.e.currency)}
          </div>
          <div className="mt-1 flex justify-end">
            <StatusPill status={props.e.status} />
          </div>
        </div>
      </div>

      {canSubmit ? (
        <button
          className={cx(
            "mt-3 w-full rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-3 text-[15px] font-extrabold text-white shadow-sm active:opacity-90",
            actionBusy ? "opacity-70" : ""
          )}
          disabled={props.busy || actionBusy}
          onClick={async () => {
            setActionBusy(true);
            try {
              const res = await props.api.submitExpense(props.e.id);
              props.onNotify?.(
                res.emailed ? `Submitted. Email sent to ${res.directorEmail}.` : "Submitted, but email was not sent.",
                res.emailed ? "success" : "info"
              );
              props.onChanged();
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Submit failed";
              props.onNotify?.(msg, "error");
            } finally {
              setActionBusy(false);
            }
          }}
        >
          Submit for approval
        </button>
      ) : null}

      <div className="mt-3 truncate text-[12px] font-medium text-slate-400">ID: {props.e.id}</div>
    </div>
  );
}

function StatusPill(props: { status: string }) {
  const cls =
    props.status === "approved"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : props.status === "rejected"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : props.status === "submitted"
          ? "border-blue-200 bg-blue-50 text-blue-800"
          : "border-slate-200 bg-slate-50 text-slate-700";
  return (
    <div className={cx("rounded-full border px-2 py-1 text-[12px] font-bold", cls)}>{props.status}</div>
  );
}

