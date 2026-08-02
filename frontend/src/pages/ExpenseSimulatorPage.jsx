import { useState } from "react";

// ── scenario definitions (client-facing language) ──────────────────────────────
const SCENARIOS = [
  {
    id: "create",
    title: "Create expense",
    blurb: "Authorization only. Creates a pending (unsettled) expense.",
    steps: "auth",
  },
  {
    id: "settle",
    title: "Create + settle",
    blurb: "Authorization then settlement. Expense becomes settled.",
    steps: "auth → settle",
  },
  {
    id: "decline",
    title: "Decline an expense",
    blurb: "Authorization expected to be rejected. The card must be configured to decline (block policy / limit).",
    steps: "auth (expect decline)",
  },
  {
    id: "refund",
    title: "Refund an expense",
    blurb: "Settle an expense, then issue a refund (a new negative expense).",
    steps: "auth → settle → refund",
  },
];

const MCC_PRESETS = [
  { code: "6011", label: "ATM / cash" },
  { code: "5411", label: "Grocery" },
  { code: "5812", label: "Restaurant" },
  { code: "4121", label: "Taxi / rideshare" },
  { code: "5045", label: "Electronics" },
  { code: "0000", label: "UPI personal (block)" },
];

function stepDot(ok) {
  const color = ok ? "var(--ok)" : "var(--danger)";
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        display: "inline-block",
      }}
    />
  );
}

function StepCard({ res }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="panel-2"
      style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
        onClick={() => setOpen((o) => !o)}
      >
        {stepDot(res.ok)}
        <span
          style={{
            fontSize: 12,
            fontFamily: "JetBrains Mono, monospace",
            fontWeight: 700,
            color: "var(--text-primary)",
            flex: 1,
          }}
        >
          {res.label || res.step}
        </span>
        <span
          style={{
            fontSize: 11,
            fontFamily: "JetBrains Mono, monospace",
            color: res.ok ? "var(--ok)" : "var(--danger)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {res.status} · {res.latency_ms}ms {open ? "▾" : "▸"}
        </span>
      </div>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Collapsible title="RESPONSE" data={res.response} />
          <Collapsible title="PAYLOAD SENT" data={res.payload} />
        </div>
      )}
    </div>
  );
}

function Collapsible({ title, data }) {
  return (
    <div>
      <div className="label" style={{ marginBottom: 4 }}>{title}</div>
      <pre
        style={{
          margin: 0,
          background: "var(--bg-base)",
          border: "1px solid var(--border-subtle)",
          padding: "8px 10px",
          fontSize: 10.5,
          fontFamily: "JetBrains Mono, monospace",
          color: "var(--text-secondary)",
          overflowX: "auto",
          maxHeight: 220,
          overflowY: "auto",
        }}
      >
        {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

export default function ExpenseSimulatorPage({ showEndpointFields = false }) {
  const [scenario, setScenario] = useState("settle");
  const [txnType, setTxnType] = useState("card");
  const [amount, setAmount] = useState(5000);
  const [cardRef, setCardRef] = useState("");
  const [payeeVpa, setPayeeVpa] = useState("");
  const [mcc, setMcc] = useState("6011");
  const [merchant, setMerchant] = useState(""); // blank = random
  const [authUrl, setAuthUrl] = useState("");
  const [notifUrl, setNotifUrl] = useState("");

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const isUpi = txnType === "upi";
  const active = SCENARIOS.find((s) => s.id === scenario);

  const run = async () => {
    setError("");
    setResult(null);
    setBusy(true);
    try {
      const body = {
        scenario,
        txn_type: txnType,
        amount: Number(amount),
        mcc,
        merchant_name: merchant,
        card_ref: cardRef,
        payee_vpa: payeeVpa,
        auth_url: authUrl,
        notification_url: notifUrl || null,
      };
      const r = await fetch("/api/pinelabs/scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.detail || `Request failed (${r.status})`);
      }
      setResult(await r.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // In client mode (endpoint fields hidden) URLs come from server config, so we
  // don't require them here. In admin mode they must be entered.
  const urlsOk = showEndpointFields
    ? authUrl && (scenario === "create" || scenario === "decline" || notifUrl)
    : true;
  const canRun = urlsOk && (isUpi ? true : cardRef);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px 64px" }}>
      <h1
        style={{
          fontSize: 15,
          fontFamily: "JetBrains Mono, monospace",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--text-primary)",
          textAlign: "center",
          marginBottom: 4,
        }}
      >
        Create an expense simulation
      </h1>
      <p
        style={{
          textAlign: "center",
          fontSize: 12,
          color: "var(--text-muted)",
          marginBottom: 24,
        }}
      >
        Pick a scenario, fill the details, and run. The exact PineLabs callbacks fire.
      </p>

      {/* scenario picker */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 10,
          marginBottom: 20,
        }}
      >
        {SCENARIOS.map((s) => {
          const on = s.id === scenario;
          return (
            <button
              key={s.id}
              onClick={() => { setScenario(s.id); setResult(null); }}
              style={{
                textAlign: "left",
                padding: "12px 14px",
                cursor: "pointer",
                background: on ? "var(--accent-glow)" : "var(--bg-surface)",
                border: `1px solid ${on ? "var(--accent)" : "var(--border-subtle)"}`,
                borderRadius: 4,
              }}
            >
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 700,
                  fontFamily: "JetBrains Mono, monospace",
                  color: on ? "var(--accent)" : "var(--text-primary)",
                  marginBottom: 4,
                }}
              >
                {s.title}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>
                {s.blurb}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-secondary)",
                  fontFamily: "JetBrains Mono, monospace",
                  marginTop: 6,
                }}
              >
                {s.steps}
              </div>
            </button>
          );
        })}
      </div>

      {/* inputs */}
      <div className="panel" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
        {/* txn type */}
        <div style={{ display: "flex", gap: 8 }}>
          {["card", "upi"].map((t) => (
            <button
              key={t}
              onClick={() => setTxnType(t)}
              className="btn"
              style={{
                flex: 1,
                background: txnType === t ? "var(--accent)" : "transparent",
                color: txnType === t ? "#fff" : "var(--text-muted)",
                border: "1px solid var(--border-strong)",
              }}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Labeled label="AMOUNT (₹)">
            <input className="input" type="number" value={amount}
              onChange={(e) => setAmount(e.target.value)} />
          </Labeled>
          <Labeled label="MCC">
            <select className="input" value={mcc} onChange={(e) => setMcc(e.target.value)}
              style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>
              {MCC_PRESETS.map((m) => (
                <option key={m.code} value={m.code}>{m.code} — {m.label}</option>
              ))}
            </select>
          </Labeled>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {isUpi ? (
            <Labeled label="PAYEE VPA">
              <input className="input" value={payeeVpa} placeholder="name@upi"
                onChange={(e) => setPayeeVpa(e.target.value)} spellCheck={false} />
            </Labeled>
          ) : (
            <Labeled label="CARD REFERENCE">
              <input className="input" value={cardRef} placeholder="6204430025899918"
                onChange={(e) => setCardRef(e.target.value)} spellCheck={false} />
            </Labeled>
          )}
          <Labeled label="MERCHANT (blank = random)">
            <input className="input" value={merchant} placeholder="RAPIDO"
              onChange={(e) => setMerchant(e.target.value)} spellCheck={false} />
          </Labeled>
        </div>

        {showEndpointFields && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Labeled label="AUTH CALLBACK URL">
              <input className="input" value={authUrl}
                placeholder="https://<host>/api/v1/callbacks/pinelabs-authorize"
                onChange={(e) => setAuthUrl(e.target.value)} spellCheck={false} />
            </Labeled>
            <Labeled label="NOTIFICATION CALLBACK URL">
              <input className="input" value={notifUrl}
                placeholder="https://<host>/api/v1/callbacks/pinelabs-txn-notifications"
                onChange={(e) => setNotifUrl(e.target.value)} spellCheck={false} />
            </Labeled>
          </div>
        )}

        {scenario === "decline" && (
          <div
            style={{
              fontSize: 11,
              color: "var(--warn)",
              background: "var(--warn-dim)",
              border: "1px solid var(--warn)",
              padding: "8px 10px",
              lineHeight: 1.5,
            }}
          >
            ⚠ A decline can't be forced from the payload. Use an amount above the
            card/limit, or target a card configured to reject (block policy / low
            budget) in the controller.
          </div>
        )}
      </div>

      {/* run */}
      <button
        onClick={run}
        className="btn btn-primary"
        disabled={busy || !canRun}
        style={{ width: "100%", padding: "12px", opacity: busy || !canRun ? 0.5 : 1 }}
      >
        {busy ? "RUNNING SIMULATION…" : "▶  RUN SIMULATION"}
      </button>

      {error && (
        <div
          style={{
            marginTop: 14, fontSize: 11, color: "var(--danger)",
            fontFamily: "JetBrains Mono, monospace",
            background: "var(--danger-dim)", border: "1px solid var(--danger)",
            padding: "8px 10px",
          }}
        >
          {error}
        </div>
      )}

      {/* results timeline */}
      {result && (
        <div style={{ marginTop: 24 }}>
          <div
            style={{
              display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
            }}
          >
            {stepDot(result.ok)}
            <span
              style={{
                fontSize: 12, fontFamily: "JetBrains Mono, monospace",
                fontWeight: 700, color: result.ok ? "var(--ok)" : "var(--danger)",
                textTransform: "uppercase", letterSpacing: "0.08em",
              }}
            >
              {result.ok ? "Simulation succeeded" : "Simulation did not fully succeed"}
            </span>
            {result.link_key && (
              <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>
                {result.link_key.type}: {String(result.link_key.value)}
              </span>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {result.steps.map((s, i) => <StepCard key={i} res={s} />)}
          </div>
          {result.note && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 12, lineHeight: 1.5 }}>
              {result.note}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Labeled({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
