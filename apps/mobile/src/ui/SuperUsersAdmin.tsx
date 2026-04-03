import { useEffect, useMemo, useState } from "react";
import type { ApiClient } from "./api";
import { cx } from "./utils";

type Company = { id: string; name: string; domain: string };

export function SuperUsersAdmin(props: {
  api: ApiClient;
  onNotify?: (message: string, kind?: "success" | "error" | "info") => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<
    Array<{ id: string; companyId: string; email: string; role: string; isActive: boolean; createdAt: string }>
  >([]);

  const [filterCompanyId, setFilterCompanyId] = useState("");

  const [companyId, setCompanyId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("sales");

  const companyMap = useMemo(() => {
    const m = new Map<string, Company>();
    for (const c of companies) m.set(c.id, c);
    return m;
  }, [companies]);

  const filtered = useMemo(() => {
    if (!filterCompanyId) return users;
    return users.filter((u) => u.companyId === filterCompanyId);
  }, [users, filterCompanyId]);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const [c, u] = await Promise.all([props.api.listCompanies(), props.api.listUsers()]);
      setCompanies(c.items.map((x) => ({ id: x.id, name: x.name, domain: x.domain })));
      setUsers(
        u.items.map((x) => ({
          id: x.id,
          companyId: x.companyId,
          email: x.email,
          role: x.role,
          isActive: x.isActive,
          createdAt: x.createdAt
        }))
      );
      if (!companyId && c.items.length) setCompanyId(c.items[0].id);
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
          <h1 className="text-[18px] font-extrabold tracking-tight">Platform users</h1>
          <button
            className="rounded-xl px-3 py-2 text-[13px] font-bold text-blue-700 hover:bg-blue-50 active:bg-blue-100 disabled:opacity-60"
            disabled={busy}
            onClick={() => void load()}
          >
            {busy ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="mt-3 grid gap-2">
          <label className="grid gap-1 text-[13px] font-semibold text-slate-700">
            Filter by company
            <select
              className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-[15px] font-semibold ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
              value={filterCompanyId}
              onChange={(e) => setFilterCompanyId(e.target.value)}
            >
              <option value="">All companies</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.domain})
                </option>
              ))}
            </select>
          </label>
          <div className="text-[13px] font-semibold text-slate-600">Total: {filtered.length}</div>
        </div>
      </div>

      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="text-[14px] font-extrabold text-slate-900">Create user</div>
        <div className="mt-3 grid gap-3">
          <label className="grid gap-1 text-[13px] font-semibold text-slate-700">
            Company
            <select
              className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-[15px] font-semibold ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              <option value="">Select company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.domain})
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[13px] font-semibold text-slate-700">
            Email
            <input
              className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-[16px] ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-[13px] font-semibold text-slate-700">
            Password
            <input
              className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-[16px] ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-[13px] font-semibold text-slate-700">
            Role
            <select
              className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-[15px] font-semibold ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="sales">Sales</option>
              <option value="director">Director</option>
              <option value="finance">Finance</option>
              <option value="company_admin">Company admin</option>
              <option value="super_admin">Super admin</option>
            </select>
          </label>

          <button
            className={cx(
              "rounded-2xl bg-gradient-to-r from-blue-600 to-teal-500 px-4 py-3 text-[15px] font-extrabold text-white shadow-sm active:opacity-90",
              busy ? "opacity-70" : ""
            )}
            disabled={busy || !companyId}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await props.api.createUser({ companyId, email: email.trim(), password, role });
                props.onNotify?.("User created.", "success");
                setEmail("");
                setPassword("");
                setRole("sales");
                await load();
              } catch (e) {
                const msg = e instanceof Error ? e.message : "Create failed";
                setError(msg);
                props.onNotify?.(msg, "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            Create
          </button>

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-900">
              {error}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3">
        {filtered.map((u) => {
          const c = companyMap.get(u.companyId);
          const companyLabel = c ? `${c.name} (${c.domain})` : u.companyId;
          return (
            <div key={u.id} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-extrabold text-slate-900">{u.email}</div>
                  <div className="mt-1 text-[13px] font-semibold text-slate-600">{companyLabel}</div>
                  <div className="mt-1 text-[12px] font-medium text-slate-400">
                    {u.isActive ? "Active" : "Disabled"} · {new Date(u.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[12px] font-bold text-slate-700">
                  {u.role}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

