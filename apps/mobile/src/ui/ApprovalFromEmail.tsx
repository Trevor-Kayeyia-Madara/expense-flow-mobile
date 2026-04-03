import { useEffect, useMemo, useState } from "react";
import type { ApiClient, ApprovalTokenView } from "./api";
import { cx, formatMoney } from "./utils";

function tokenFromHash() {
  // expected: "#/approval?token=..."
  const hash = window.location.hash || "";
  const qIndex = hash.indexOf("?");
  if (qIndex === -1) return "";
  const qs = hash.slice(qIndex + 1);
  const params = new URLSearchParams(qs);
  return params.get("token") ?? "";
}

function actionFromHash(): "approve" | "reject" | "" {
  const hash = window.location.hash || "";
  const qIndex = hash.indexOf("?");
  if (qIndex === -1) return "";
  const qs = hash.slice(qIndex + 1);
  const params = new URLSearchParams(qs);
  const a = (params.get("action") ?? "").toLowerCase();
  if (a === "approve") return "approve";
  if (a === "reject") return "reject";
  return "";
}

export function ApprovalFromEmail(props: {
  api: ApiClient;
  onNotify?: (message: string, kind?: "success" | "error" | "info") => void;
}) {
  const [token, setToken] = useState(() => tokenFromHash());
  const [action, setAction] = useState<"approve" | "reject" | "">(() => actionFromHash());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApprovalTokenView | null>(null);
  const [autoActionDone, setAutoActionDone] = useState(false);

  useEffect(() => {
    const onHash = () => {
      setToken(tokenFromHash());
      setAction(actionFromHash());
      setAutoActionDone(false);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const receiptUrl = useMemo(() => {
    if (!token) return "";
    return `${(import.meta.env.VITE_API_BASE_URL as string) ?? ""}/approval/receipt?token=${encodeURIComponent(token)}`;
  }, [token]);

  async function load() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const d = await props.api.approvalTokenView(token);
      setData(d);
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
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (!action) return;
    if (autoActionDone) return;

    // Auto-run if the email link was an "Approve" or "Reject" button.
    (async () => {
      setBusy(true);
      setError(null);
      try {
        if (action === "approve") {
          await props.api.approvalApprove(token);
          props.onNotify?.("Approved.", "success");
        } else {
          await props.api.approvalReject(token);
          props.onNotify?.("Rejected.", "success");
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : `${action} failed`;
        setError(msg);
        props.onNotify?.(msg, "error");
      } finally {
        setAutoActionDone(true);
        await load();
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, action, autoActionDone]);

  const expired = data ? new Date(data.expiresAt).getTime() < Date.now() : false;
  const used = !!data?.usedAt;
  const disabledActions = busy || expired || used || !token;

  return (
    <section className="grid gap-3">
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[18px] font-extrabold tracking-tight">Director approval</h1>
            <p className="mt-1 text-[13px] font-semibold text-slate-600">
              Opened from email link. No login required.
            </p>
          </div>
          <button
            className="shrink-0 rounded-xl px-3 py-2 text-[13px] font-bold text-blue-700 hover:bg-blue-50 active:bg-blue-100 disabled:opacity-60"
            disabled={busy || !token}
            onClick={() => void load()}
          >
            {busy ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {!token ? (
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="text-[14px] font-semibold text-slate-800">Missing token.</div>
          <p className="mt-2 text-[13px] text-slate-600">Open the approval email link again.</p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-900">
          {error}
        </div>
      ) : null}

      {data ? (
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-extrabold text-slate-900">{data.description}</div>
              <div className="mt-1 text-[13px] font-semibold text-slate-600">Submitted by: {data.submittedByEmail}</div>
              <div className="mt-1 text-[13px] font-semibold text-slate-600">Status: {data.status}</div>
              <div className="mt-1 text-[12px] font-semibold text-slate-500">
                Expires: {new Date(data.expiresAt).toLocaleString()}
              </div>
            </div>
            <div className="shrink-0 text-[16px] font-extrabold text-slate-900">
              {formatMoney(data.amountCents, data.currency)}
            </div>
          </div>

          {expired ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-900">
              This link is expired.
            </div>
          ) : null}
          {used ? (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] font-semibold text-slate-700">
              This link was already used.
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              className={cx(
                "rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-3 text-[15px] font-extrabold text-white shadow-sm active:opacity-90 disabled:opacity-60",
                busy ? "opacity-70" : ""
              )}
              disabled={disabledActions}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await props.api.approvalApprove(token);
                  props.onNotify?.("Approved.", "success");
                  await load();
                } catch (e) {
                  const msg = e instanceof Error ? e.message : "Approve failed";
                  setError(msg);
                  props.onNotify?.(msg, "error");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Approve
            </button>

            <button
              className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[15px] font-extrabold text-rose-900 shadow-sm active:opacity-90 disabled:opacity-60"
              disabled={disabledActions}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await props.api.approvalReject(token);
                  props.onNotify?.("Rejected.", "success");
                  await load();
                } catch (e) {
                  const msg = e instanceof Error ? e.message : "Reject failed";
                  setError(msg);
                  props.onNotify?.(msg, "error");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Reject
            </button>
          </div>

          <div className="mt-4">
            <div className="text-[13px] font-semibold text-slate-700">Receipt</div>
            <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {/* If there is no receipt, the API returns an error; browser will show broken image. That's ok for MVP. */}
              <img src={receiptUrl} alt="Receipt" className="w-full" />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
