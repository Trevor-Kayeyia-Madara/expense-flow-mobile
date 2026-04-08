import { useEffect, useMemo, useState } from "react";
import { ApiClient } from "./api";
import { cx } from "./utils";
import { Login } from "./Login";
import { ExpenseForm } from "./ExpenseForm";
import { ExpensesList } from "./ExpensesList";
import { FinanceQueue } from "./FinanceQueue";
import { ApprovalFromEmail } from "./ApprovalFromEmail";
import { CompanyAdmin } from "./CompanyAdmin";
import { SuperAdmin } from "./SuperAdmin";
import { Notifications } from "./Notifications";
import { ExpenseDetails } from "./ExpenseDetails";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

type Toast = { kind: "success" | "error" | "info"; message: string };

type Session = {
  token: string | null;
  refreshToken: string | null;
};

function loadSession(): Session {
  return {
    token: localStorage.getItem("expenseflow_token"),
    refreshToken: localStorage.getItem("expenseflow_refresh_token")
  };
}

function saveSession(token: string, refreshToken: string) {
  localStorage.setItem("expenseflow_token", token);
  localStorage.setItem("expenseflow_refresh_token", refreshToken);
}

function clearSession() {
  localStorage.removeItem("expenseflow_token");
  localStorage.removeItem("expenseflow_refresh_token");
}

export default function App() {
  const [session, setSession] = useState<Session>(() => loadSession());
  const [me, setMe] = useState<{ role: string; email: string; companyId: string } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [tab, setTab] = useState<"new" | "expenses" | "notifications">("new");
  const [hash, setHash] = useState(() => (typeof window !== "undefined" ? window.location.hash : ""));
  const [unreadCount, setUnreadCount] = useState(0);

  function notify(message: string, kind: Toast["kind"] = "info") {
    setToast({ kind, message });
    window.setTimeout(() => setToast(null), 6000);
  }

  const api = useMemo(() => {
    return new ApiClient(
      API_BASE_URL,
      () => session.token,
      () => session.refreshToken,
      (token, refreshToken) => {
        saveSession(token, refreshToken);
        setSession({ token, refreshToken });
      },
      () => {
        clearSession();
        setSession({ token: null, refreshToken: null });
        setMe(null);
      }
    );
  }, [session.token, session.refreshToken]);

  useEffect(() => {
    const onHash = () => setHash(window.location.hash || "");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!session.token) return;
    let cancelled = false;
    (async () => {
      try {
        const m = await api.me();
        if (cancelled) return;
        setMe({ role: m.role, email: m.email, companyId: m.companyId });
      } catch (e) {
        if (cancelled) return;
        notify(e instanceof Error ? e.message : "Session expired", "error");
        clearSession();
        setSession({ token: null, refreshToken: null });
        setMe(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token]);

  const role = me?.role ?? "";
  const showSalesTabs = role === "sales";
  const isApprovalLink = hash.startsWith("#/approval");
  const isNotifications = hash === "#/notifications" || hash.startsWith("#/notifications?");
  const isExpenseDetails = hash.startsWith("#/expense");
  const isHashScreen = isNotifications || isExpenseDetails;

  useEffect(() => {
    if (!session.token) return;
    if (isApprovalLink) return;

    let cancelled = false;
    const refresh = async () => {
      try {
        const r = await api.unreadNotificationsCount();
        if (cancelled) return;
        setUnreadCount(r.count);
      } catch {
        // ignore
      }
    };

    void refresh();
    const t = window.setInterval(refresh, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token, isApprovalLink]);

  const subtitle = isApprovalLink
    ? "Director approval link"
    : isNotifications
      ? "Notifications"
      : isExpenseDetails
        ? "Expense details"
        : me
          ? `${me.email} · ${me.role}`
          : "Multi-tenant expense approvals";

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-4 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)]">
          <div className="flex min-w-0 items-center gap-2">
            {session.token && isHashScreen && !isApprovalLink ? (
              <button
                className="shrink-0 rounded-xl px-3 py-2 text-[13px] font-bold text-slate-700 hover:bg-slate-100 active:bg-slate-200"
                onClick={() => {
                  window.location.hash = "";
                  setTab("expenses");
                }}
              >
                Back
              </button>
            ) : null}

            <div className="min-w-0">
              <div className="truncate text-[17px] font-extrabold tracking-tight">ExpenseFlow</div>
              <div className="truncate text-[12px] font-medium text-slate-500">{subtitle}</div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {session.token && !isApprovalLink && !showSalesTabs ? (
              <button
                className="relative rounded-xl px-3 py-2 text-[13px] font-bold text-blue-700 hover:bg-blue-50 active:bg-blue-100"
                onClick={() => {
                  window.location.hash = "#/notifications";
                }}
              >
                Notifications
                {unreadCount > 0 ? (
                  <span className="ml-2 inline-flex items-center rounded-full bg-blue-700 px-2 py-0.5 text-[11px] font-extrabold text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                ) : null}
              </button>
            ) : null}

            {session.token && !isApprovalLink ? (
              <button
                className="rounded-xl px-3 py-2 text-[13px] font-bold text-blue-700 hover:bg-blue-50 active:bg-blue-100"
                onClick={async () => {
                  try {
                    await api.logout();
                  } catch {
                    // ignore
                  }
                  notify("Signed out.", "success");
                }}
              >
                Log out
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <main className={cx("mx-auto max-w-xl px-4 pb-[calc(env(safe-area-inset-bottom)+96px)] pt-4")}>
        {toast ? <ToastView toast={toast} /> : null}

        {isApprovalLink ? <ApprovalFromEmail api={api} onNotify={notify} /> : null}

        {!isApprovalLink && !session.token ? (
          <Login
            api={api}
            onLogin={(resp) => {
              saveSession(resp.token, resp.refreshToken);
              setSession({ token: resp.token, refreshToken: resp.refreshToken });
              setMe({ role: resp.user.role, email: resp.user.email, companyId: resp.user.companyId });
              notify(`Signed in as ${resp.user.email} (${resp.user.role}).`, "success");
            }}
            onNotify={notify}
          />
        ) : !isApprovalLink && isNotifications ? (
          <Notifications api={api} onNotify={notify} onUnreadCountChange={(count) => setUnreadCount(count)} />
        ) : !isApprovalLink && isExpenseDetails ? (
          <ExpenseDetails api={api} onNotify={notify} />
        ) : !isApprovalLink && role === "sales" ? (
          tab === "new" ? (
            <ExpenseForm api={api} onNotify={notify} onSubmitted={() => setTab("expenses")} />
          ) : tab === "expenses" ? (
            <ExpensesList api={api} onNotify={notify} />
          ) : (
            <Notifications api={api} onNotify={notify} onUnreadCountChange={(count) => setUnreadCount(count)} />
          )
        ) : !isApprovalLink && role === "finance" ? (
          <FinanceQueue api={api} onNotify={notify} />
        ) : !isApprovalLink && role === "company_admin" ? (
          <CompanyAdmin api={api} onNotify={notify} />
        ) : !isApprovalLink && role === "super_admin" ? (
          <SuperAdmin api={api} onNotify={notify} />
        ) : !isApprovalLink && role === "director" ? (
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h1 className="text-[18px] font-extrabold tracking-tight">Director approvals</h1>
            <p className="mt-2 text-[14px] text-slate-600">
              Approvals are email-first. Check your inbox/spam for an "Approve expense" email, then tap Approve or Reject.
            </p>
          </div>
        ) : (
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h1 className="text-[18px] font-extrabold tracking-tight">Welcome</h1>
            <p className="mt-2 text-[14px] text-slate-600">Your role is not enabled in the PWA yet.</p>
          </div>
        )}
      </main>

      {session.token && showSalesTabs && !isHashScreen ? (
        <BottomNav tab={tab} setTab={setTab} unreadCount={unreadCount} />
      ) : null}
    </div>
  );
}

function ToastView(props: { toast: Toast }) {
  const style =
    props.toast.kind === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : props.toast.kind === "error"
        ? "border-rose-200 bg-rose-50 text-rose-900"
        : "border-blue-200 bg-blue-50 text-blue-900";
  return (
    <div className={cx("mb-3 rounded-2xl border px-3 py-2 text-[13px] font-semibold", style)}>{props.toast.message}</div>
  );
}

function BottomNav(props: {
  tab: "new" | "expenses" | "notifications";
  setTab: (t: "new" | "expenses" | "notifications") => void;
  unreadCount: number;
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto grid max-w-xl grid-cols-3 gap-3 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
        <TabButton active={props.tab === "new"} onClick={() => props.setTab("new")}>
          New
        </TabButton>
        <TabButton active={props.tab === "expenses"} onClick={() => props.setTab("expenses")}>
          Expenses
        </TabButton>
        <TabButton active={props.tab === "notifications"} onClick={() => props.setTab("notifications")} badge={props.unreadCount}>
          Alerts
        </TabButton>
      </div>
    </div>
  );
}

function TabButton(props: { active: boolean; onClick: () => void; children: string; badge?: number }) {
  const badgeText = props.badge && props.badge > 0 ? (props.badge > 99 ? "99+" : String(props.badge)) : "";
  return (
    <button
      className={cx(
        "relative rounded-2xl border px-3 py-3 text-[13px] font-extrabold",
        props.active
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100"
      )}
      onClick={props.onClick}
    >
      {props.children}
      {badgeText ? (
        <span className="absolute right-2 top-2 inline-flex items-center rounded-full bg-blue-700 px-2 py-0.5 text-[10px] font-extrabold text-white">
          {badgeText}
        </span>
      ) : null}
    </button>
  );
}

