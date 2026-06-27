import { useEffect, useRef, useState } from "react";
import { useWebSocket } from "../hooks/useWebSocket";
import { WallClockChart } from "../components/WallClockChart";

const STAGING_URL =
  "http://api.lvh.me:3010/api/v3/airwallex/v1/txn_notification";

const DECLINE_REASONS = [
  "LOW_ACCOUNT_BALANCE",
  "SUSPICIOUS_ACTIVITY",
  "CARD_EXPIRED",
  "TRANSACTION_AMOUNT_EXCEEDS_LIMIT",
  "INVALID_PIN",
  "DUPLICATE_TRANSACTION",
];

function parseHeaders(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const idx = line.indexOf(":");
    if (idx < 1) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}
function parseList(text) {
  return text
    .split(/[\n,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

// ── shared UI ──────────────────────────────────────────────────────────────────

function Field({ label, tip, children }) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          marginBottom: 4,
        }}
      >
        <span className="label">{label}</span>
        {tip && <InfoTip text={tip} />}
      </div>
      {children}
    </div>
  );
}

function InfoTip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative" }}>
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: "1px solid var(--border-strong)",
          color: "var(--text-muted)",
          fontSize: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          cursor: "default",
          fontFamily: "JetBrains Mono, monospace",
        }}
        tabIndex={-1}
      >
        i
      </button>
      {show && (
        <div
          style={{
            position: "absolute",
            zIndex: 50,
            left: 20,
            top: 0,
            width: 260,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-strong)",
            color: "var(--text-secondary)",
            fontSize: 11,
            padding: "10px 12px",
            fontFamily: "JetBrains Mono, monospace",
            lineHeight: 1.6,
            boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
          }}
        >
          {text}
        </div>
      )}
    </span>
  );
}

function SegControl({ options, value, onChange, disabled }) {
  return (
    <div
      style={{
        display: "flex",
        border: "1px solid var(--border-strong)",
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            flex: 1,
            padding: "7px 4px",
            fontSize: 11,
            fontFamily: "JetBrains Mono, monospace",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            borderRight: "1px solid var(--border-strong)",
            background: value === opt.value ? "var(--accent)" : "transparent",
            color: value === opt.value ? "#fff" : "var(--text-muted)",
            transition: "all 0.12s",
            cursor: "pointer",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function StatNum({ label, value, sub, flash, danger }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        padding: "12px 14px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div className="label">{label}</div>
      <div
        key={value}
        className={flash ? "stat-flash" : ""}
        style={{
          fontSize: 26,
          fontFamily: "JetBrains Mono, monospace",
          fontWeight: 700,
          color: danger ? "var(--danger)" : "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.2,
        }}
      >
        {value ?? "—"}
      </div>
      {sub && (
        <div
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            marginTop: 2,
            fontFamily: "JetBrains Mono, monospace",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontFamily: "JetBrains Mono, monospace",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        color: "var(--text-muted)",
        borderBottom: "1px solid var(--border-subtle)",
        paddingBottom: 8,
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

// ── Step result viewer ─────────────────────────────────────────────────────────

function StepResult({ result, label }) {
  const [showPayload, setShowPayload] = useState(false);
  if (!result) return null;
  const ok = result.ok;
  return (
    <div
      style={{
        border: `1px solid ${ok ? "var(--ok)" : "var(--danger)"}`,
        background: ok ? "var(--ok-dim)" : "var(--danger-dim)",
        marginTop: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 12,
          fontWeight: 700,
          color: ok ? "var(--ok)" : "var(--danger)",
        }}
      >
        <span>
          {ok ? "✓" : "✗"} {label} — HTTP {result.status || "ERR"}
        </span>
        <span
          style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 4 }}
        >
          {result.latency_ms}ms
        </span>
        <button
          onClick={() => setShowPayload((v) => !v)}
          style={{
            marginLeft: "auto",
            fontSize: 10,
            color: "var(--text-muted)",
            background: "transparent",
            border: "1px solid var(--border-subtle)",
            padding: "2px 7px",
            cursor: "pointer",
            fontFamily: "JetBrains Mono, monospace",
          }}
        >
          {showPayload ? "HIDE" : "INSPECT"}
        </button>
      </div>
      {showPayload && (
        <div
          style={{
            borderTop: "1px solid var(--border-subtle)",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            background: "var(--bg-surface)",
          }}
        >
          <div>
            <div className="label" style={{ marginBottom: 4 }}>
              RESPONSE
            </div>
            <pre
              style={{
                background: "var(--bg-surface-2)",
                border: "1px solid var(--border-subtle)",
                padding: 8,
                fontSize: 11,
                fontFamily: "JetBrains Mono, monospace",
                color: "var(--text-secondary)",
                overflow: "auto",
                maxHeight: 160,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                margin: 0,
              }}
            >
              {typeof result.response === "string"
                ? result.response
                : JSON.stringify(result.response, null, 2)}
            </pre>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 4 }}>
              PAYLOAD SENT
            </div>
            <pre
              style={{
                background: "var(--bg-surface-2)",
                border: "1px solid var(--border-subtle)",
                padding: 8,
                fontSize: 11,
                fontFamily: "JetBrains Mono, monospace",
                color: "var(--text-secondary)",
                overflow: "auto",
                maxHeight: 240,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                margin: 0,
              }}
            >
              {JSON.stringify(result.payload, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Merchant fields component ──────────────────────────────────────────────────

function MerchantFields({ merchant, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const hasOverride = Object.values(merchant).some(Boolean);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "transparent",
          border: "1px solid var(--border-subtle)",
          color: hasOverride ? "var(--info)" : "var(--text-muted)",
          fontSize: 11,
          fontFamily: "JetBrains Mono, monospace",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          padding: "5px 10px",
          cursor: disabled ? "default" : "pointer",
          width: "100%",
          justifyContent: "space-between",
        }}
      >
        <span>Merchant / MCC{hasOverride ? " ·  custom" : " · default"}</span>
        <span style={{ fontSize: 10 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div
          style={{
            border: "1px solid var(--border-subtle)",
            borderTop: "none",
            padding: 12,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            background: "var(--bg-surface-2)",
          }}
        >
          <Field label="MERCHANT NAME">
            <input
              className="input"
              value={merchant.name}
              onChange={(e) => onChange({ ...merchant, name: e.target.value })}
              placeholder="SHERWIN-WILLIAMS721164"
              spellCheck={false}
              disabled={disabled}
            />
          </Field>
          <Field label="MERCHANT ID">
            <input
              className="input"
              value={merchant.id}
              onChange={(e) => onChange({ ...merchant, id: e.target.value })}
              placeholder="479338004883977"
              spellCheck={false}
              disabled={disabled}
            />
          </Field>
          <Field label="CITY">
            <input
              className="input"
              value={merchant.city}
              onChange={(e) => onChange({ ...merchant, city: e.target.value })}
              placeholder="Franklin"
              spellCheck={false}
              disabled={disabled}
            />
          </Field>
          <Field label="COUNTRY">
            <input
              className="input"
              value={merchant.country}
              onChange={(e) => onChange({ ...merchant, country: e.target.value })}
              placeholder="USA"
              spellCheck={false}
              disabled={disabled}
            />
          </Field>
          <Field label="MCC" tip="4-digit Merchant Category Code e.g. 5411 = Groceries, 7011 = Hotels, 4111 = Transit">
            <input
              className="input"
              value={merchant.category_code}
              onChange={(e) => onChange({ ...merchant, category_code: e.target.value })}
              placeholder="8661"
              maxLength={4}
              spellCheck={false}
              disabled={disabled}
            />
          </Field>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              type="button"
              onClick={() => onChange({ name: "", id: "", city: "", country: "", category_code: "" })}
              disabled={disabled || !hasOverride}
              className="btn btn-ghost"
              style={{ width: "100%", fontSize: 10, opacity: hasOverride ? 1 : 0.4 }}
            >
              CLEAR
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const EMPTY_MERCHANT = { name: "", id: "", city: "", country: "", category_code: "" };

function merchantToRequestFields(m) {
  return {
    merchant_name: m.name,
    merchant_id: m.id,
    merchant_city: m.city,
    merchant_country: m.country,
    merchant_category_code: m.category_code,
  };
}

// ── Lifecycle flow panel ────────────────────────────────────────────────────────

function LifecyclePanel({ url, headers }) {
  const [cardId, setCardId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState(100);
  const [currency, setCurrency] = useState("USD");
  const [merchant, setMerchant] = useState(EMPTY_MERCHANT);
  const [declineReason, setDeclineReason] = useState("LOW_ACCOUNT_BALANCE");
  // AUTO = send Stage 2 automatically after Stage 1; MANUAL = user picks when/what to send
  const [stage2Mode, setStage2Mode] = useState("auto"); // "auto" | "manual"
  // For auto mode, pre-select what Stage 2 will send
  const [autoOutcome, setAutoOutcome] = useState("success"); // "success" | "declined"

  const [authResult, setAuthResult] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [lifecycle, setLifecycle] = useState(null);

  const [resultLoading, setResultLoading] = useState(false);
  const [resultStep, setResultStep] = useState(null);
  const [authResultData, setAuthResultData] = useState(null);

  const [clearingLoading, setClearingLoading] = useState(false);
  const [clearingResult, setClearingResult] = useState(null);

  const [refundAmount, setRefundAmount] = useState("");
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundResult, setRefundResult] = useState(null);

  const [reversalLoading, setReversalLoading] = useState(false);
  const [reversalResult, setReversalResult] = useState(null);

  const reset = () => {
    setAuthResult(null);
    setLifecycle(null);
    setAuthResultData(null);
    setClearingResult(null);
    setResultStep(null);
    setRefundResult(null);
    setRefundAmount("");
    setReversalResult(null);
  };

  const sendStep = async (step, lc) => {
    const body = {
      url,
      headers,
      step,
      card_id: cardId,
      account_id: accountId,
      amount,
      currency,
      lifecycle_id: lc?.lifecycle_id ?? "",
      transaction_id: lc?.transaction_id ?? "",
      auth_code: lc?.auth_code ?? "",
      decline_reason: declineReason,
      ...merchantToRequestFields(merchant),
    };
    const r = await fetch("/api/airwallex/single-step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.json();
  };

  // Inspect Stage 1 response body and infer whether Volopay approved or declined
  const inferOutcome = (response) => {
    const text = JSON.stringify(response ?? "").toLowerCase();
    if (
      /declined|decline|block|blocked|deny|denied|rejected|reject|not_allowed|not allowed/.test(
        text
      )
    ) {
      return "declined";
    }
    if (/approved|allow|allowed|success|authorized|accept/.test(text)) {
      return "success";
    }
    return null; // ambiguous
  };

  const handleAuth = async () => {
    if (!url || !cardId) return;
    setAuthLoading(true);
    reset();
    try {
      const data = await sendStep("authorization", null);
      setAuthResult(data);
      const lc = data.meta?.lifecycle_id ? data.meta : null;
      if (lc) {
        setLifecycle(lc);
        if (stage2Mode === "auto") {
          // Derive outcome from Stage 1 response; fall back to autoOutcome if ambiguous
          const inferred = inferOutcome(data.response);
          const step2 =
            inferred ?? (autoOutcome === "success" ? "success" : "declined");
          setResultStep(step2);
          setResultLoading(true);
          try {
            const data2 = await sendStep(step2, lc);
            setAuthResultData(data2);
          } finally {
            setResultLoading(false);
          }
        }
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAuthResult = async (step) => {
    setResultLoading(true);
    setResultStep(step);
    setAuthResultData(null);
    try {
      const data = await sendStep(step, lifecycle);
      setAuthResultData(data);
    } finally {
      setResultLoading(false);
    }
  };

  const handleClearing = async () => {
    setClearingLoading(true);
    setClearingResult(null);
    try {
      const data = await sendStep("clearing", lifecycle);
      setClearingResult(data);
    } finally {
      setClearingLoading(false);
    }
  };

  const handleRefund = async () => {
    setRefundLoading(true);
    setRefundResult(null);
    try {
      const body = {
        url,
        headers,
        step: "refund",
        card_id: cardId,
        account_id: accountId,
        amount: refundAmount !== "" ? Number(refundAmount) : amount,
        currency,
        lifecycle_id: lifecycle?.lifecycle_id ?? "",
        transaction_id: lifecycle?.transaction_id ?? "",
        ...merchantToRequestFields(merchant),
      };
      const r = await fetch("/api/airwallex/single-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setRefundResult(await r.json());
    } finally {
      setRefundLoading(false);
    }
  };

  const handleReversal = async () => {
    setReversalLoading(true);
    setReversalResult(null);
    try {
      const data = await sendStep("reversal", lifecycle);
      setReversalResult(data);
    } finally {
      setReversalLoading(false);
    }
  };

  const hasAuth = !!lifecycle;
  const hasResult = !!authResultData;
  const succeeded = resultStep === "success";
  const hasClearing = !!clearingResult?.ok;
  const busy = authLoading || resultLoading || clearingLoading || refundLoading || reversalLoading;

  const PS = {
    background: "var(--bg-surface)",
    border: "1px solid var(--border-subtle)",
    padding: 16,
  };
  const stageLabel = (n, label, done) => (
    <div
      style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}
    >
      <span
        style={{
          fontSize: 10,
          fontFamily: "JetBrains Mono, monospace",
          fontWeight: 700,
          color: "var(--text-muted)",
          background: "var(--bg-surface-2)",
          border: "1px solid var(--border-subtle)",
          padding: "1px 6px",
        }}
      >
        {n}
      </span>
      <span
        style={{
          fontSize: 11,
          fontFamily: "JetBrains Mono, monospace",
          fontWeight: 700,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}
      >
        {label}
      </span>
      {done && (
        <span
          style={{
            fontSize: 10,
            background:
              done === "ok"
                ? "var(--ok-dim)"
                : done === "fail"
                ? "var(--danger-dim)"
                : "var(--info-dim)",
            color:
              done === "ok"
                ? "var(--ok)"
                : done === "fail"
                ? "var(--danger)"
                : "var(--info)",
            padding: "1px 6px",
            fontFamily: "JetBrains Mono, monospace",
            fontWeight: 700,
          }}
        >
          {done === "ok" ? "✓ SENT" : done === "fail" ? "✗ ERROR" : done}
        </span>
      )}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Params + Stage 2 mode */}
      <div style={PS}>
        <SectionTitle>Single Transaction — Lifecycle</SectionTitle>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            marginBottom: 12,
          }}
        >
          <Field label="CARD ID">
            <input
              className="input"
              value={cardId}
              onChange={(e) => setCardId(e.target.value)}
              placeholder="c0c40b8c-456d-4eb4-…"
              spellCheck={false}
              disabled={busy}
            />
          </Field>
          <Field label="ACCOUNT ID">
            <input
              className="input"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="acct_FeP32PtROAW5G…"
              spellCheck={false}
              disabled={busy}
            />
          </Field>
          <Field label="AMOUNT">
            <input
              type="number"
              className="input"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              min={1}
              step={0.01}
              disabled={busy}
            />
          </Field>
          <Field label="CURRENCY">
            <SegControl
              value={currency}
              onChange={setCurrency}
              disabled={busy}
              options={[
                { value: "USD", label: "USD" },
                { value: "SGD", label: "SGD" },
                { value: "INR", label: "INR" },
              ]}
            />
          </Field>
        </div>

        <MerchantFields merchant={merchant} onChange={setMerchant} disabled={busy} />

        <div style={{ marginTop: 12 }} />
        <Field
          label="STAGE 2 MODE"
          tip="AUTO: sends Stage 2 immediately after Stage 1, outcome inferred from Stage 1 response. MANUAL: you choose when and what to send."
        >
          <SegControl
            value={stage2Mode}
            onChange={setStage2Mode}
            disabled={busy || hasAuth}
            options={[
              { value: "auto", label: "AUTO" },
              { value: "manual", label: "MANUAL" },
            ]}
          />
        </Field>

        {stage2Mode === "auto" && (
          <div
            style={{
              marginTop: 10,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontFamily: "JetBrains Mono, monospace",
                color: "var(--info)",
                background: "var(--info-dim)",
                border: "1px solid var(--info)",
                padding: "6px 10px",
                lineHeight: 1.6,
              }}
            >
              Stage 2 outcome is inferred from Stage 1 response body
              (approved/declined keywords). Fallback if ambiguous:
            </div>
            <Field
              label="FALLBACK OUTCOME"
              tip="Used only when Stage 1 response doesn't clearly indicate approve or decline."
            >
              <SegControl
                value={autoOutcome}
                onChange={setAutoOutcome}
                disabled={busy || hasAuth}
                options={[
                  { value: "success", label: "SUCCESS" },
                  { value: "declined", label: "DECLINED" },
                ]}
              />
            </Field>
            <Field
              label="DECLINE REASON"
              tip="Used if outcome resolves to declined."
            >
              <select
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                className="input"
                disabled={busy || hasAuth}
                style={{
                  fontSize: 11,
                  fontFamily: "JetBrains Mono, monospace",
                }}
              >
                {DECLINE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </div>

      {/* Stage 1 */}
      <div style={PS}>
        {stageLabel(
          "01",
          "Authorization",
          hasAuth ? (authResult?.ok ? "ok" : "fail") : null
        )}
        <div
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            fontFamily: "JetBrains Mono, monospace",
            marginBottom: 10,
          }}
        >
          POST · transaction_type: AUTHORIZATION
          {stage2Mode === "auto" && !hasAuth && (
            <span style={{ marginLeft: 8, color: "var(--info)" }}>
              → Stage 2 outcome inferred from response
            </span>
          )}
        </div>
        {hasAuth && lifecycle && (
          <div
            style={{
              background: "var(--bg-surface-2)",
              border: "1px solid var(--border-subtle)",
              padding: "6px 10px",
              fontSize: 11,
              fontFamily: "JetBrains Mono, monospace",
              color: "var(--text-secondary)",
              marginBottom: 8,
              wordBreak: "break-all",
            }}
          >
            <span style={{ color: "var(--text-muted)" }}>lifecycle_id: </span>
            <span style={{ color: "var(--info)" }}>
              {lifecycle.lifecycle_id}
            </span>
          </div>
        )}
        <button
          onClick={hasAuth ? reset : handleAuth}
          disabled={!url || !cardId || busy}
          className={`btn ${hasAuth ? "btn-ghost" : "btn-primary"}`}
          style={{ width: "100%", opacity: !url || !cardId || busy ? 0.4 : 1 }}
        >
          {authLoading
            ? stage2Mode === "auto"
              ? `SENDING AUTH + ${autoOutcome.toUpperCase()}…`
              : "SENDING…"
            : hasAuth
            ? "RESET / NEW TRANSACTION"
            : "SEND AUTHORIZATION"}
        </button>
        <StepResult result={authResult} label="AUTHORIZATION" />
      </div>

      {/* Stage 2 */}
      <div
        style={{
          ...PS,
          opacity: hasAuth ? 1 : 0.4,
          pointerEvents: hasAuth ? "auto" : "none",
        }}
      >
        {stageLabel(
          "02",
          "Auth Result",
          hasResult
            ? authResultData?.ok
              ? succeeded
                ? "issuing.transaction.succeeded"
                : "issuing.transaction.failed"
              : "fail"
            : null
        )}
        <div
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            fontFamily: "JetBrains Mono, monospace",
            marginBottom: 10,
          }}
        >
          issuing.transaction.succeeded / failed — creates or declines expense
        </div>

        {stage2Mode === "auto" && hasResult && (
          <div
            style={{
              fontSize: 11,
              fontFamily: "JetBrains Mono, monospace",
              color: "var(--text-muted)",
              marginBottom: 8,
              padding: "6px 10px",
              background: "var(--bg-surface-2)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            Inferred from Stage 1 response → auto-sent as{" "}
            <strong
              style={{ color: succeeded ? "var(--ok)" : "var(--danger)" }}
            >
              {succeeded
                ? "issuing.transaction.succeeded"
                : "issuing.transaction.failed"}
            </strong>
          </div>
        )}

        {stage2Mode === "manual" && !hasResult && (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => handleAuthResult("success")}
              disabled={resultLoading}
              className="btn btn-primary"
              style={{ flex: 1, opacity: resultLoading ? 0.4 : 1 }}
            >
              {resultLoading && resultStep === "success"
                ? "SENDING…"
                : "SEND SUCCESS"}
            </button>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                flex: 1,
              }}
            >
              <select
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                className="input"
                style={{
                  fontSize: 11,
                  fontFamily: "JetBrains Mono, monospace",
                }}
              >
                {DECLINE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleAuthResult("declined")}
                disabled={resultLoading}
                className="btn btn-danger"
                style={{ opacity: resultLoading ? 0.4 : 1 }}
              >
                {resultLoading && resultStep === "declined"
                  ? "SENDING…"
                  : "SEND DECLINED"}
              </button>
            </div>
          </div>
        )}

        {resultLoading && (
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              fontFamily: "JetBrains Mono, monospace",
              marginTop: 8,
            }}
          >
            SENDING {resultStep?.toUpperCase()}…
          </div>
        )}
        <StepResult
          result={authResultData}
          label={
            resultStep === "success"
              ? "issuing.transaction.succeeded"
              : "issuing.transaction.failed"
          }
        />
      </div>

      {/* Stage 3 — Clearing */}
      <div
        style={{
          ...PS,
          opacity: hasResult && succeeded ? 1 : 0.4,
          pointerEvents: hasResult && succeeded ? "auto" : "none",
        }}
      >
        {stageLabel(
          "03",
          "Clearing",
          clearingResult ? (clearingResult.ok ? "ok" : "fail") : null
        )}
        <div
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            fontFamily: "JetBrains Mono, monospace",
            marginBottom: 10,
          }}
        >
          issuing.transaction.succeeded · transaction_type: CLEARING — settles
          the expense
        </div>
        {!clearingResult && (
          <button
            onClick={handleClearing}
            disabled={clearingLoading}
            className="btn btn-primary"
            style={{ width: "100%", opacity: clearingLoading ? 0.4 : 1 }}
          >
            {clearingLoading ? "SENDING…" : "SEND CLEARING"}
          </button>
        )}
        <StepResult result={clearingResult} label="CLEARING" />
      </div>

      {/* Stage 4 — Refund */}
      <div
        style={{
          ...PS,
          opacity: hasClearing ? 1 : 0.4,
          pointerEvents: hasClearing ? "auto" : "none",
        }}
      >
        {stageLabel(
          "04",
          "Refund",
          refundResult ? (refundResult.ok ? "ok" : "fail") : null
        )}
        <div
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            fontFamily: "JetBrains Mono, monospace",
            marginBottom: 10,
          }}
        >
          issuing.transaction.succeeded · transaction_type: REFUND — credits
          back a settled expense (partial or full)
        </div>
        {!refundResult && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <Field
              label="REFUND AMOUNT"
              tip="Leave blank to refund the full original amount."
            >
              <input
                type="number"
                className="input"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                placeholder={`${amount} (full)`}
                min={0.01}
                step={0.01}
                disabled={refundLoading}
              />
            </Field>
            <button
              onClick={handleRefund}
              disabled={refundLoading}
              className="btn btn-primary"
              style={{ opacity: refundLoading ? 0.4 : 1, whiteSpace: "nowrap", marginBottom: 1 }}
            >
              {refundLoading ? "SENDING…" : "SEND REFUND"}
            </button>
          </div>
        )}
        <StepResult result={refundResult} label="REFUND" />
      </div>

      {/* Stage 5 — Reversal */}
      <div
        style={{
          ...PS,
          opacity: hasClearing ? 1 : 0.4,
          pointerEvents: hasClearing ? "auto" : "none",
        }}
      >
        {stageLabel(
          "05",
          "Reversal",
          reversalResult ? (reversalResult.ok ? "ok" : "fail") : null
        )}
        <div
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            fontFamily: "JetBrains Mono, monospace",
            marginBottom: 10,
          }}
        >
          issuing.transaction.succeeded · transaction_type: REVERSAL — voids
          the transaction, schedules GenerateReversalExpenseJob
        </div>
        {!reversalResult && (
          <button
            onClick={handleReversal}
            disabled={reversalLoading}
            className="btn btn-primary"
            style={{ width: "100%", opacity: reversalLoading ? 0.4 : 1 }}
          >
            {reversalLoading ? "SENDING…" : "SEND REVERSAL"}
          </button>
        )}
        <StepResult result={reversalResult} label="REVERSAL" />
      </div>
    </div>
  );
}

// ── Notification webhook panel ──────────────────────────────────────────────────

function NotifWebhookPanel({ url, headers }) {
  const [cardId, setCardId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState(100);
  const [lifecycleId, setLifecycleId] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [notifType, setNotifType] = useState("success");
  const [declineReason, setDeclineReason] = useState("LOW_ACCOUNT_BALANCE");
  const [merchant, setMerchant] = useState(EMPTY_MERCHANT);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const handleSend = async () => {
    if (!url || !cardId) return;
    setSending(true);
    setResult(null);
    try {
      const step = notifType; // "success" | "declined" | "clearing" | "refund" | "reversal"
      const r = await fetch("/api/airwallex/single-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          headers,
          step,
          card_id: cardId,
          account_id: accountId,
          amount,
          currency: "USD",
          lifecycle_id: lifecycleId,
          transaction_id: transactionId,
          auth_code: authCode,
          decline_reason: declineReason,
          ...merchantToRequestFields(merchant),
        }),
      });
      setResult(await r.json());
    } finally {
      setSending(false);
    }
  };

  const PS = {
    background: "var(--bg-surface)",
    border: "1px solid var(--border-subtle)",
    padding: 16,
  };

  return (
    <div style={PS}>
      <SectionTitle>Notification Webhook — Manual Send</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Field label="NOTIFICATION TYPE">
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", border: "1px solid var(--border-strong)" }}>
              {["success", "declined", "clearing"].map((v) => (
                <button key={v} onClick={() => setNotifType(v)} style={{ flex: 1, padding: "7px 4px", fontSize: 11, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", borderRight: "1px solid var(--border-strong)", background: notifType === v ? "var(--accent)" : "transparent", color: notifType === v ? "#fff" : "var(--text-muted)", cursor: "pointer" }}>
                  {v}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", border: "1px solid var(--border-strong)" }}>
              {[
                { value: "refund", label: "REFUND", desc: "settled txn → credit back" },
                { value: "reversal", label: "REVERSAL", desc: "unsettled auth → void" },
              ].map(({ value: v, label, desc }) => (
                <button key={v} onClick={() => setNotifType(v)} style={{ flex: 1, padding: "7px 8px", fontSize: 11, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", borderRight: "1px solid var(--border-strong)", background: notifType === v ? "var(--accent)" : "transparent", color: notifType === v ? "#fff" : "var(--text-muted)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <span>{label}</span>
                  <span style={{ fontSize: 9, fontWeight: 400, textTransform: "none", letterSpacing: 0, color: notifType === v ? "rgba(255,255,255,0.7)" : "var(--border-strong)" }}>{desc}</span>
                </button>
              ))}
            </div>
          </div>
        </Field>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
        >
          <Field label="CARD ID">
            <input
              className="input"
              value={cardId}
              onChange={(e) => setCardId(e.target.value)}
              placeholder="c0c40b8c-…"
              spellCheck={false}
            />
          </Field>
          <Field label="ACCOUNT ID">
            <input
              className="input"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="acct_…"
              spellCheck={false}
            />
          </Field>
          <Field label="LIFECYCLE ID" tip="From Stage 1 Authorization">
            <input
              className="input"
              value={lifecycleId}
              onChange={(e) => setLifecycleId(e.target.value)}
              placeholder="019e07a1-…"
              spellCheck={false}
            />
          </Field>
          <Field label="TRANSACTION ID" tip="From Stage 1 Authorization">
            <input
              className="input"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              placeholder="b5e748f6-…"
              spellCheck={false}
            />
          </Field>
          <Field label="AUTH CODE">
            <input
              className="input"
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value)}
              placeholder="4V02AL"
              spellCheck={false}
            />
          </Field>
          <Field label="AMOUNT">
            <input
              type="number"
              className="input"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              min={1}
              step={0.01}
            />
          </Field>
        </div>
        {notifType === "declined" && (
          <Field label="DECLINE REASON">
            <select
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              className="input"
              style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
            >
              {DECLINE_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </Field>
        )}
        <MerchantFields merchant={merchant} onChange={setMerchant} disabled={sending} />
        <button
          onClick={handleSend}
          disabled={!url || !cardId || sending}
          className="btn btn-primary"
          style={{ opacity: !url || !cardId || sending ? 0.4 : 1 }}
        >
          {sending
            ? "SENDING…"
            : `SEND ${notifType.toUpperCase()} NOTIFICATION`}
        </button>
        <StepResult result={result} label={notifType.toUpperCase()} />
      </div>
    </div>
  );
}

// ── Load test run history ───────────────────────────────────────────────────────

function RunHistoryRow({ run }) {
  const sum = run.summary ?? {};
  const total = sum.total_txns ?? 0;
  const rate = sum.success_rate != null ? sum.success_rate.toFixed(1) : "—";
  const p99 = sum.auth?.all?.p99 ?? sum.confirm?.all?.p99 ?? null;
  const ts = run.started_at
    ? new Date(run.started_at * 1000).toLocaleTimeString()
    : "—";
  const rateNum = parseFloat(rate);
  return (
    <tr style={{ borderTop: "1px solid var(--border-subtle)" }}>
      <td
        style={{
          padding: "8px 12px",
          fontSize: 12,
          fontFamily: "JetBrains Mono, monospace",
          color: "var(--text-muted)",
        }}
      >
        {run.id.slice(0, 8)}
      </td>
      <td
        style={{
          padding: "8px 12px",
          fontSize: 12,
          fontFamily: "JetBrains Mono, monospace",
          color: "var(--text-secondary)",
        }}
      >
        {ts}
      </td>
      <td
        style={{
          padding: "8px 12px",
          fontSize: 12,
          fontFamily: "JetBrains Mono, monospace",
          color: "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {total}
      </td>
      <td
        style={{
          padding: "8px 12px",
          fontSize: 12,
          fontFamily: "JetBrains Mono, monospace",
          fontVariantNumeric: "tabular-nums",
          fontWeight: 700,
          color: rateNum >= 90 ? "var(--ok)" : "var(--danger)",
        }}
      >
        {rate !== "—" ? `${rate}%` : "—"}
      </td>
      <td
        style={{
          padding: "8px 12px",
          fontSize: 12,
          fontFamily: "JetBrains Mono, monospace",
          color: "var(--text-secondary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {p99 != null ? `${Math.round(p99)}ms` : "—"}
      </td>
      <td
        style={{
          padding: "8px 12px",
          fontSize: 12,
          fontFamily: "JetBrains Mono, monospace",
          fontWeight: 700,
          color:
            run.status === "done"
              ? "var(--ok)"
              : run.status === "error"
              ? "var(--danger)"
              : "var(--text-muted)",
        }}
      >
        {run.status?.toUpperCase()}
      </td>
      <td style={{ padding: "8px 12px" }}>
        {run.status === "done" && (
          <a
            href={`/api/runs/${run.id}/export?format=csv`}
            style={{
              fontSize: 11,
              fontFamily: "JetBrains Mono, monospace",
              color: "var(--info)",
              border: "1px solid var(--border-subtle)",
              padding: "2px 8px",
              textDecoration: "none",
            }}
          >
            CSV
          </a>
        )}
      </td>
    </tr>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AirwallexPage() {
  const [tab, setTab] = useState("lifecycle"); // "lifecycle" | "notif" | "load"

  // Shared endpoint config
  const [url, setUrl] = useState(STAGING_URL);
  const [headersText, setHeadersText] = useState("");

  // Load test config
  const [accountIdsText, setAccountIdsText] = useState("");
  const [cardIdsText, setCardIdsText] = useState("");
  const [flowType, setFlowType] = useState("approved");
  const [successRatePct, setSuccessRatePct] = useState(95);
  const [totalTxns, setTotalTxns] = useState(100);
  const [concurrency, setConcurrency] = useState(10);
  const [amountBase, setAmountBase] = useState(100);
  const [amountVariance, setAmountVariance] = useState(40);
  const [deadlineMs, setDeadlineMs] = useState(3000);

  const [dryRunState, setDryRunState] = useState(null);
  const [dryResult, setDryResult] = useState(null);
  const [runStatus, setRunStatus] = useState("idle");
  const [currentRunId, setCurrentRunId] = useState(null);
  const [error, setError] = useState("");
  const [stopping, setStopping] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [wallHistory, setWallHistory] = useState([]);
  const [runHistory, setRunHistory] = useState([]);
  const prevMetrics = useRef(null);

  const { status: wsStatus, lastMessage } = useWebSocket("/ws/metrics");

  useEffect(() => {
    if (!lastMessage) return;
    const { type, data } = lastMessage;
    if (type === "run_started") {
      setCurrentRunId(data.run_id);
      setRunStatus("running");
      setMetrics(null);
      setWallHistory([]);
      setError("");
      prevMetrics.current = null;
    }
    if (type === "metrics") {
      prevMetrics.current = metrics;
      setMetrics(data);
      if (data.wall_clock?.length) setWallHistory(data.wall_clock);
    }
    if (type === "run_complete") {
      setRunStatus("done");
      setStopping(false);
      if (data.summary) setMetrics(data.summary);
      loadHistory();
    }
    if (type === "run_error") {
      setRunStatus("error");
      setError(data.reason ?? "Unknown error");
      setStopping(false);
    }
  }, [lastMessage]);

  const loadHistory = () =>
    fetch("/api/runs")
      .then((r) => r.json())
      .then((rows) =>
        setRunHistory(
          rows
            .filter(
              (r) =>
                r.config?.provider === "airwallex" || r.provider === "airwallex"
            )
            .slice(0, 15)
        )
      )
      .catch(() => {});

  useEffect(() => {
    loadHistory();
  }, []);

  const headers = parseHeaders(headersText);

  const buildLoadConfig = () => ({
    auth_url: url,
    auth_headers: headers,
    account_ids: parseList(accountIdsText),
    card_ids: parseList(cardIdsText),
    flow_type: flowType,
    success_rate: successRatePct,
    amount_base: amountBase,
    amount_variance: amountVariance,
    concurrency,
    total_txns: totalTxns,
    deadline_ms: deadlineMs,
  });

  const handleDryRun = async () => {
    if (!url) {
      setError("Enter URL");
      return;
    }
    setDryRunState("running");
    setDryResult(null);
    setError("");
    try {
      const r = await fetch("/api/airwallex/dry-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auth_url: url,
          auth_headers: headers,
          card_id: parseList(cardIdsText)[0] ?? "",
          account_id: parseList(accountIdsText)[0] ?? "",
          amount_base: amountBase,
          flow_type: flowType,
        }),
      });
      const data = await r.json();
      setDryResult(
        r.ok
          ? data
          : { ok: false, results: {}, error: data.detail ?? "Request failed" }
      );
    } catch (e) {
      setDryResult({ ok: false, results: {}, error: String(e) });
    } finally {
      setDryRunState("done");
    }
  };

  const handleStart = async () => {
    setRunStatus("starting");
    setError("");
    setMetrics(null);
    setWallHistory([]);
    try {
      const r = await fetch("/api/airwallex/runs/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildLoadConfig()),
      });
      const data = await r.json();
      if (!r.ok) {
        setRunStatus("idle");
        setError(data.detail ?? "Failed to start");
      }
    } catch (e) {
      setRunStatus("idle");
      setError(String(e));
    }
  };

  const handleStop = async () => {
    if (!currentRunId) return;
    setStopping(true);
    try {
      await fetch(`/api/runs/${currentRunId}/stop`, { method: "POST" });
    } catch {}
  };

  const isRunning = runStatus === "running";
  const canStart =
    dryResult?.ok &&
    (runStatus === "idle" || runStatus === "done" || runStatus === "error");

  const m = metrics ?? {};
  const authSnap = m.auth?.all ?? {};
  const totalDone = m.total_txns ?? 0;
  const successRateDisplay =
    m.success_rate != null ? m.success_rate.toFixed(1) + "%" : "—";
  const p99Auth = authSnap.p99 != null ? Math.round(authSnap.p99) + "ms" : "—";
  const tps = m.throughput != null ? m.throughput.toFixed(1) : "—";
  const breachRate =
    m.deadline_breach_rate != null
      ? m.deadline_breach_rate.toFixed(1) + "%"
      : "—";
  const breachIsHigh =
    m.deadline_breach_rate != null && m.deadline_breach_rate > 5;

  const PS = {
    background: "var(--bg-surface)",
    border: "1px solid var(--border-subtle)",
    padding: 16,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        color: "var(--text-primary)",
        fontFamily: "'Inter Tight', Inter, sans-serif",
      }}
    >
      <main style={{ padding: "24px", maxWidth: 1400, margin: "0 auto" }}>
        <div
          style={{ display: "grid", gridTemplateColumns: "2fr 3fr", gap: 24 }}
        >
          {/* ── LEFT ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Endpoint */}
            <div style={PS}>
              <SectionTitle>Endpoint</SectionTitle>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                <Field label="URL" tip="Volopay Airwallex callback endpoint.">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="input"
                  />
                </Field>
                <Field
                  label="HEADERS"
                  tip="Extra HTTP headers. Format: Header-Name: value, one per line."
                >
                  <textarea
                    rows={2}
                    value={headersText}
                    onChange={(e) => setHeadersText(e.target.value)}
                    placeholder="Authorization: Bearer <token>"
                    className="textarea"
                    spellCheck={false}
                  />
                </Field>
              </div>
            </div>

            {/* Tab switcher */}
            <div
              style={{
                display: "flex",
                border: "1px solid var(--border-strong)",
              }}
            >
              {[
                { value: "lifecycle", label: "LIFECYCLE" },
                { value: "notif", label: "NOTIFICATION" },
                { value: "load", label: "LOAD TEST" },
              ].map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTab(t.value)}
                  style={{
                    flex: 1,
                    padding: "9px 4px",
                    fontSize: 11,
                    fontFamily: "JetBrains Mono, monospace",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    borderRight: "1px solid var(--border-strong)",
                    background:
                      tab === t.value ? "var(--accent)" : "transparent",
                    color: tab === t.value ? "#fff" : "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "lifecycle" && (
              <LifecyclePanel url={url} headers={headers} />
            )}
            {tab === "notif" && (
              <NotifWebhookPanel url={url} headers={headers} />
            )}

            {tab === "load" && (
              <>
                {/* Load config */}
                <div style={PS}>
                  <SectionTitle>Transaction Config</SectionTitle>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    <Field
                      label="ACCOUNT IDS"
                      tip="Airwallex account IDs to rotate."
                    >
                      <textarea
                        rows={2}
                        value={accountIdsText}
                        onChange={(e) => setAccountIdsText(e.target.value)}
                        placeholder={"acct_abc\nacct_xyz"}
                        className="textarea"
                        disabled={isRunning}
                        spellCheck={false}
                      />
                    </Field>
                    <Field label="CARD IDS" tip="Airwallex card IDs to rotate.">
                      <textarea
                        rows={2}
                        value={cardIdsText}
                        onChange={(e) => setCardIdsText(e.target.value)}
                        placeholder={"card_abc\ncard_xyz"}
                        className="textarea"
                        disabled={isRunning}
                        spellCheck={false}
                      />
                    </Field>
                    <Field label="FLOW TYPE">
                      <SegControl
                        value={flowType}
                        onChange={setFlowType}
                        disabled={isRunning}
                        options={[
                          { value: "approved", label: "APPROVED" },
                          { value: "declined", label: "DECLINED" },
                          { value: "random", label: "RANDOM" },
                        ]}
                      />
                    </Field>
                    {flowType === "random" && (
                      <>
                        <Field label={`SUCCESS RATE — ${successRatePct}%`}>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={successRatePct}
                            onChange={(e) =>
                              setSuccessRatePct(Number(e.target.value))
                            }
                            disabled={isRunning}
                            style={{
                              width: "100%",
                              accentColor: "var(--accent)",
                            }}
                          />
                        </Field>
                        <div
                          style={{
                            background: "var(--info-dim)",
                            border: "1px solid var(--info)",
                            padding: "6px 10px",
                            fontSize: 11,
                            fontFamily: "JetBrains Mono, monospace",
                            color: "var(--info)",
                          }}
                        >
                          {successRatePct}% approved · {100 - successRatePct}%
                          declined
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Load params */}
                <div style={PS}>
                  <SectionTitle>Load Parameters</SectionTitle>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                    }}
                  >
                    <Field label="TOTAL TXNs">
                      <input
                        type="number"
                        value={totalTxns}
                        onChange={(e) => setTotalTxns(Number(e.target.value))}
                        min={1}
                        max={100000}
                        className="input"
                        disabled={isRunning}
                      />
                    </Field>
                    <Field label="CONCURRENCY">
                      <input
                        type="number"
                        value={concurrency}
                        onChange={(e) => setConcurrency(Number(e.target.value))}
                        min={1}
                        max={500}
                        className="input"
                        disabled={isRunning}
                      />
                    </Field>
                    <Field label="AMOUNT BASE ($)">
                      <input
                        type="number"
                        value={amountBase}
                        onChange={(e) => setAmountBase(Number(e.target.value))}
                        min={1}
                        step={1}
                        className="input"
                        disabled={isRunning}
                      />
                    </Field>
                    <Field label="VARIANCE (±$)">
                      <input
                        type="number"
                        value={amountVariance}
                        onChange={(e) =>
                          setAmountVariance(Number(e.target.value))
                        }
                        min={0}
                        step={1}
                        className="input"
                        disabled={isRunning}
                      />
                    </Field>
                    <Field label="DEADLINE (ms)">
                      <input
                        type="number"
                        value={deadlineMs}
                        onChange={(e) => setDeadlineMs(Number(e.target.value))}
                        min={100}
                        step={100}
                        className="input"
                        disabled={isRunning}
                      />
                    </Field>
                  </div>
                </div>

                {/* Actions */}
                <div style={PS}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={handleDryRun}
                      disabled={!url || dryRunState === "running" || isRunning}
                      className="btn btn-ghost"
                      style={{
                        flex: 1,
                        opacity:
                          !url || dryRunState === "running" || isRunning
                            ? 0.4
                            : 1,
                      }}
                    >
                      {dryRunState === "running" ? "TESTING…" : "DRY TEST"}
                    </button>
                    {!isRunning && (
                      <button
                        onClick={canStart ? handleStart : undefined}
                        disabled={!canStart || runStatus === "starting"}
                        className={`btn ${
                          canStart ? "btn-primary" : "btn-ghost"
                        }`}
                        style={{
                          flex: 1,
                          opacity:
                            !canStart || runStatus === "starting" ? 0.4 : 1,
                          cursor: canStart ? "pointer" : "not-allowed",
                        }}
                      >
                        {runStatus === "starting"
                          ? "STARTING…"
                          : "START LOAD TEST"}
                      </button>
                    )}
                    {isRunning && (
                      <button
                        onClick={handleStop}
                        disabled={stopping}
                        className="btn btn-danger"
                        style={{ flex: 1, opacity: stopping ? 0.5 : 1 }}
                      >
                        {stopping ? "STOPPING…" : "STOP"}
                      </button>
                    )}
                  </div>
                  {!dryResult && !isRunning && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        textAlign: "center",
                        marginTop: 10,
                        fontFamily: "JetBrains Mono, monospace",
                      }}
                    >
                      DRY TEST → validate endpoint → START LOAD TEST
                    </div>
                  )}
                  {error && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--danger)",
                        border: "1px solid var(--danger)",
                        background: "var(--danger-dim)",
                        padding: "8px 12px",
                        marginTop: 10,
                        fontFamily: "JetBrains Mono, monospace",
                      }}
                    >
                      {error}
                    </div>
                  )}
                  {dryResult && (
                    <div
                      style={{
                        marginTop: 10,
                        border: `1px solid ${
                          dryResult.ok ? "var(--ok)" : "var(--danger)"
                        }`,
                        background: dryResult.ok
                          ? "var(--ok-dim)"
                          : "var(--danger-dim)",
                        padding: "8px 12px",
                        fontSize: 12,
                        fontFamily: "JetBrains Mono, monospace",
                        fontWeight: 700,
                        color: dryResult.ok ? "var(--ok)" : "var(--danger)",
                      }}
                    >
                      {dryResult.ok
                        ? "✓ DRY RUN PASSED"
                        : `✗ DRY RUN FAILED — ${dryResult.error ?? ""}`}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── RIGHT: Metrics ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {tab === "load" && (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 12,
                  }}
                >
                  <StatNum
                    label="COMPLETED"
                    value={totalDone || "—"}
                    sub={
                      totalTxns > 0 && isRunning ? `of ${totalTxns}` : undefined
                    }
                    flash={!!metrics}
                  />
                  <StatNum label="TPS" value={tps} flash={!!metrics} />
                  <StatNum
                    label="AUTH P99"
                    value={p99Auth}
                    flash={!!metrics}
                    danger={breachIsHigh}
                  />
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 12,
                  }}
                >
                  <StatNum
                    label="SUCCESS RATE"
                    value={successRateDisplay}
                    flash={!!metrics}
                  />
                  <StatNum
                    label="DEADLINE BREACH"
                    value={breachRate}
                    flash={!!metrics}
                    danger={breachIsHigh}
                  />
                  <StatNum label="CONCURRENCY" value={concurrency} />
                </div>

                {wallHistory.length > 0 && (
                  <div
                    style={{ ...PS, position: "relative", overflow: "hidden" }}
                  >
                    {isRunning && <div className="scanline-overlay" />}
                    <SectionTitle>P99 Over Time</SectionTitle>
                    <WallClockChart data={wallHistory} />
                  </div>
                )}

                {runStatus === "idle" && !metrics && (
                  <div style={{ ...PS, padding: 40, textAlign: "center" }}>
                    <div
                      style={{
                        fontSize: 11,
                        fontFamily: "JetBrains Mono, monospace",
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.12em",
                      }}
                    >
                      CONFIGURE → DRY TEST → START LOAD TEST
                    </div>
                  </div>
                )}

                {runHistory.length > 0 && (
                  <div
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div
                      style={{
                        padding: "10px 16px",
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: "JetBrains Mono, monospace",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                          color: "var(--text-muted)",
                        }}
                      >
                        Recent Runs
                      </span>
                    </div>
                    <table
                      style={{ width: "100%", borderCollapse: "collapse" }}
                    >
                      <thead>
                        <tr style={{ background: "var(--bg-surface-2)" }}>
                          {[
                            "Run",
                            "Time",
                            "Txns",
                            "Success",
                            "P99",
                            "Status",
                            "",
                          ].map((h) => (
                            <th
                              key={h}
                              style={{
                                padding: "7px 12px",
                                textAlign: "left",
                                fontSize: 11,
                                fontFamily: "JetBrains Mono, monospace",
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                color: "var(--text-muted)",
                                borderBottom: "1px solid var(--border-subtle)",
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {runHistory.map((run) => (
                          <RunHistoryRow key={run.id} run={run} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {(tab === "lifecycle" || tab === "notif") && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {tab === "lifecycle" ? (
                  <>
                    {/* Flow title */}
                    <div style={{ ...PS, paddingBottom: 12 }}>
                      <SectionTitle>Transaction Lifecycle</SectionTitle>
                      <div style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--text-muted)", lineHeight: 1.7 }}>
                        A card transaction follows three sequential webhooks. Each stage must succeed before the next is sent.
                        Use the panel on the left to fire them in order.
                      </div>
                    </div>

                    {/* Stage 1 */}
                    <div style={{ ...PS, borderLeft: "3px solid var(--info)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: "var(--info)", background: "var(--info-dim)", border: "1px solid var(--info)", padding: "1px 7px" }}>STAGE 1</span>
                        <span style={{ fontSize: 12, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Authorization</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                          Airwallex asks Volopay <em style={{ color: "var(--info)" }}>synchronously</em>: "Should I approve this transaction?"
                          Volopay checks card status, budgets, MCC rules, and PPI limits in real time, then responds within the timeout window.
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                          <div style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--text-muted)" }}>
                            <span style={{ color: "var(--text-secondary)" }}>Method</span> — POST · <span style={{ color: "var(--info)" }}>transaction_type: AUTHORIZATION</span>
                          </div>
                          <div style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--text-muted)" }}>
                            <span style={{ color: "var(--text-secondary)" }}>On approve</span> — SpendAuth created, funds locked, responds AUTHORIZED
                          </div>
                          <div style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--text-muted)" }}>
                            <span style={{ color: "var(--text-secondary)" }}>On decline</span> — responds DECLINED with a reason code; no expense created
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Arrow */}
                    <div style={{ textAlign: "center", fontSize: 14, color: "var(--border-strong)", lineHeight: 1 }}>↓</div>

                    {/* Stage 2 */}
                    <div style={{ ...PS, borderLeft: "3px solid var(--accent)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: "var(--accent)", background: "rgba(99,102,241,0.12)", border: "1px solid var(--accent)", padding: "1px 7px" }}>STAGE 2</span>
                        <span style={{ fontSize: 12, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Auth Result Notification</span>
                      </div>
                      <div style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 8 }}>
                        Airwallex tells Volopay <em style={{ color: "var(--accent)" }}>asynchronously</em> what happened with the authorization.
                        Volopay uses this to create or decline the expense record.
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <div style={{ flex: 1, background: "var(--ok-dim)", border: "1px solid var(--ok)", padding: "8px 10px" }}>
                          <div style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: "var(--ok)", marginBottom: 4 }}>✓ SUCCEEDED</div>
                          <div style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                            <span style={{ color: "var(--text-muted)" }}>event:</span> issuing.transaction.succeeded<br />
                            <span style={{ color: "var(--text-muted)" }}>type:</span> AUTHORIZATION<br />
                            Expense is created; transaction moves to unsettled state.
                          </div>
                        </div>
                        <div style={{ flex: 1, background: "var(--danger-dim)", border: "1px solid var(--danger)", padding: "8px 10px" }}>
                          <div style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: "var(--danger)", marginBottom: 4 }}>✗ FAILED</div>
                          <div style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                            <span style={{ color: "var(--text-muted)" }}>event:</span> issuing.transaction.failed<br />
                            <span style={{ color: "var(--text-muted)" }}>type:</span> AUTHORIZATION<br />
                            Expense is marked declined; SpendAuth is released.
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--text-muted)", marginTop: 8, background: "var(--bg-surface-2)", border: "1px solid var(--border-subtle)", padding: "5px 9px" }}>
                        Stage 3 is only reachable if Stage 2 resolved as <strong style={{ color: "var(--ok)" }}>succeeded</strong>.
                      </div>
                    </div>

                    {/* Arrow */}
                    <div style={{ textAlign: "center", fontSize: 14, color: "var(--border-strong)", lineHeight: 1 }}>↓</div>

                    {/* Stage 3 */}
                    <div style={{ ...PS, borderLeft: "3px solid var(--ok)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: "var(--ok)", background: "var(--ok-dim)", border: "1px solid var(--ok)", padding: "1px 7px" }}>STAGE 3</span>
                        <span style={{ fontSize: 12, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Clearing</span>
                      </div>
                      <div style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 8 }}>
                        The card network settles the transaction. Airwallex sends a clearing webhook which triggers Volopay to create a
                        settlement record and finalize the expense amount (which may differ from the authorized amount due to FX or partial capture).
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--text-muted)" }}>
                          <span style={{ color: "var(--text-secondary)" }}>event</span> — issuing.transaction.succeeded · <span style={{ color: "var(--ok)" }}>transaction_type: CLEARING</span>
                        </div>
                        <div style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--text-muted)" }}>
                          <span style={{ color: "var(--text-secondary)" }}>matched_authorizations</span> — links back to the Stage 1 transaction_id
                        </div>
                        <div style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--text-muted)" }}>
                          <span style={{ color: "var(--text-secondary)" }}>billing_amount</span> — final settled amount; may differ from auth amount
                        </div>
                        <div style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--text-muted)" }}>
                          <span style={{ color: "var(--text-secondary)" }}>result</span> — SettlementRecord created; expense moves to settled state
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ ...PS }}>
                    <SectionTitle>Notification Webhook</SectionTitle>
                    <div style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--text-muted)", lineHeight: 1.8, marginBottom: 12 }}>
                      Send any Stage 2 or Stage 3 notification independently — useful for replaying dropped webhooks or testing edge cases without running the full lifecycle.
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {[
                        { label: "SUCCESS", color: "var(--ok)", bg: "var(--ok-dim)", desc: "issuing.transaction.succeeded · type: AUTHORIZATION — creates a new unsettled expense linked to lifecycle_id." },
                        { label: "DECLINED", color: "var(--danger)", bg: "var(--danger-dim)", desc: "issuing.transaction.failed · type: AUTHORIZATION — marks the pending expense as declined; SpendAuth released." },
                        { label: "CLEARING", color: "var(--info)", bg: "var(--info-dim)", desc: "issuing.transaction.succeeded · type: CLEARING — creates a SettlementRecord; expense moves to settled." },
                        { label: "REFUND", color: "var(--accent)", bg: "rgba(99,102,241,0.08)", desc: "issuing.transaction.succeeded · type: REFUND — same path as CLEARING. billing_amount is positive (credit back). Triggers purchase_reversal expense." },
                        { label: "REVERSAL", color: "var(--text-muted)", bg: "var(--bg-surface-2)", desc: "issuing.transaction.succeeded · type: REVERSAL — voids an unsettled authorization. Schedules GenerateReversalExpenseJob. billing_amount is positive." },
                      ].map(({ label, color, bg, desc }) => (
                        <div key={label} style={{ background: bg, border: `1px solid ${color}`, padding: "8px 10px", display: "flex", gap: 10, alignItems: "flex-start" }}>
                          <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color, whiteSpace: "nowrap", marginTop: 1 }}>{label}</span>
                          <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--text-secondary)", lineHeight: 1.6 }}>{desc}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 12, fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--text-muted)", background: "var(--bg-surface-2)", border: "1px solid var(--border-subtle)", padding: "7px 10px", lineHeight: 1.7 }}>
                      <strong style={{ color: "var(--text-secondary)" }}>lifecycle_id</strong> is the primary key Volopay uses to find the parent expense.
                      If the lookup fails, <strong style={{ color: "var(--text-secondary)" }}>matched_authorizations</strong> (transaction_id from Stage 1) is the fallback.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
