import { useMemo, useState } from "react";
import { ExpenseForm } from "./ExpenseForm";
import { ExpensesList } from "./ExpensesList";
import { Login } from "./Login";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

function getToken(): string | null {
  return localStorage.getItem("expenseflow_token");
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => getToken());
  const api = useMemo(() => new ApiClient(API_BASE_URL, token), [token]);
  const [tab, setTab] = useState<"new" | "list">("new");

  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <div style={{ fontWeight: 800, letterSpacing: 0.2 }}>ExpenseFlow</div>
        {token ? <HeaderActions tab={tab} setTab={setTab} onLogout={() => {
          localStorage.removeItem("expenseflow_token");
          setToken(null);
        }} /> : null}
      </header>

      <main style={styles.main}>
        {!token ? (
          <Login
            api={api}
            onLogin={(newToken) => {
              localStorage.setItem("expenseflow_token", newToken);
              setToken(newToken);
            }}
          />
        ) : (
          <>
            {tab === "new" ? (
              <ExpenseForm
                api={api}
                onCreated={() => {
                  setTab("list");
                }}
              />
            ) : (
              <ExpensesList api={api} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string | null
  ) {}

  private headers(extra?: Record<string, string>) {
    const headers: Record<string, string> = { ...(extra ?? {}) };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    return headers;
  }

  async login(email: string, password: string) {
    const res = await fetch(`${this.baseUrl}/auth/login`, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as { token: string };
  }

  async createExpense(input: {
    amount: number;
    description: string;
    receipt: File;
    currency?: string;
  }) {
    const form = new FormData();
    form.set("amount", String(input.amount));
    form.set("description", input.description);
    if (input.currency) form.set("currency", input.currency);
    form.set("receipt", input.receipt);

    const res = await fetch(`${this.baseUrl}/expenses`, {
      method: "POST",
      headers: this.headers(),
      body: form
    });
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as { id: string; status: string };
  }

  async listExpenses() {
    const res = await fetch(`${this.baseUrl}/expenses`, {
      method: "GET",
      headers: this.headers()
    });
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as {
      items: Array<{
        id: string;
        amountCents: number;
        currency: string;
        description: string;
        status: string;
        createdAt: string;
        updatedAt: string;
      }>;
    };
  }

  async createApprovalLink(expenseId: string) {
    const res = await fetch(`${this.baseUrl}/expenses/${expenseId}/approval-link`, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({})
    });
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as { ok: true; approvalUrl: string; expiresAt: string };
  }
}

async function safeText(res: Response) {
  try {
    return await res.text();
  } catch {
    return `HTTP ${res.status}`;
  }
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: "100vh",
    background: "#0b1220",
    color: "#e8eefc",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial'
  },
  header: {
    position: "sticky",
    top: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    background: "rgba(11, 18, 32, 0.9)",
    backdropFilter: "blur(10px)",
    borderBottom: "1px solid rgba(255,255,255,0.06)"
  },
  main: {
    padding: "16px",
    maxWidth: 520,
    margin: "0 auto"
  },
  linkButton: {
    background: "transparent",
    border: "0",
    color: "#a9c1ff",
    fontSize: 14,
    padding: 8
  },
  pill: {
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "rgba(232,238,252,0.95)",
    borderRadius: 999,
    padding: "8px 10px",
    fontSize: 13
  }
};

export type { ApiClient };

function HeaderActions(props: {
  tab: "new" | "list";
  setTab: (t: "new" | "list") => void;
  onLogout: () => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <button
        style={{
          ...styles.pill,
          background: props.tab === "new" ? "rgba(59,130,246,0.26)" : "transparent"
        }}
        onClick={() => props.setTab("new")}
      >
        New
      </button>
      <button
        style={{
          ...styles.pill,
          background: props.tab === "list" ? "rgba(59,130,246,0.26)" : "transparent"
        }}
        onClick={() => props.setTab("list")}
      >
        My expenses
      </button>
      <button style={styles.linkButton} onClick={props.onLogout}>
        Log out
      </button>
    </div>
  );
}
