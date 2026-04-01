import { useState } from "react";
import type { ApiClient } from "./App";

export function Login(props: {
  api: ApiClient;
  onLogin: (token: string, user: { id: string; email: string; tenantId: string; role: string }) => void;
  onNotify?: (message: string, kind?: "success" | "error" | "info") => void;
}) {
  const [email, setEmail] = useState("techsavvy826@gmail.com");
  const [password, setPassword] = useState("sales1234");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section style={styles.card}>
      <h1 style={styles.h1}>Quick login</h1>
      <p style={styles.p}>MVP demo credentials are pre-filled.</p>

      <label style={styles.label}>
        Email
        <input
          style={styles.input}
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
        />
      </label>
      <label style={styles.label}>
        Password
        <input
          style={styles.input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </label>

      {error ? <div style={styles.error}>{error}</div> : null}

      <button
        style={styles.primary}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const { token, user } = await props.api.login(email.trim(), password);
            props.onLogin(token, user);
            props.onNotify?.(`Signed in as ${user.email} (${user.role}).`, "success");
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Login failed";
            setError(msg);
            props.onNotify?.(msg, "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 16
  },
  h1: { margin: 0, fontSize: 20, letterSpacing: 0.2 },
  p: { margin: "8px 0 14px 0", color: "rgba(232,238,252,0.72)", fontSize: 14 },
  label: { display: "block", fontSize: 13, marginBottom: 10, color: "rgba(232,238,252,0.82)" },
  input: {
    width: "100%",
    marginTop: 6,
    padding: "14px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.12)",
    color: "#e8eefc",
    fontSize: 16
  },
  primary: {
    width: "100%",
    padding: "14px 14px",
    borderRadius: 14,
    border: "0",
    background: "#3b82f6",
    color: "#071022",
    fontWeight: 800,
    fontSize: 16
  },
  error: {
    margin: "10px 0",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,120,120,0.35)",
    background: "rgba(255,120,120,0.10)",
    color: "rgba(255,220,220,0.95)",
    fontSize: 13
  }
};
