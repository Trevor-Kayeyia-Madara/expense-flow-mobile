import { useEffect, useMemo, useState } from "react";
import type { ApiClient, CompanyMe } from "./api";
import { cx } from "./utils";

type User = { id: string; email: string; role: string; isActive: boolean };

export function CompanySettings(props: {
  api: ApiClient;
  onNotify?: (message: string, kind?: "success" | "error" | "info") => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState<CompanyMe | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [defaultDirectorId, setDefaultDirectorId] = useState<string>("");
  const [companyName, setCompanyName] = useState("");
  const [companyDomain, setCompanyDomain] = useState("");

  const directors = useMemo(() => users.filter((u) => u.role === "director" && u.isActive), [users]);
  const finance = useMemo(() => users.filter((u) => u.role === "finance" && u.isActive), [users]);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const [c, u] = await Promise.all([props.api.companyMe(), props.api.listUsers()]);
      setCompany(c);
      setCompanyName(c.name);
      setCompanyDomain(c.domain);
      setUsers(
        u.items.map((x) => ({
          id: x.id,
          email: x.email,
          role: x.role,
          isActive: x.isActive
        }))
      );
      setDefaultDirectorId(c.defaultDirectorId ?? "");
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
          <h1 className="text-[18px] font-extrabold tracking-tight">Company settings</h1>
          <button
            className="rounded-xl px-3 py-2 text-[13px] font-bold text-blue-700 hover:bg-blue-50 active:bg-blue-100 disabled:opacity-60"
            disabled={busy}
            onClick={() => void load()}
          >
            {busy ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-[13px] font-semibold text-slate-700">
            Company name
            <input
              className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-[16px] ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Company name"
              disabled={!company}
            />
          </label>
          <label className="grid gap-1 text-[13px] font-semibold text-slate-700">
            Company domain
            <input
              className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-[16px] ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
              value={companyDomain}
              onChange={(e) => setCompanyDomain(e.target.value)}
              placeholder="company.com"
              disabled={!company}
            />
          </label>

          <button
            className={cx(
              "rounded-2xl bg-slate-900 px-4 py-3 text-[15px] font-extrabold text-white shadow-sm active:opacity-90 disabled:opacity-60",
              busy ? "opacity-70" : ""
            )}
            disabled={busy || !company}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await props.api.updateCompanyMe({ name: companyName.trim(), domain: companyDomain.trim() });
                props.onNotify?.("Company updated.", "success");
                await load();
              } catch (e) {
                const msg = e instanceof Error ? e.message : "Update failed";
                setError(msg);
                props.onNotify?.(msg, "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            Save company
          </button>
        </div>
      </div>

      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="text-[14px] font-extrabold text-slate-900">Approval routing</div>
        <p className="mt-2 text-[13px] font-semibold text-slate-600">
          Choose which director receives approval emails for submitted expenses.
        </p>

        <div className="mt-3 grid gap-3">
          <label className="grid gap-1 text-[13px] font-semibold text-slate-700">
            Default director
            <select
              className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-[15px] font-semibold ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
              value={defaultDirectorId}
              onChange={(e) => setDefaultDirectorId(e.target.value)}
            >
              <option value="">(Auto-pick first director)</option>
              {directors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.email}
                </option>
              ))}
            </select>
          </label>

          <button
            className={cx(
              "rounded-2xl bg-gradient-to-r from-blue-600 to-teal-500 px-4 py-3 text-[15px] font-extrabold text-white shadow-sm active:opacity-90",
              busy ? "opacity-70" : ""
            )}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await props.api.updateCompanyMe({ defaultDirectorId: defaultDirectorId || null });
                props.onNotify?.("Saved.", "success");
                await load();
              } catch (e) {
                const msg = e instanceof Error ? e.message : "Save failed";
                setError(msg);
                props.onNotify?.(msg, "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            Save
          </button>

          {directors.length === 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-900">
              No directors found. Create a director user first in the Users tab.
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="text-[14px] font-extrabold text-slate-900">Finance recipients</div>
        <p className="mt-2 text-[13px] font-semibold text-slate-600">
          Finance users receive an email when a director approves an expense.
        </p>

        {finance.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-900">
            No finance users found. Create a finance user in the Users tab to receive emails.
          </div>
        ) : (
          <div className="mt-3 grid gap-2">
            {finance.map((f) => (
              <div key={f.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] font-semibold text-slate-800">
                {f.email}
              </div>
            ))}
          </div>
        )}
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-900">
          {error}
        </div>
      ) : null}
    </section>
  );
}
