import { useMemo, useRef, useState } from "react";
import type { ApiClient } from "./App";

type SubmitState = "idle" | "compressing" | "uploading" | "done";

export function ExpenseForm(props: {
  api: ApiClient;
  onCreated?: () => void;
  onNotify?: (message: string, kind?: "success" | "error" | "info") => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [directorEmail, setDirectorEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [autoEmailMsg, setAutoEmailMsg] = useState<string | null>(null);

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
    <section style={{ display: "grid", gap: 14 }}>
      <div style={styles.hero}>
        <h1 style={styles.h1}>New expense</h1>
        <p style={styles.p}>Receipt + amount + short description. Done in 15-30 seconds.</p>
      </div>

      <div style={styles.card}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            setLastId(null);
            setError(null);
            setReceipt(file);
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(file ? URL.createObjectURL(file) : null);
          }}
        />

        <button
          style={styles.bigButton}
          onClick={() => fileInputRef.current?.click()}
          disabled={state !== "idle"}
        >
          {receipt ? "Replace receipt photo" : "Capture receipt"}
        </button>

        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Receipt preview"
            style={{
              width: "100%",
              height: "auto",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.08)"
            }}
          />
        ) : (
          <div style={styles.previewPlaceholder}>No receipt yet</div>
        )}

        <label style={styles.label}>
          Amount
          <input
            style={styles.input}
            inputMode="decimal"
            placeholder="e.g. 12.50"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label style={styles.label}>
          Description
          <input
            style={styles.input}
            placeholder="e.g. Lunch with client"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        {error ? <div style={styles.error}>{error}</div> : null}
        {lastId ? (
          <div style={styles.success}>
            Submitted. ID: {lastId}
            <div style={{ height: 10 }} />
            {autoEmailMsg ? (
              <div style={{ marginTop: 0, ...styles.mutedBox }}>{autoEmailMsg}</div>
            ) : null}
            <div style={{ height: 10 }} />
            <label style={styles.label}>
              Director email (optional)
              <input
                style={styles.input}
                inputMode="email"
                placeholder="director@company.com"
                value={directorEmail}
                onChange={(e) => setDirectorEmail(e.target.value)}
              />
            </label>
            <button
              style={{
                ...styles.secondary,
                opacity: emailBusy ? 0.7 : 1
              }}
              disabled={emailBusy}
              onClick={async () => {
                if (!directorEmail.trim()) {
                  const msg = "Enter a director email, or use Share approval link.";
                  setEmailMsg(msg);
                  props.onNotify?.(msg, "info");
                  return;
                }
                setEmailBusy(true);
                setEmailMsg(null);
                try {
                  const res = await props.api.requestApprovalEmail(lastId, directorEmail.trim());
                  if (!res.emailed) {
                    await shareLink(res.approvalUrl);
                    const msg = res.reason
                      ? `Not emailed: ${res.reason}. Link copied/shared.`
                      : "Not emailed. Link copied/shared.";
                    setEmailMsg(msg);
                    props.onNotify?.(msg, "info");
                  } else {
                    const to = res.emailedTo ? ` to ${res.emailedTo}` : "";
                    const id = res.mailId ? ` (${res.mailId})` : "";
                    const msg = `Approval email queued${to}${id}.`;
                    setEmailMsg(msg);
                    props.onNotify?.(msg, "success");
                  }
                } catch (e) {
                  const msg = e instanceof Error ? e.message : "Failed to send email";
                  setEmailMsg(msg);
                  props.onNotify?.(msg, "error");
                } finally {
                  setEmailBusy(false);
                }
              }}
            >
              {emailBusy ? "Sending..." : "Send approval email"}
            </button>
            {emailMsg ? <div style={{ marginTop: 10, ...styles.mutedBox }}>{emailMsg}</div> : null}
            <div style={{ height: 10 }} />
            <button
              style={{
                ...styles.secondary,
                opacity: shareBusy ? 0.7 : 1
              }}
              disabled={shareBusy}
              onClick={async () => {
                setShareBusy(true);
                setShareMsg(null);
                try {
                  const res = await props.api.createApprovalLink(lastId);
                  await shareLink(res.approvalUrl);
                  const msg = "Approval link shared/copied.";
                  setShareMsg(msg);
                  props.onNotify?.(msg, "success");
                } catch (e) {
                  const msg = e instanceof Error ? e.message : "Failed to create link";
                  setShareMsg(msg);
                  props.onNotify?.(msg, "error");
                } finally {
                  setShareBusy(false);
                }
              }}
            >
              {shareBusy ? "Generating link..." : "Share approval link"}
            </button>
            {shareMsg ? <div style={{ marginTop: 10, ...styles.mutedBox }}>{shareMsg}</div> : null}
          </div>
        ) : null}

        <button
          style={{
            ...styles.primary,
            opacity: canSubmit ? 1 : 0.55
          }}
          disabled={!canSubmit}
          onClick={async () => {
            if (!receipt) return;
            setError(null);
            setLastId(null);
            setState("compressing");
            try {
              const compressed = await compressImage(receipt, {
                maxSidePx: 1600,
                jpegQuality: 0.78
              });
              setState("uploading");
              const res = await props.api.createExpense({
                amount: Number(amount),
                description: description.trim(),
                receipt: compressed
              });
              setLastId(res.id);
              setAmount("");
              setDescription("");
              setReceipt(null);
              setDirectorEmail("");
              setEmailMsg(null);
              setAutoEmailMsg("Sending to director...");
              if (previewUrl) URL.revokeObjectURL(previewUrl);
              setPreviewUrl(null);
              setState("done");
              setTimeout(() => setState("idle"), 800);

              try {
                const approval = await props.api.requestApprovalAuto(res.id);
                if (!approval.emailed) {
                  const msg = approval.reason
                    ? `Not emailed: ${approval.reason}. Use "Share approval link".`
                    : 'Not emailed. Use "Share approval link".';
                  setAutoEmailMsg(msg);
                  props.onNotify?.(msg, "info");
                } else {
                  const to = approval.emailedTo ? ` to ${approval.emailedTo}` : "";
                  const id = approval.mailId ? ` (${approval.mailId})` : "";
                  const msg = `Approval email queued${to}${id}.`;
                  setAutoEmailMsg(msg);
                  props.onNotify?.(msg, "success");
                }
              } catch (e) {
                const msg = e instanceof Error ? e.message : "Auto email failed";
                setAutoEmailMsg(msg);
                props.onNotify?.(msg, "error");
              }
              props.onCreated?.();
            } catch (e) {
              setState("idle");
              setError(e instanceof Error ? e.message : "Submission failed");
            }
          }}
        >
          {state === "compressing"
            ? "Optimizing photo..."
            : state === "uploading"
              ? "Submitting..."
              : "Submit expense"}
        </button>
      </div>

      <div style={styles.tip}>
        Tip: On iPhone/Android, add to Home Screen for app-like full-screen use (PWA).
      </div>
    </section>
  );
}

async function compressImage(
  file: File,
  opts: { maxSidePx: number; jpegQuality: number }
): Promise<File> {
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

const styles: Record<string, React.CSSProperties> = {
  hero: {
    padding: 12,
    borderRadius: 16,
    background: "linear-gradient(135deg, rgba(59,130,246,0.24), rgba(16,185,129,0.08))",
    border: "1px solid rgba(255,255,255,0.08)"
  },
  h1: { margin: 0, fontSize: 22, letterSpacing: 0.2 },
  p: { margin: "8px 0 0 0", color: "rgba(232,238,252,0.75)", fontSize: 14 },
  card: {
    display: "grid",
    gap: 12,
    padding: 16,
    borderRadius: 16,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)"
  },
  bigButton: {
    width: "100%",
    padding: "16px 14px",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.10)",
    color: "#e8eefc",
    fontWeight: 800,
    fontSize: 16
  },
  previewPlaceholder: {
    width: "100%",
    padding: "28px 12px",
    borderRadius: 14,
    border: "1px dashed rgba(255,255,255,0.18)",
    color: "rgba(232,238,252,0.55)",
    textAlign: "center"
  },
  label: {
    display: "block",
    fontSize: 13,
    color: "rgba(232,238,252,0.82)"
  },
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
    padding: "16px 14px",
    borderRadius: 16,
    border: "0",
    background: "#22c55e",
    color: "#06130b",
    fontWeight: 900,
    fontSize: 16
  },
  secondary: {
    width: "100%",
    padding: "14px 14px",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.10)",
    color: "#e8eefc",
    fontWeight: 900,
    fontSize: 15
  },
  error: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,120,120,0.35)",
    background: "rgba(255,120,120,0.10)",
    color: "rgba(255,220,220,0.95)",
    fontSize: 13
  },
  success: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(34,197,94,0.35)",
    background: "rgba(34,197,94,0.10)",
    color: "rgba(205,255,225,0.95)",
    fontSize: 13
  },
  mutedBox: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.10)",
    color: "rgba(232,238,252,0.8)",
    fontSize: 13
  },
  tip: {
    color: "rgba(232,238,252,0.65)",
    fontSize: 13,
    textAlign: "center"
  }
};

async function shareLink(url: string) {
  const nav = navigator as any;
  if (typeof nav.share === "function") {
    await nav.share({ title: "Expense approval", text: "Please approve/reject this expense", url });
    return;
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return;
  }
  // Fallback (older browsers)
  const ta = document.createElement("textarea");
  ta.value = url;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}
