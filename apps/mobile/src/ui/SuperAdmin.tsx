import { useState } from "react";
import type { ApiClient } from "./api";
import { cx } from "./utils";
import { CompaniesAdmin } from "./CompaniesAdmin";
import { SuperUsersAdmin } from "./SuperUsersAdmin";

export function SuperAdmin(props: {
  api: ApiClient;
  onNotify?: (message: string, kind?: "success" | "error" | "info") => void;
}) {
  const [tab, setTab] = useState<"companies" | "users">("companies");

  return (
    <section className="grid gap-3">
      <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="grid grid-cols-2 gap-2">
          <button
            className={cx(
              "rounded-2xl border px-3 py-3 text-[13px] font-extrabold",
              tab === "companies"
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100"
            )}
            onClick={() => setTab("companies")}
          >
            Companies
          </button>
          <button
            className={cx(
              "rounded-2xl border px-3 py-3 text-[13px] font-extrabold",
              tab === "users"
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100"
            )}
            onClick={() => setTab("users")}
          >
            Users
          </button>
        </div>
      </div>

      {tab === "companies" ? <CompaniesAdmin api={props.api} onNotify={props.onNotify} /> : null}
      {tab === "users" ? <SuperUsersAdmin api={props.api} onNotify={props.onNotify} /> : null}
    </section>
  );
}

