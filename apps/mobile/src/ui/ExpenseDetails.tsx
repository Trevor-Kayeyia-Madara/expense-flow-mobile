import { useEffect, useMemo, useState } from "react";
import type { ApiClient, ExpenseApproval, ExpenseDetails as ExpenseDetailsType, ExpenseReceipt } from "./api";
import { cx, formatMoney } from "./utils";

function expenseIdFromHash() {
  const hash = window.location.hash || "";
  const qIndex = hash.indexOf("?");
  if (qIndex === -1) return "";
  const qs = hash.slice(qIndex + 1);
  const params = new URLSearchParams(qs);
  return params.get("id") ?? "";
}

export function ExpenseDetails(props: {
  api: ApiClient;
  onNotify?: (message: string, kind?: "success" | "error" | "info") => void;
}) {
  const [id, setId] = useState(() => expenseIdFromHash());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ExpenseDetailsType | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setId(expenseIdFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  async function load() {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const d = await props.api.getExpense(id);
      setData(d);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load";
      setError(msg);
      props.onNotify?.(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!data?.receipts?.length) return;
    let cancelled = false;
    (async () => {
      try {
        const blob = await props.api.downloadReceipt(data.receipts[0].id);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setReceiptPreview((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id]);

  const amount = useMemo(() => {
    if (!data) return "";
    return formatMoney(data.amountCents, data.currency);
  }, [data]);

  if (!id) {
    return (
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="text-[14px] font-semibold text-slate-800">Missing expense id.</div>
      </div>
    );
  }

  return (
    <section className="grid gap-3">
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[18px] font-extrabold tracking-tight">{data?.description ?? "Expense"}</div>
            <div className="mt-1 text-[13px] font-semibold text-slate-600">{amount}</div>
            {data ? (
              <div className="mt-1 text-[12px] font-medium text-slate-400">
                {data.category ?? "Uncategorized"} · {new Date(data.createdAt).toLocaleString()}
              </div>
            ) : null}
          </div>
          <button
            className="shrink-0 rounded-xl px-3 py-2 text-[13px] font-bold text-blue-700 hover:bg-blue-50 active:bg-blue-100 disabled:opacity-60"
            disabled={busy}
            onClick={() => void load()}
          >
            {busy ? "Loading..." : "Refresh"}
          </button>
        </div>

        {data ? (
          <div className="mt-3 flex items-center justify-between">
            <StatusPill status={data.status} />
            <div className="truncate text-[12px] font-medium text-slate-400">ID: {data.id}</div>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-900">
          {error}
        </div>
      ) : null}

      {receiptPreview ? (
        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="text-[13px] font-semibold text-slate-700">Receipt</div>
          <img
            src={receiptPreview}
            alt="Receipt"
            className="mt-2 w-full rounded-2xl border border-slate-200"
          />
          {data?.receipts?.[0] ? (
            <button
              className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[14px] font-extrabold text-slate-800 shadow-sm hover:bg-slate-50 active:bg-slate-100"
              onClick={async () => {
                try {
                  const r = data.receipts[0] as ExpenseReceipt;
                  const blob = await props.api.downloadReceipt(r.id);
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = r.fileName || `receipt-${data.id}.jpg`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
                } catch (e) {
                  props.onNotify?.(e instanceof Error ? e.message : "Download failed", "error");
                }
              }}
            >
              Download receipt
            </button>
          ) : null}
        </div>
      ) : data?.receipts?.length ? (
        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="text-[13px] font-semibold text-slate-700">Receipt</div>
          <div className="mt-2 text-[13px] font-semibold text-slate-600">
            {data.receipts.length} file(s) attached. Tap refresh to load preview.
          </div>
        </div>
      ) : null}

      {data ? (
        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="text-[13px] font-semibold text-slate-700">Approvals</div>
          {data.approvals.length === 0 ? (
            <div className="mt-2 text-[13px] font-semibold text-slate-500">No approvals yet.</div>
          ) : (
            <div className="mt-2 grid gap-2">
              {data.approvals.map((a) => (
                <ApprovalRow key={a.id} a={a} />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function ApprovalRow(props: { a: ExpenseApproval }) {
  const cls =
    props.a.decision === "approved"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : props.a.decision === "rejected"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-extrabold text-slate-900">{props.a.approverEmail}</div>
          <div className="mt-1 text-[12px] font-medium text-slate-400">{new Date(props.a.createdAt).toLocaleString()}</div>
        </div>
        <div className={cx("shrink-0 rounded-full border px-2 py-1 text-[12px] font-bold", cls)}>{props.a.decision}</div>
      </div>
      {props.a.comment ? <div className="mt-2 text-[13px] font-semibold text-slate-700">{props.a.comment}</div> : null}
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
          : props.status === "verified"
            ? "border-teal-200 bg-teal-50 text-teal-800"
            : props.status === "posted"
              ? "border-slate-300 bg-slate-100 text-slate-800"
              : "border-slate-200 bg-slate-50 text-slate-700";
  return (
    <div className={cx("rounded-full border px-2 py-1 text-[12px] font-bold", cls)}>{props.status}</div>
  );
}

