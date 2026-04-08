import { useEffect, useState } from "react";
import type { ApiClient, NotificationItem } from "./api";
import { cx } from "./utils";

export function Notifications(props: {
  api: ApiClient;
  onNotify?: (message: string, kind?: "success" | "error" | "info") => void;
  onUnreadCountChange?: (count: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);

  async function load(opts?: { silent?: boolean }) {
    setBusy(true);
    setError(null);
    try {
      const res = await props.api.listNotifications({ unreadOnly });
      setItems(res.items);
      try {
        const c = await props.api.unreadNotificationsCount();
        props.onUnreadCountChange?.(c.count);
      } catch {
        // ignore
      }
      if (!opts?.silent) props.onNotify?.("Notifications refreshed.", "success");
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
  }, [unreadOnly]);

  return (
    <section className="grid gap-3">
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-end justify-between gap-3">
          <h1 className="text-[18px] font-extrabold tracking-tight">Notifications</h1>
          <button
            className="rounded-xl px-3 py-2 text-[13px] font-bold text-blue-700 hover:bg-blue-50 active:bg-blue-100 disabled:opacity-60"
            disabled={busy}
            onClick={() => void load()}
          >
            {busy ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="mt-3 grid gap-3">
          <label className="flex items-center gap-2 text-[13px] font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            Unread only
          </label>
          <div className="text-[13px] font-semibold text-slate-600">Count: {items.length}</div>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-900">
          {error}
        </div>
      ) : null}

      {items.length === 0 && !busy ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center text-[13px] font-semibold text-slate-500">
          No notifications.
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((n) => {
            const unread = !n.readAt;
            return (
              <button
                key={n.id}
                className={cx(
                  "rounded-3xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200 active:opacity-90",
                  unread ? "ring-blue-200" : ""
                )}
                onClick={async () => {
                  if (n.readAt) return;
                  try {
                    await props.api.markNotificationRead(n.id);
                    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
                    try {
                      const c = await props.api.unreadNotificationsCount();
                      props.onUnreadCountChange?.(c.count);
                    } catch {
                      // ignore
                    }
                  } catch (e) {
                    props.onNotify?.(e instanceof Error ? e.message : "Failed to mark read", "error");
                  }
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-extrabold text-slate-900">
                      {n.title}
                      {unread ? <span className="ml-2 text-[12px] font-extrabold text-blue-700">NEW</span> : null}
                    </div>
                    <div className="mt-1 text-[13px] font-semibold text-slate-700">{n.message}</div>
                    <div className="mt-2 text-[12px] font-medium text-slate-400">
                      {new Date(n.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
