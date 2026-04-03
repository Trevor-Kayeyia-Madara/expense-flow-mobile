import { useEffect, useState } from "react";
import type { ApiClient, FinanceListItem } from "./api";
import { cx, formatMoney } from "./utils";

export function FinanceQueue(props: {
  api: ApiClient;
  onNotify?: (message: string, kind?: "success" | "error" | "info") => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<FinanceListItem[]>([]);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const res = await props.api.financeList("approved");
      setItems(res.items);
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
  }, []);

  return (
    <section className="grid gap-3">
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-end justify-between gap-3">
          <h1 className="text-[18px] font-extrabold tracking-tight">Finance queue</h1>
          <button
            className="rounded-xl px-3 py-2 text-[13px] font-bold text-blue-700 hover:bg-blue-50 active:bg-blue-100 disabled:opacity-60"
            disabled={busy}
            onClick={() => void load()}
          >
            {busy ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        <div className="mt-3 text-[13px] font-semibold text-slate-600">Approved: {items.length}</div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-900">
          {error}
        </div>
      ) : null}

      {items.length === 0 && !busy ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center text-[13px] font-semibold text-slate-500">
          No items.
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((e) => (
            <div key={e.id} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-extrabold text-slate-900">{e.description}</div>
                  <div className="mt-1 text-[13px] font-semibold text-slate-600">
                    {e.submittedBy} · {new Date(e.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="shrink-0 text-[15px] font-extrabold text-slate-900">
                  {formatMoney(e.amountCents, e.currency)}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  className={cx(
                    "rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-3 text-[15px] font-extrabold text-white shadow-sm active:opacity-90",
                    busy ? "opacity-70" : ""
                  )}
                  onClick={async () => {
                    try {
                      await props.api.financeVerify(e.id);
                      props.onNotify?.("Verified.", "success");
                      await load();
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : "Verify failed";
                      props.onNotify?.(msg, "error");
                      setError(msg);
                    }
                  }}
                >
                  Verify
                </button>
                <button
                  className={cx(
                    "rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] font-extrabold text-slate-800 shadow-sm hover:bg-slate-50 active:bg-slate-100",
                    busy ? "opacity-70" : ""
                  )}
                  onClick={async () => {
                    try {
                      await props.api.financePost(e.id);
                      props.onNotify?.("Posted.", "success");
                      await load();
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : "Post failed";
                      props.onNotify?.(msg, "error");
                      setError(msg);
                    }
                  }}
                >
                  Post
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

