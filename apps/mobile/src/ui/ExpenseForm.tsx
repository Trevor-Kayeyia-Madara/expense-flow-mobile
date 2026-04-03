import { useMemo, useRef, useState } from "react";
import type { ApiClient } from "./api";
import { cx } from "./utils";

type SubmitState = "idle" | "compressing" | "creating" | "submitting";

export function ExpenseForm(props: {
  api: ApiClient;
  onSubmitted?: () => void;
  onNotify?: (message: string, kind?: "success" | "error" | "info") => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("KES");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    expenseId: string;
    directorEmail: string;
    emailed: boolean;
    mailProvider?: string;
    mailId?: string;
  } | null>(null);

  const canSubmit = useMemo(() => {
    const amt = Number(amount);
    return (
      state === "idle" &&
      Number.isFinite(amt) &&
      amt > 0 &&
      description.trim().length >= 2 &&
      !!receipt
    );
  }, [amount, description, receipt, state]);

  return (
    <section className="grid gap-3">
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-[18px] font-extrabold tracking-tight">New expense</h1>
        <p className="mt-2 text-[14px] text-slate-600">Photo + amount + category + short description.</p>
      </div>

      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            setResult(null);
            setError(null);
            setReceipt(file);
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(file ? URL.createObjectURL(file) : null);
          }}
        />

        <button
          className={cx(
            "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] font-extrabold text-slate-800 shadow-sm hover:bg-slate-50 active:bg-slate-100",
            state !== "idle" ? "opacity-70" : ""
          )}
          onClick={() => fileInputRef.current?.click()}
          disabled={state !== "idle"}
        >
          {receipt ? "Replace receipt photo" : "Capture receipt"}
        </button>

        <div className="mt-3">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Receipt preview"
              className="h-auto w-full rounded-2xl border border-slate-200 object-cover"
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-8 text-center text-[13px] font-semibold text-slate-500">
              No receipt yet
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-[13px] font-semibold text-slate-700">
            Amount
            <input
              className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-[16px] ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
              inputMode="decimal"
              placeholder="e.g. 2000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-[13px] font-semibold text-slate-700">
              Currency
              <input
                className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-[16px] uppercase ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
              />
            </label>

            <label className="grid gap-1 text-[13px] font-semibold text-slate-700">
              Category
              <input
                className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-[16px] ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Transport"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </label>
          </div>

          <label className="grid gap-1 text-[13px] font-semibold text-slate-700">
            Description
            <input
              className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-[16px] ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Uber to client meeting"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-900">
              {error}
            </div>
          ) : null}

          {result ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-900">
              <div>
                Submitted. Sent to director: <span className="font-extrabold">{result.directorEmail}</span>.
              </div>
              <div className="mt-1 text-emerald-900/90">
                {result.emailed
                  ? `Email queued${result.mailProvider ? ` (${result.mailProvider})` : ""}${
                      result.mailId ? `, id ${result.mailId}` : ""
                    }.`
                  : "Email not sent (mail not configured or send failed)."}
              </div>
              <div className="mt-1 text-[12px] font-medium text-emerald-900/70">
                Expense ID: {result.expenseId}
              </div>
            </div>
          ) : null}

          <button
            className={cx(
              "w-full rounded-2xl px-4 py-3 text-[16px] font-extrabold shadow-sm active:opacity-90",
              canSubmit
                ? "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white"
                : "border border-slate-200 bg-white text-slate-400"
            )}
            disabled={!canSubmit}
            onClick={async () => {
              if (!receipt) return;
              setError(null);
              setResult(null);

              try {
                setState("compressing");
                const optimized = await compressImage(receipt, { maxSidePx: 1600, jpegQuality: 0.78 });

                setState("creating");
                const created = await props.api.createExpense({
                  amount: Number(amount),
                  currency: currency.trim() || undefined,
                  category: category.trim() || undefined,
                  description: description.trim(),
                  receipt: optimized
                });

                setState("submitting");
                const submitted = await props.api.submitExpense(created.id);

                setResult({
                  expenseId: created.id,
                  directorEmail: submitted.directorEmail,
                  emailed: submitted.emailed,
                  mailProvider: submitted.mailProvider,
                  mailId: submitted.mailId
                });

                props.onNotify?.("Expense submitted.", "success");
                props.onSubmitted?.();
              } catch (e) {
                const msg = e instanceof Error ? e.message : "Submission failed";
                setError(msg);
                props.onNotify?.(msg, "error");
              } finally {
                setState("idle");
              }
            }}
          >
            {state === "compressing"
              ? "Optimizing..."
              : state === "creating"
                ? "Saving..."
                : state === "submitting"
                  ? "Submitting..."
                  : "Submit"}
          </button>
        </div>
      </div>
    </section>
  );
}

async function compressImage(file: File, opts: { maxSidePx: number; jpegQuality: number }): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, opts.maxSidePx / Math.max(bitmap.width, bitmap.height));
  const targetW = Math.max(1, Math.round(bitmap.width * scale));
  const targetH = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Image compression failed"))),
      "image/jpeg",
      opts.jpegQuality
    );
  });

  const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
}

