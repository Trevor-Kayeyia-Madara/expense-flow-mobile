import { useEffect, useState } from "react";
import type { ApiClient } from "./App";

export function DirectorPanel(props: {
  api: ApiClient;
  onNotify?: (message: string, kind?: "success" | "error" | "info") => void;
}) {
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
      submittedBy: string;
    }>
  >([]);

  async function load(opts?: { silent?: boolean }) {
    setBusy(true);
    setError(null);
    try {
      const res = await props.api.directorQueue();
      setItems(res.items);
      if (!opts?.silent) props.onNotify?.("Queue refreshed.", "success");
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
  }, []);

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h1 style={styles.h1}>Director approvals</h1>
          <button style={styles.link} disabled={busy} onClick={() => void load()}>
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <div style={styles.muted}>Pending: {items.length}</div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {items.length === 0 && !busy ? (
        <div style={styles.empty}>No pending approvals.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((e) => (
            <div key={e.id} style={styles.item}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 900 }}>{truncate(e.description, 44)}</div>
                <div style={{ fontWeight: 900 }}>{formatMoney(e.amountCents, e.currency)}</div>
              </div>
              <div style={styles.muted}>
                From: {e.submittedBy} • {new Date(e.createdAt).toLocaleString()}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button
                  style={styles.approve}
                  onClick={async () => {
                    try {
                      await props.api.directorDecision(e.id, "approved");
                      props.onNotify?.("Approved.", "success");
                      await load();
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : "Approve failed";
                      props.onNotify?.(msg, "error");
                      setError(msg);
                    }
                  }}
                >
                  Approve
                </button>
                <button
                  style={styles.reject}
                  onClick={async () => {
                    try {
                      await props.api.directorDecision(e.id, "rejected");
                      props.onNotify?.("Rejected.", "success");
                      await load();
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : "Reject failed";
                      props.onNotify?.(msg, "error");
                      setError(msg);
                    }
                  }}
                >
                  Reject
                </button>
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
  approve: {
    padding: "14px 12px",
    borderRadius: 14,
    border: "0",
    background: "#22c55e",
    color: "#06130b",
    fontWeight: 900,
    fontSize: 16
  },
  reject: {
    padding: "14px 12px",
    borderRadius: 14,
    border: "0",
    background: "#ef4444",
    color: "#220707",
    fontWeight: 900,
    fontSize: 16
  },
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
