import { useEffect, useState } from "react";
import type { ApiClient } from "./api";
import { cx } from "./utils";

export function CompaniesAdmin(props: {
  api: ApiClient;
  onNotify?: (message: string, kind?: "success" | "error" | "info") => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Array<{ id: string; name: string; domain: string; createdAt: string }>>([]);

  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");

  const [editCompanyId, setEditCompanyId] = useState("");
  const [editName, setEditName] = useState("");
  const [editDomain, setEditDomain] = useState("");

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const res = await props.api.listCompanies();
      setItems(res.items);
      if (!editCompanyId && res.items.length) {
        setEditCompanyId(res.items[0].id);
        setEditName(res.items[0].name);
        setEditDomain(res.items[0].domain);
      }
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
          <h1 className="text-[18px] font-extrabold tracking-tight">Companies</h1>
          <button
            className="rounded-xl px-3 py-2 text-[13px] font-bold text-blue-700 hover:bg-blue-50 active:bg-blue-100 disabled:opacity-60"
            disabled={busy}
            onClick={() => void load()}
          >
            {busy ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        <div className="mt-3 text-[13px] font-semibold text-slate-600">Total: {items.length}</div>
      </div>

      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="text-[14px] font-extrabold text-slate-900">Create company</div>
        <div className="mt-3 grid gap-3">
          <label className="grid gap-1 text-[13px] font-semibold text-slate-700">
            Name
            <input
              className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-[16px] ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-[13px] font-semibold text-slate-700">
            Domain
            <input
              className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-[16px] ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="company.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
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
                await props.api.createCompany({ name: name.trim(), domain: domain.trim() });
                props.onNotify?.("Company created.", "success");
                setName("");
                setDomain("");
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

      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="text-[14px] font-extrabold text-slate-900">Edit company</div>
        <div className="mt-3 grid gap-3">
          <label className="grid gap-1 text-[13px] font-semibold text-slate-700">
            Company
            <select
              className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-[15px] font-semibold ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
              value={editCompanyId}
              onChange={(e) => {
                const id = e.target.value;
                setEditCompanyId(id);
                const c = items.find((x) => x.id === id);
                setEditName(c?.name ?? "");
                setEditDomain(c?.domain ?? "");
              }}
              disabled={busy || items.length === 0}
            >
              {items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.domain})
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[13px] font-semibold text-slate-700">
            Name
            <input
              className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-[16px] ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              disabled={!editCompanyId}
            />
          </label>
          <label className="grid gap-1 text-[13px] font-semibold text-slate-700">
            Domain
            <input
              className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-[16px] ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="company.com"
              value={editDomain}
              onChange={(e) => setEditDomain(e.target.value)}
              disabled={!editCompanyId}
            />
          </label>

          <button
            className={cx(
              "rounded-2xl bg-slate-900 px-4 py-3 text-[15px] font-extrabold text-white shadow-sm active:opacity-90 disabled:opacity-60",
              busy ? "opacity-70" : ""
            )}
            disabled={busy || !editCompanyId}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await props.api.updateCompany(editCompanyId, { name: editName.trim(), domain: editDomain.trim() });
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
            Save changes
          </button>

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-900">
              {error}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3">
        {items.map((c) => (
          <div key={c.id} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-[15px] font-extrabold text-slate-900">{c.name}</div>
            <div className="mt-1 text-[13px] font-semibold text-slate-600">{c.domain}</div>
            <div className="mt-2 truncate text-[12px] font-medium text-slate-400">ID: {c.id}</div>
            <div className="mt-1 text-[12px] font-medium text-slate-400">
              {new Date(c.createdAt).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
