import { useState } from "react";
import type { ApiClient, LoginResponse } from "./api";
import { cx } from "./utils";

export function Login(props: {
  api: ApiClient;
  onLogin: (resp: LoginResponse) => void;
  onNotify?: (message: string, kind?: "success" | "error" | "info") => void;
}) {
  const [email, setEmail] = useState("sales@invodtechltd.com");
  const [password, setPassword] = useState("sales1234");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h1 className="text-[18px] font-extrabold tracking-tight">Sign in</h1>
      <p className="mt-2 text-[14px] text-slate-600">
        Use your company email. Directors approve using email links.
      </p>

      <div className="mt-4 grid gap-3">
        <label className="grid gap-1 text-[13px] font-semibold text-slate-700">
          Email
          <input
            className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-[16px] ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
        </label>

        <label className="grid gap-1 text-[13px] font-semibold text-slate-700">
          Password
          <input
            className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-[16px] ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-900">
            {error}
          </div>
        ) : null}

        <button
          className={cx(
            "mt-1 rounded-2xl bg-gradient-to-r from-blue-600 to-teal-500 px-4 py-3 text-[16px] font-extrabold text-white shadow-sm active:opacity-90",
            busy ? "opacity-70" : ""
          )}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const resp = await props.api.login(email.trim(), password);
              props.onLogin(resp);
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Login failed";
              setError(msg);
              props.onNotify?.(msg, "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </div>
    </section>
  );
}

