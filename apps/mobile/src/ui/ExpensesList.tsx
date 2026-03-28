import { useEffect, useMemo, useState } from "react";
import type { ApiClient } from "./App";

export function ExpensesList(props: { api: ApiClient }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<
    Array<{
      id: string;
      amountCents: number;
      currency: string;
      description: string;
      status: string;
      createdAt: string;
    }>
  >([]);

  const total = useMemo(() => {
    return items.reduce((sum, e) => sum + e.amountCents, 0);
  }, [items]);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const res = await props.api.listExpenses();
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h1 style={styles.h1}>My expenses</h1>
          <button style={styles.link} disabled={busy} onClick={() => void load()}>
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <div style={styles.muted}>
          Total (last {items.length}): <strong>{formatMoney(total, "KES")}</strong>
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {items.length === 0 && !busy ? (
        <div style={styles.empty}>No expenses yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((e) => (
            <div key={e.id} style={styles.item}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 800 }}>{truncate(e.description, 44)}</div>
                <div style={{ fontWeight: 900 }}>{formatMoney(e.amountCents, e.currency)}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={styles.badge(e.status)}>{e.status}</div>
                <div style={styles.muted}>{new Date(e.createdAt).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function formatMoney(amountCents: number, currency: string) {
  const amt = amountCents / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amt);
  } catch {
    return `${currency} ${amt.toFixed(2)}`;
  }
}

function truncate(s: string, max: number) {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

const styles: Record<string, any> = {
  card: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 16
  },
  h1: { margin: 0, fontSize: 20, letterSpacing: 0.2 },
  muted: { color: "rgba(232,238,252,0.70)", fontSize: 13 },
  link: {
    background: "transparent",
    border: "0",
    color: "#a9c1ff",
    padding: 8,
    fontSize: 14
  },
  item: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 14,
    display: "grid",
    gap: 10
  },
  badge: (status: string) => ({
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    color: "#06130b",
    background:
      status === "approved"
        ? "rgba(34,197,94,0.95)"
        : status === "rejected"
          ? "rgba(239,68,68,0.95)"
          : "rgba(59,130,246,0.95)"
  }),
  error: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,120,120,0.35)",
    background: "rgba(255,120,120,0.10)",
    color: "rgba(255,220,220,0.95)",
    fontSize: 13
  },
  empty: {
    padding: "18px 12px",
    borderRadius: 14,
    border: "1px dashed rgba(255,255,255,0.18)",
    color: "rgba(232,238,252,0.55)",
    textAlign: "center"
  }
};

